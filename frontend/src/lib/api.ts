type QueryValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | Array<string | number | boolean | null | undefined>;

export type ApiQueryParams = Record<string, QueryValue>;

export interface ApiRequestOptions extends Omit<
    RequestInit,
    "body" | "credentials" | "headers" | "method"
> {
    body?: BodyInit | object | unknown[] | null;
    headers?: HeadersInit;
    query?: ApiQueryParams;
}

export class ApiError<T = unknown> extends Error {
    readonly status: number;
    readonly data: T;
    readonly response: Response;

    constructor(message: string, status: number, data: T, response: Response) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
        this.response = response;
    }
}

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:1234";

function createUrl(path: string, query?: ApiQueryParams): string {
    const url = new URL(path, API_BASE_URL);

    if (!query) {
        return url.toString();
    }

    for (const [key, value] of Object.entries(query)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                if (item !== null && item !== undefined) {
                    url.searchParams.append(key, String(item));
                }
            }

            continue;
        }

        if (value !== null && value !== undefined) {
            url.searchParams.set(key, String(value));
        }
    }

    return url.toString();
}

function isBodyInit(
    value: NonNullable<ApiRequestOptions["body"]>
): value is BodyInit {
    return (
        typeof value === "string" ||
        value instanceof Blob ||
        value instanceof FormData ||
        value instanceof URLSearchParams ||
        value instanceof ArrayBuffer ||
        ArrayBuffer.isView(value)
    );
}

function serializeBody(
    body: ApiRequestOptions["body"],
    headers: Headers
): BodyInit | undefined {
    if (body === null || body === undefined) {
        return undefined;
    }

    if (isBodyInit(body)) {
        return body;
    }

    if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    return JSON.stringify(body);
}

async function parseResponse(response: Response): Promise<unknown> {
    if (response.status === 204 || response.status === 205) {
        return undefined;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
        return response.json();
    }

    if (contentType.startsWith("text/")) {
        return response.text();
    }

    return response.blob();
}

async function send<T>(
    method: string,
    path: string,
    options: ApiRequestOptions = {}
): Promise<T> {
    const { body, headers, query, ...init } = options;
    const requestHeaders = new Headers(headers);
    const response = await fetch(createUrl(path, query), {
        ...init,
        method,
        body: serializeBody(body, requestHeaders),
        credentials: "include",
        headers: requestHeaders
    });
    const data = await parseResponse(response);

    if (!response.ok) {
        throw new ApiError(
            response.statusText || "Request failed",
            response.status,
            data,
            response
        );
    }

    return data as T;
}

export const api = {
    request<T>(method: string, path: string, options?: ApiRequestOptions) {
        return send<T>(method, path, options);
    },
    get<T>(path: string, options?: ApiRequestOptions) {
        return send<T>("GET", path, options);
    },
    post<T>(path: string, options?: ApiRequestOptions) {
        return send<T>("POST", path, options);
    },
    push<T>(path: string, options?: ApiRequestOptions) {
        return send<T>("POST", path, options);
    },
    put<T>(path: string, options?: ApiRequestOptions) {
        return send<T>("PUT", path, options);
    },
    patch<T>(path: string, options?: ApiRequestOptions) {
        return send<T>("PATCH", path, options);
    },
    delete<T>(path: string, options?: ApiRequestOptions) {
        return send<T>("DELETE", path, options);
    }
};

export default api;
