import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { logger } from "../../lib/logger";

const MAX_PARSED_PDF_PAGES = 20;
const MAX_PARSED_TEXT_LENGTH = 20_000;
const PDF_PARSE_TIMEOUT_MS = 10_000;
const BINARY_SNIFF_BYTES = 4096;
const MAX_BINARY_CONTROL_RATIO = 0.3;

const TEXT_LIKE_MIME_TYPES = new Set([
    "application/json",
    "application/javascript",
    "application/sql",
    "application/typescript",
    "application/xml",
    "application/x-sh",
    "application/x-yaml",
    "application/yaml",
    "text/csv",
    "text/html",
    "text/javascript",
    "text/markdown",
    "text/plain",
    "text/xml"
]);

const TEXT_LIKE_EXTENSIONS = new Set([
    "c",
    "cc",
    "cpp",
    "css",
    "csv",
    "go",
    "h",
    "htm",
    "html",
    "java",
    "js",
    "json",
    "log",
    "md",
    "markdown",
    "mjs",
    "php",
    "py",
    "rb",
    "rs",
    "sh",
    "sql",
    "ts",
    "tsx",
    "txt",
    "xml",
    "yaml",
    "yml"
]);

const MARKUP_MIME_TYPES = new Set(["text/html", "text/xml", "application/xml"]);
const MARKUP_EXTENSIONS = new Set(["htm", "html", "xml"]);

function normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function normalizeMimeType(value: string | undefined | null): string {
    return value?.trim().toLowerCase() ?? "";
}

function getFileExtension(filename?: string | null): string | null {
    const normalized = filename?.trim().toLowerCase() ?? "";
    const lastDot = normalized.lastIndexOf(".");

    if (lastDot <= 0 || lastDot === normalized.length - 1) {
        return null;
    }

    return normalized.slice(lastDot + 1);
}

function truncateExtractedText(value: string): string {
    return value.slice(0, MAX_PARSED_TEXT_LENGTH);
}

function isMarkupDocument(mimeType: string, filename?: string | null): boolean {
    if (MARKUP_MIME_TYPES.has(mimeType)) {
        return true;
    }

    const extension = getFileExtension(filename);
    return extension ? MARKUP_EXTENSIONS.has(extension) : false;
}

function isTextLikeDocument(mimeType: string, filename?: string | null): boolean {
    if (mimeType.startsWith("text/")) {
        return true;
    }

    if (TEXT_LIKE_MIME_TYPES.has(mimeType)) {
        return true;
    }

    const extension = getFileExtension(filename);
    return extension ? TEXT_LIKE_EXTENSIONS.has(extension) : false;
}

function stripMarkup(value: string): string {
    return value
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");
}

function looksBinary(data: Uint8Array): boolean {
    const sample = data.subarray(0, Math.min(data.length, BINARY_SNIFF_BYTES));

    if (sample.length === 0) {
        return false;
    }

    let suspiciousBytes = 0;

    for (const byte of sample) {
        if (byte === 0) {
            return true;
        }

        if (byte < 7 || (byte > 14 && byte < 32)) {
            suspiciousBytes += 1;
        }
    }

    return suspiciousBytes / sample.length > MAX_BINARY_CONTROL_RATIO;
}

function extractTextLikeDocument(
    mimeType: string,
    data: Uint8Array,
    filename?: string | null
): string | null {
    if (looksBinary(data)) {
        return null;
    }

    const decoded = new TextDecoder().decode(data);
    const normalized = isMarkupDocument(mimeType, filename)
        ? normalizeText(stripMarkup(decoded))
        : normalizeText(decoded);

    if (!normalized) {
        return null;
    }

    return truncateExtractedText(normalized);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error("Document parsing timed out."));
        }, timeoutMs);

        void promise.then(
            (value) => {
                clearTimeout(timeoutId);
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timeoutId);
                reject(error);
            }
        );
    });
}

async function extractPdfText(
    mimeType: string,
    data: Uint8Array,
    filename?: string | null
): Promise<string | null> {
    let document: any = null;
    const startedAt = Date.now();

    try {
        document = await withTimeout(
            getDocument({ data }).promise,
            PDF_PARSE_TIMEOUT_MS
        );
        const chunks: string[] = [];
        const pageCount = Math.min(document.numPages, MAX_PARSED_PDF_PAGES);

        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
            const page = (await withTimeout(
                document.getPage(pageNumber),
                PDF_PARSE_TIMEOUT_MS
            )) as any;
            const textContent = (await withTimeout(
                page.getTextContent(),
                PDF_PARSE_TIMEOUT_MS
            )) as { items: Array<{ str?: string }> };
            const text = normalizeText(
                textContent.items
                    .map((item: { str?: string }) => item.str ?? "")
                    .join(" ")
            );

            if (text) {
                chunks.push(text);
            }

            if (chunks.join("\n\n").length >= MAX_PARSED_TEXT_LENGTH) {
                break;
            }
        }

        const joined = truncateExtractedText(chunks.join("\n\n"));

        logger.info("Document text extracted", {
            mimeType,
            filename: filename ?? null,
            pageCount,
            extractedChars: joined.length,
            strategy: "pdf",
            durationMs: Date.now() - startedAt
        });

        return joined || null;
    } catch (error) {
        logger.warn("Document text extraction failed", {
            mimeType,
            filename: filename ?? null,
            error: error instanceof Error ? error.message : String(error),
            strategy: "pdf",
            durationMs: Date.now() - startedAt
        });
        return null;
    } finally {
        await document?.destroy();
    }
}

export async function extractDocumentText(
    mimeType: string,
    data: Uint8Array,
    filename?: string | null
): Promise<string | null> {
    const normalizedMimeType = normalizeMimeType(mimeType);

    if (normalizedMimeType === "application/pdf") {
        return await extractPdfText(normalizedMimeType, data, filename);
    }

    if (!isTextLikeDocument(normalizedMimeType, filename)) {
        return null;
    }

    const startedAt = Date.now();

    try {
        const extractedText = extractTextLikeDocument(
            normalizedMimeType,
            data,
            filename
        );

        if (extractedText) {
            logger.info("Document text extracted", {
                mimeType: normalizedMimeType || null,
                filename: filename ?? null,
                extractedChars: extractedText.length,
                strategy: "text",
                durationMs: Date.now() - startedAt
            });
        }

        return extractedText;
    } catch (error) {
        logger.warn("Document text extraction failed", {
            mimeType: normalizedMimeType || null,
            filename: filename ?? null,
            error: error instanceof Error ? error.message : String(error),
            strategy: "text",
            durationMs: Date.now() - startedAt
        });
        return null;
    }
}
