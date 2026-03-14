const IMAGE_EXTENSIONS = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "bmp",
    "ico",
    "avif"
]);

const EXTENSION_MIME_TYPES: Record<string, string> = {
    avif: "image/avif",
    bmp: "image/bmp",
    c: "text/x-c",
    cc: "text/x-c++src",
    cpp: "text/x-c++src",
    css: "text/css",
    csv: "text/csv",
    cts: "text/plain",
    go: "text/x-go",
    h: "text/x-c",
    htm: "text/html",
    html: "text/html",
    ico: "image/x-icon",
    java: "text/x-java-source",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    js: "text/javascript",
    json: "application/json",
    log: "text/plain",
    markdown: "text/markdown",
    md: "text/markdown",
    mjs: "text/javascript",
    mts: "text/plain",
    pdf: "application/pdf",
    php: "text/x-php",
    png: "image/png",
    py: "text/x-python",
    rb: "text/x-ruby",
    rs: "text/x-rustsrc",
    sh: "application/x-sh",
    sql: "application/sql",
    svg: "image/svg+xml",
    ts: "text/plain",
    tsx: "text/plain",
    txt: "text/plain",
    webp: "image/webp",
    xml: "application/xml",
    yaml: "application/yaml",
    yml: "application/yaml"
};

const IMAGE_ACCEPT_ENTRIES = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".ico",
    ".avif",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/x-icon",
    "image/avif"
];

export const IMAGE_ACCEPT_STRING = IMAGE_ACCEPT_ENTRIES.join(",");

function normalizeMimeType(value: string | undefined): string {
    return value?.trim().toLowerCase() ?? "";
}

function getFileExtension(filename: string | undefined): string | null {
    const normalized = filename?.trim().toLowerCase() ?? "";
    const lastDot = normalized.lastIndexOf(".");

    if (lastDot <= 0 || lastDot === normalized.length - 1) {
        return null;
    }

    return normalized.slice(lastDot + 1);
}

export function isImageFile(file: Pick<File, "name" | "type">): boolean {
    const mimeType = normalizeMimeType(file.type);

    if (mimeType.startsWith("image/")) {
        return true;
    }

    const extension = getFileExtension(file.name);
    return extension ? IMAGE_EXTENSIONS.has(extension) : false;
}

export function resolveAttachmentMimeType(
    file: Pick<File, "name" | "type">
): string {
    const mimeType = normalizeMimeType(file.type);

    if (mimeType) {
        return mimeType;
    }

    const extension = getFileExtension(file.name);

    if (extension) {
        return EXTENSION_MIME_TYPES[extension] ?? "application/octet-stream";
    }

    return "application/octet-stream";
}

export function splitAttachmentFiles(files: File[]) {
    const imageFiles: File[] = [];
    const fileFiles: File[] = [];

    for (const file of files) {
        if (isImageFile(file)) {
            imageFiles.push(file);
            continue;
        }

        fileFiles.push(file);
    }

    return { imageFiles, fileFiles };
}
