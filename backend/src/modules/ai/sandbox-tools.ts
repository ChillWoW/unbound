import { createHash } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";

const SANDBOX_CODE_MAX_LENGTH = 12_000;
const SANDBOX_OUTPUT_MAX_LENGTH = 12_000;
const SANDBOX_INSTALL_LOG_MAX_LENGTH = 8_000;
const SANDBOX_TIMEOUT_MS = 30_000;
const SANDBOX_SESSION_ID_PREFIX = "unbound_py";

const SANDBOX_SESSION_MODES = ["reuse", "reset", "fresh"] as const;

const SANDBOX_ALLOWED_PACKAGES = [
    "httpx",
    "networkx",
    "plotly",
    "requests",
    "sympy"
] as const;

type SandboxSessionMode = (typeof SANDBOX_SESSION_MODES)[number];
type SandboxAllowedPackage = (typeof SANDBOX_ALLOWED_PACKAGES)[number];

type SandboxJsonRecord = Record<string, unknown>;

class SandboxHttpError extends Error {
    readonly status: number;
    readonly detail: unknown;

    constructor(status: number, detail: unknown, fallbackMessage: string) {
        super(extractErrorMessage(detail, fallbackMessage));
        this.name = "SandboxHttpError";
        this.status = status;
        this.detail = detail;
    }
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function truncateMultiline(value: string, maxLength: number) {
    const normalized = value.replace(/\r\n/g, "\n").trim();
    const content = truncateText(normalized, maxLength);

    return {
        content,
        truncated: normalized.length > content.length,
        contentLength: content.length
    };
}

function extractErrorMessage(detail: unknown, fallback: string): string {
    if (typeof detail === "string") {
        return detail.trim() || fallback;
    }

    if (detail && typeof detail === "object") {
        const record = detail as SandboxJsonRecord;

        if (typeof record.detail === "string" && record.detail.trim()) {
            return record.detail.trim();
        }

        if (typeof record.message === "string" && record.message.trim()) {
            return record.message.trim();
        }

        if (typeof record.error === "string" && record.error.trim()) {
            return record.error.trim();
        }
    }

    return fallback;
}

function formatTraceback(detail: unknown): string {
    if (!detail || typeof detail !== "object") {
        return "";
    }

    const record = detail as SandboxJsonRecord;
    const traceback = Array.isArray(record.traceback)
        ? record.traceback.filter((entry): entry is string => typeof entry === "string")
        : [];

    return traceback.join("\n").trim();
}

function buildSandboxSessionId(conversationId: string, userId: string): string {
    const digest = createHash("sha256")
        .update(`${userId}:${conversationId}`)
        .digest("hex")
        .slice(0, 24);

    return `${SANDBOX_SESSION_ID_PREFIX}_${digest}`;
}

function getSandboxBaseUrl(): string {
    if (!env.sandboxUrl) {
        throw new Error("Python sandbox is not configured.");
    }

    try {
        return new URL(env.sandboxUrl).toString();
    } catch {
        throw new Error("SANDBOX_URL is invalid.");
    }
}

function createRequestSignal(
    timeoutMs: number,
    abortSignal?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const abortFromParent = () => controller.abort();

    if (abortSignal) {
        if (abortSignal.aborted) {
            controller.abort();
        } else {
            abortSignal.addEventListener("abort", abortFromParent, {
                once: true
            });
        }
    }

    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timeoutId);

            if (abortSignal) {
                abortSignal.removeEventListener("abort", abortFromParent);
            }
        }
    };
}

async function requestSandboxJson(input: {
    baseUrl: string;
    path: string;
    method?: "POST";
    jsonBody?: unknown;
    formData?: FormData;
    abortSignal?: AbortSignal;
    timeoutMs?: number;
}) {
    const requestUrl = new URL(input.path, input.baseUrl).toString();
    const { signal, cleanup } = createRequestSignal(
        input.timeoutMs ?? SANDBOX_TIMEOUT_MS,
        input.abortSignal
    );

    try {
        const response = await fetch(requestUrl, {
            method: input.method ?? "POST",
            headers: input.jsonBody
                ? {
                      Accept: "application/json",
                      "Content-Type": "application/json"
                  }
                : { Accept: "application/json" },
            body: input.formData ?? (input.jsonBody ? JSON.stringify(input.jsonBody) : undefined),
            signal
        });

        const contentType = response.headers.get("content-type") ?? "";
        const payload = contentType.includes("application/json")
            ? await response.json().catch(() => null)
            : await response.text().catch(() => "");

        if (!response.ok) {
            throw new SandboxHttpError(
                response.status,
                payload,
                `Sandbox request failed with status ${response.status}.`
            );
        }

        return payload;
    } catch (error) {
        if (error instanceof SandboxHttpError) {
            throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
            throw error;
        }

        throw new Error(
            error instanceof Error
                ? `Unable to reach the Python sandbox: ${error.message}`
                : "Unable to reach the Python sandbox."
        );
    } finally {
        cleanup();
    }
}

async function startSandboxSession(input: {
    baseUrl: string;
    sessionId: string;
    abortSignal?: AbortSignal;
}) {
    const formData = new FormData();
    formData.set("user_id", input.sessionId);

    const payload = await requestSandboxJson({
        baseUrl: input.baseUrl,
        path: "/start_session",
        formData,
        abortSignal: input.abortSignal
    });

    const record = payload && typeof payload === "object"
        ? (payload as SandboxJsonRecord)
        : {};

    return {
        message:
            typeof record.message === "string" ? record.message : "Session started successfully",
        notebookPath:
            typeof record.notebook_path === "string" ? record.notebook_path : null
    };
}

async function resetSandboxSession(input: {
    baseUrl: string;
    sessionId: string;
    abortSignal?: AbortSignal;
}) {
    const formData = new FormData();
    formData.set("user_id", input.sessionId);

    const payload = await requestSandboxJson({
        baseUrl: input.baseUrl,
        path: "/reset",
        formData,
        abortSignal: input.abortSignal
    });

    const record = payload && typeof payload === "object"
        ? (payload as SandboxJsonRecord)
        : {};

    return {
        message:
            typeof record.message === "string" ? record.message : "Kernel reset successful"
    };
}

async function endSandboxSession(input: {
    baseUrl: string;
    sessionId: string;
    abortSignal?: AbortSignal;
}) {
    const formData = new FormData();
    formData.set("user_id", input.sessionId);

    const payload = await requestSandboxJson({
        baseUrl: input.baseUrl,
        path: "/end_session",
        formData,
        abortSignal: input.abortSignal
    });

    const record = payload && typeof payload === "object"
        ? (payload as SandboxJsonRecord)
        : {};

    return {
        message:
            typeof record.message === "string" ? record.message : "Session ended successfully"
    };
}

async function executeSandboxCode(input: {
    baseUrl: string;
    sessionId: string;
    code: string;
    abortSignal?: AbortSignal;
}) {
    const payload = await requestSandboxJson({
        baseUrl: input.baseUrl,
        path: "/execute",
        jsonBody: {
            user_id: input.sessionId,
            code: input.code
        },
        abortSignal: input.abortSignal
    });

    const record = payload && typeof payload === "object"
        ? (payload as SandboxJsonRecord)
        : {};

    return {
        output: typeof record.output === "string" ? record.output : ""
    };
}

async function installSandboxPackage(input: {
    baseUrl: string;
    sessionId: string;
    packageName: SandboxAllowedPackage;
    abortSignal?: AbortSignal;
}) {
    const payload = await requestSandboxJson({
        baseUrl: input.baseUrl,
        path: "/install_package",
        jsonBody: {
            user_id: input.sessionId,
            package_name: input.packageName
        },
        abortSignal: input.abortSignal,
        timeoutMs: 5 * 60 * 1000
    });

    const record = payload && typeof payload === "object"
        ? (payload as SandboxJsonRecord)
        : {};

    return {
        message:
            typeof record.message === "string"
                ? record.message
                : `Installed ${input.packageName}`,
        output: typeof record.output === "string" ? record.output : ""
    };
}

async function warmSandboxSession(input: {
    baseUrl: string;
    sessionId: string;
    abortSignal?: AbortSignal;
}) {
    await executeSandboxCode({
        baseUrl: input.baseUrl,
        sessionId: input.sessionId,
        code: "pass",
        abortSignal: input.abortSignal
    });
}

function isMissingSessionError(error: SandboxHttpError): boolean {
    return error.status === 404;
}

function isRecoverableKernelError(error: SandboxHttpError): boolean {
    const message = extractErrorMessage(error.detail, error.message).toLowerCase();

    return (
        error.status >= 500 &&
        (message.includes("kernel died") ||
            message.includes("kernel not ready") ||
            message.includes("restart session"))
    );
}

function normalizeSandboxExecutionFailure(input: {
    error: SandboxHttpError;
    sessionId: string;
    sessionAction: string;
    durationMs: number;
    notebookPath: string | null;
}) {
    const message = extractErrorMessage(input.error.detail, input.error.message);
    const traceback = formatTraceback(input.error.detail);
    const stderr = traceback || message;
    const truncated = truncateMultiline(stderr, SANDBOX_OUTPUT_MAX_LENGTH);

    return {
        status: input.error.status === 408 ? ("timeout" as const) : ("error" as const),
        errorType:
            input.error.status === 408
                ? "execution_timeout"
                : input.error.status === 400
                  ? "python_error"
                  : input.error.status === 404
                    ? "session_not_found"
                    : "sandbox_error",
        message,
        stdout: "",
        stderr: truncated.content,
        truncated: truncated.truncated,
        outputLength: truncated.contentLength,
        durationMs: input.durationMs,
        sessionId: input.sessionId,
        sessionAction: input.sessionAction,
        notebookPath: input.notebookPath
    };
}

async function ensureSessionForMode(input: {
    baseUrl: string;
    sessionId: string;
    sessionMode: SandboxSessionMode;
    abortSignal?: AbortSignal;
}) {
    switch (input.sessionMode) {
        case "fresh": {
            try {
                await endSandboxSession(input);
            } catch (error) {
                if (!(error instanceof SandboxHttpError) || !isMissingSessionError(error)) {
                    throw error;
                }
            }

            const started = await startSandboxSession(input);
            await warmSandboxSession(input);

            return {
                sessionAction: "fresh",
                notebookPath: started.notebookPath
            };
        }

        case "reset": {
            try {
                await resetSandboxSession(input);
                await warmSandboxSession(input);

                return {
                    sessionAction: "reset",
                    notebookPath: null
                };
            } catch (error) {
                if (!(error instanceof SandboxHttpError) || !isMissingSessionError(error)) {
                    throw error;
                }
            }

            const started = await startSandboxSession(input);
            await warmSandboxSession(input);

            return {
                sessionAction: "started",
                notebookPath: started.notebookPath
            };
        }

        default:
            return {
                sessionAction: "reused",
                notebookPath: null
            };
    }
}

async function runSandboxExecution(input: {
    conversationId: string;
    userId: string;
    code: string;
    sessionMode: SandboxSessionMode;
    abortSignal?: AbortSignal;
}) {
    const baseUrl = getSandboxBaseUrl();
    const sessionId = buildSandboxSessionId(input.conversationId, input.userId);
    const startedAt = Date.now();

    logger.info("pythonSandbox tool started", {
        conversationId: input.conversationId,
        userId: input.userId,
        sessionId,
        sessionMode: input.sessionMode,
        codePreview: truncateText(normalizeWhitespace(input.code), 160),
        baseUrl
    });

    let session = await ensureSessionForMode({
        baseUrl,
        sessionId,
        sessionMode: input.sessionMode,
        abortSignal: input.abortSignal
    });

    try {
        const executed = await executeSandboxCode({
            baseUrl,
            sessionId,
            code: input.code,
            abortSignal: input.abortSignal
        });

        const stdout = truncateMultiline(executed.output, SANDBOX_OUTPUT_MAX_LENGTH);
        const result = {
            status: "ok" as const,
            stdout: stdout.content,
            stderr: "",
            truncated: stdout.truncated,
            outputLength: stdout.contentLength,
            durationMs: Date.now() - startedAt,
            sessionId,
            sessionAction: session.sessionAction,
            notebookPath: session.notebookPath
        };

        logger.info("pythonSandbox tool completed", {
            conversationId: input.conversationId,
            userId: input.userId,
            sessionId,
            status: result.status,
            sessionAction: result.sessionAction,
            durationMs: result.durationMs,
            outputLength: result.outputLength,
            truncated: result.truncated
        });

        return result;
    } catch (error) {
        if (!(error instanceof SandboxHttpError)) {
            logger.error("pythonSandbox tool failed", {
                conversationId: input.conversationId,
                userId: input.userId,
                sessionId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }

        if (input.sessionMode === "reuse" && isMissingSessionError(error)) {
            session = {
                sessionAction: "started",
                notebookPath: (await startSandboxSession({
                    baseUrl,
                    sessionId,
                    abortSignal: input.abortSignal
                })).notebookPath
            };
            await warmSandboxSession({
                baseUrl,
                sessionId,
                abortSignal: input.abortSignal
            });

            try {
                const executed = await executeSandboxCode({
                    baseUrl,
                    sessionId,
                    code: input.code,
                    abortSignal: input.abortSignal
                });
                const stdout = truncateMultiline(
                    executed.output,
                    SANDBOX_OUTPUT_MAX_LENGTH
                );

                return {
                    status: "ok" as const,
                    stdout: stdout.content,
                    stderr: "",
                    truncated: stdout.truncated,
                    outputLength: stdout.contentLength,
                    durationMs: Date.now() - startedAt,
                    sessionId,
                    sessionAction: session.sessionAction,
                    notebookPath: session.notebookPath
                };
            } catch (retryError) {
                if (!(retryError instanceof SandboxHttpError)) {
                    throw retryError;
                }

                const normalized = normalizeSandboxExecutionFailure({
                    error: retryError,
                    sessionId,
                    sessionAction: session.sessionAction,
                    durationMs: Date.now() - startedAt,
                    notebookPath: session.notebookPath
                });

                logger.warn("pythonSandbox tool execution returned handled error", {
                    conversationId: input.conversationId,
                    userId: input.userId,
                    sessionId,
                    status: normalized.status,
                    errorType: normalized.errorType,
                    sessionAction: normalized.sessionAction
                });

                return normalized;
            }
        }

        if (input.sessionMode === "reuse" && isRecoverableKernelError(error)) {
            await resetSandboxSession({
                baseUrl,
                sessionId,
                abortSignal: input.abortSignal
            });

            session = {
                sessionAction: "reset",
                notebookPath: session.notebookPath
            };

            try {
                const executed = await executeSandboxCode({
                    baseUrl,
                    sessionId,
                    code: input.code,
                    abortSignal: input.abortSignal
                });
                const stdout = truncateMultiline(
                    executed.output,
                    SANDBOX_OUTPUT_MAX_LENGTH
                );

                return {
                    status: "ok" as const,
                    stdout: stdout.content,
                    stderr: "",
                    truncated: stdout.truncated,
                    outputLength: stdout.contentLength,
                    durationMs: Date.now() - startedAt,
                    sessionId,
                    sessionAction: session.sessionAction,
                    notebookPath: session.notebookPath,
                    resetApplied: true
                };
            } catch (retryError) {
                if (!(retryError instanceof SandboxHttpError)) {
                    throw retryError;
                }

                const normalized = normalizeSandboxExecutionFailure({
                    error: retryError,
                    sessionId,
                    sessionAction: session.sessionAction,
                    durationMs: Date.now() - startedAt,
                    notebookPath: session.notebookPath
                });

                logger.warn("pythonSandbox tool execution returned handled error", {
                    conversationId: input.conversationId,
                    userId: input.userId,
                    sessionId,
                    status: normalized.status,
                    errorType: normalized.errorType,
                    sessionAction: normalized.sessionAction
                });

                return normalized;
            }
        }

        const normalized = normalizeSandboxExecutionFailure({
            error,
            sessionId,
            sessionAction: session.sessionAction,
            durationMs: Date.now() - startedAt,
            notebookPath: session.notebookPath
        });

        logger.warn("pythonSandbox tool execution returned handled error", {
            conversationId: input.conversationId,
            userId: input.userId,
            sessionId,
            status: normalized.status,
            errorType: normalized.errorType,
            sessionAction: normalized.sessionAction
        });

        return normalized;
    }
}

async function runSandboxInstall(input: {
    conversationId: string;
    userId: string;
    packageName: SandboxAllowedPackage;
    abortSignal?: AbortSignal;
}) {
    const baseUrl = getSandboxBaseUrl();
    const sessionId = buildSandboxSessionId(input.conversationId, input.userId);
    const startedAt = Date.now();

    logger.info("pythonSandboxInstallPackage tool started", {
        conversationId: input.conversationId,
        userId: input.userId,
        sessionId,
        packageName: input.packageName,
        baseUrl
    });

    try {
        try {
            await executeSandboxCode({
                baseUrl,
                sessionId,
                code: "pass",
                abortSignal: input.abortSignal
            });
        } catch (error) {
            if (!(error instanceof SandboxHttpError) || !isMissingSessionError(error)) {
                throw error;
            }

            await startSandboxSession({
                baseUrl,
                sessionId,
                abortSignal: input.abortSignal
            });
            await warmSandboxSession({
                baseUrl,
                sessionId,
                abortSignal: input.abortSignal
            });
        }

        const installed = await installSandboxPackage({
            baseUrl,
            sessionId,
            packageName: input.packageName,
            abortSignal: input.abortSignal
        });
        const output = truncateMultiline(
            installed.output,
            SANDBOX_INSTALL_LOG_MAX_LENGTH
        );

        const result = {
            status: "installed" as const,
            packageName: input.packageName,
            message: installed.message,
            output: output.content,
            truncated: output.truncated,
            outputLength: output.contentLength,
            durationMs: Date.now() - startedAt,
            sessionId
        };

        logger.info("pythonSandboxInstallPackage tool completed", {
            conversationId: input.conversationId,
            userId: input.userId,
            sessionId,
            packageName: input.packageName,
            durationMs: result.durationMs,
            truncated: result.truncated
        });

        return result;
    } catch (error) {
        if (error instanceof SandboxHttpError) {
            const message = extractErrorMessage(error.detail, error.message);
            const log = truncateMultiline(message, SANDBOX_INSTALL_LOG_MAX_LENGTH);
            const result = {
                status: "error" as const,
                errorType: isMissingSessionError(error)
                    ? "session_not_found"
                    : "install_failed",
                packageName: input.packageName,
                message,
                output: log.content,
                truncated: log.truncated,
                outputLength: log.contentLength,
                durationMs: Date.now() - startedAt,
                sessionId
            };

            logger.warn("pythonSandboxInstallPackage tool returned handled error", {
                conversationId: input.conversationId,
                userId: input.userId,
                sessionId,
                packageName: input.packageName,
                errorType: result.errorType
            });

            return result;
        }

        logger.error("pythonSandboxInstallPackage tool failed", {
            conversationId: input.conversationId,
            userId: input.userId,
            sessionId,
            packageName: input.packageName,
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

async function runSandboxReset(input: {
    conversationId: string;
    userId: string;
    abortSignal?: AbortSignal;
}) {
    const baseUrl = getSandboxBaseUrl();
    const sessionId = buildSandboxSessionId(input.conversationId, input.userId);
    const startedAt = Date.now();

    logger.info("pythonSandboxReset tool started", {
        conversationId: input.conversationId,
        userId: input.userId,
        sessionId,
        baseUrl
    });

    try {
        let action = "reset";
        let response;

        try {
            response = await resetSandboxSession({
                baseUrl,
                sessionId,
                abortSignal: input.abortSignal
            });
            await warmSandboxSession({
                baseUrl,
                sessionId,
                abortSignal: input.abortSignal
            });
        } catch (error) {
            if (!(error instanceof SandboxHttpError) || !isMissingSessionError(error)) {
                throw error;
            }

            action = "started";
            response = await startSandboxSession({
                baseUrl,
                sessionId,
                abortSignal: input.abortSignal
            });
            await warmSandboxSession({
                baseUrl,
                sessionId,
                abortSignal: input.abortSignal
            });
        }

        const result = {
            status: "ok" as const,
            message: response.message,
            sessionId,
            sessionAction: action,
            durationMs: Date.now() - startedAt
        };

        logger.info("pythonSandboxReset tool completed", {
            conversationId: input.conversationId,
            userId: input.userId,
            sessionId,
            sessionAction: result.sessionAction,
            durationMs: result.durationMs
        });

        return result;
    } catch (error) {
        if (error instanceof SandboxHttpError) {
            const result = {
                status: "error" as const,
                errorType: "reset_failed",
                message: extractErrorMessage(error.detail, error.message),
                sessionId,
                durationMs: Date.now() - startedAt
            };

            logger.warn("pythonSandboxReset tool returned handled error", {
                conversationId: input.conversationId,
                userId: input.userId,
                sessionId,
                errorType: result.errorType
            });

            return result;
        }

        logger.error("pythonSandboxReset tool failed", {
            conversationId: input.conversationId,
            userId: input.userId,
            sessionId,
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

export async function endSandboxSessionForConversation(
    conversationId: string,
    userId: string
) {
    if (!env.sandboxUrl) {
        return;
    }

    const baseUrl = getSandboxBaseUrl();
    const sessionId = buildSandboxSessionId(conversationId, userId);

    try {
        await endSandboxSession({ baseUrl, sessionId });
        logger.info("Sandbox session ended for deleted conversation", {
            conversationId,
            userId,
            sessionId
        });
    } catch (error) {
        if (error instanceof SandboxHttpError && isMissingSessionError(error)) {
            return;
        }

        logger.warn("Sandbox session cleanup failed", {
            conversationId,
            userId,
            sessionId,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

export function createSandboxTools(conversationId: string, userId: string) {
    return {
        pythonSandbox: tool({
            description:
                "Run short Python code in a stateful sandboxed Jupyter session tied to this conversation. Use it for exact calculations, data analysis, CSV inspection, and validating code behavior. Variables persist across calls unless sessionMode resets the session. Keep snippets concise and print only the essential output. Common packages already available include pandas, numpy, matplotlib, scipy, seaborn, scikit-learn, pyarrow, tabulate, openpyxl, and xlrd.",
            inputSchema: z.object({
                code: z
                    .string()
                    .min(1)
                    .max(SANDBOX_CODE_MAX_LENGTH)
                    .describe(
                        "Python code to execute. Keep it short, self-contained, and focused."
                    ),
                sessionMode: z
                    .enum(SANDBOX_SESSION_MODES)
                    .optional()
                    .describe(
                        "reuse keeps existing variables, reset clears the current Python state first, fresh starts a brand-new session."
                    )
            }),
            execute: async ({ code, sessionMode }, options) =>
                runSandboxExecution({
                    conversationId,
                    userId,
                    code,
                    sessionMode: sessionMode ?? "reuse",
                    abortSignal: options.abortSignal
                })
        }),

        pythonSandboxInstallPackage: tool({
            description:
                "Install an allowlisted Python package into the sandbox when a truly needed dependency is missing. Use sparingly because installs affect the shared sandbox environment. Allowed packages: httpx, networkx, plotly, requests, sympy.",
            inputSchema: z.object({
                packageName: z
                    .enum(SANDBOX_ALLOWED_PACKAGES)
                    .describe("The allowlisted package to install into the sandbox")
            }),
            execute: async ({ packageName }, options) =>
                runSandboxInstall({
                    conversationId,
                    userId,
                    packageName,
                    abortSignal: options.abortSignal
                })
        }),

        pythonSandboxReset: tool({
            description:
                "Reset the Python sandbox session for this conversation when kernel state is messy, variables should be cleared, or a previous execution left the session in a bad state.",
            inputSchema: z.object({}),
            execute: async (_, options) =>
                runSandboxReset({
                    conversationId,
                    userId,
                    abortSignal: options.abortSignal
                })
        })
    };
}
