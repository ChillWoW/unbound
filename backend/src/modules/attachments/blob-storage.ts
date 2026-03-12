import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { env } from "../../config/env";

const STORAGE_ROOT = resolve(env.blobStorageRoot);

function safeStoragePath(storageKey: string): string {
    const fullPath = resolve(STORAGE_ROOT, storageKey);

    if (!fullPath.startsWith(STORAGE_ROOT)) {
        throw new Error("Invalid storage key.");
    }

    return fullPath;
}

async function ensureParentDirectory(filePath: string) {
    await mkdir(dirname(filePath), { recursive: true });
}

export interface StoredBlob {
    sha256: string;
    size: number;
    storageKey: string;
}

export const blobStorage = {
    async saveBase64(input: {
        data: string;
        attachmentId: string;
    }): Promise<StoredBlob> {
        const buffer = Buffer.from(input.data, "base64");

        if (buffer.byteLength === 0) {
            throw new Error("Attachment data is invalid.");
        }

        const sha256 = createHash("sha256").update(buffer).digest("hex");
        const storageKey = `${sha256.slice(0, 2)}/${input.attachmentId}`;
        const filePath = safeStoragePath(storageKey);

        await ensureParentDirectory(filePath);
        await writeFile(filePath, buffer);

        return {
            sha256,
            size: buffer.byteLength,
            storageKey
        };
    },

    async read(storageKey: string): Promise<Buffer> {
        return await readFile(safeStoragePath(storageKey));
    },

    async readBase64(storageKey: string): Promise<string> {
        const buffer = await blobStorage.read(storageKey);
        return buffer.toString("base64");
    },

    async delete(storageKey: string): Promise<void> {
        await rm(safeStoragePath(storageKey), { force: true });
    },

    async createContentResponse(input: {
        storageKey: string;
        mimeType: string;
        filename: string;
        download?: boolean;
    }): Promise<Response> {
        const filePath = safeStoragePath(input.storageKey);
        const file = Bun.file(filePath);
        const disposition = input.download ? "attachment" : "inline";
        const encodedFilename = encodeURIComponent(input.filename);

        return new Response(file, {
            headers: {
                "Content-Type": input.mimeType,
                "Cache-Control": "private, max-age=3600",
                "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedFilename}`
            }
        });
    },

    resolvePublicPath(attachmentId: string, download = false): string {
        const path = `/api/attachments/${attachmentId}/content`;
        return download ? `${path}?download=1` : path;
    },

    rootPath(): string {
        return STORAGE_ROOT;
    }
};
