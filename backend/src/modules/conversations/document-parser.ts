import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { logger } from "../../lib/logger";

const MAX_PARSED_PDF_PAGES = 20;
const MAX_PARSED_TEXT_LENGTH = 20_000;
const PDF_PARSE_TIMEOUT_MS = 10_000;

function normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
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

export async function extractDocumentText(
    mimeType: string,
    data: Uint8Array,
    filename?: string | null
): Promise<string | null> {
    if (mimeType !== "application/pdf") {
        return null;
    }

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

        const joined = chunks.join("\n\n").slice(0, MAX_PARSED_TEXT_LENGTH);

        logger.info("Document text extracted", {
            mimeType,
            filename: filename ?? null,
            pageCount,
            extractedChars: joined.length,
            durationMs: Date.now() - startedAt
        });

        return joined || null;
    } catch (error) {
        logger.warn("Document text extraction failed", {
            mimeType,
            filename: filename ?? null,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startedAt
        });
        return null;
    } finally {
        await document?.destroy();
    }
}
