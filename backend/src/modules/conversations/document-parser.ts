import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { logger } from "../../lib/logger";

const MAX_PARSED_PDF_PAGES = 20;
const MAX_PARSED_TEXT_LENGTH = 20_000;

function normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
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
        document = await getDocument({ data }).promise;
        const chunks: string[] = [];
        const pageCount = Math.min(document.numPages, MAX_PARSED_PDF_PAGES);

        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
            const page = await document.getPage(pageNumber);
            const textContent = await page.getTextContent();
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
