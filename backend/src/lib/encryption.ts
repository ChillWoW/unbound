import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function toBase64(value: Buffer): string {
    return value.toString("base64");
}

function fromBase64(value: string): Buffer {
    return Buffer.from(value, "base64");
}

export function encryptText(plainText: string, key: Buffer): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plainText, "utf8"),
        cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    return [toBase64(iv), toBase64(authTag), toBase64(encrypted)].join(".");
}

export function decryptText(payload: string, key: Buffer): string {
    const [ivEncoded, authTagEncoded, encryptedEncoded] = payload.split(".");

    if (!ivEncoded || !authTagEncoded || !encryptedEncoded) {
        throw new Error("Invalid encrypted payload format.");
    }

    const iv = fromBase64(ivEncoded);
    const authTag = fromBase64(authTagEncoded);
    const encrypted = fromBase64(encryptedEncoded);

    if (iv.length !== IV_LENGTH) {
        throw new Error("Invalid encryption IV.");
    }

    if (authTag.length !== 16) {
        throw new Error("Invalid encryption auth tag.");
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ]).toString("utf8");
}
