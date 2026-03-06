import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");

    return `scrypt$${salt}$${hash}`;
}

export async function verifyPassword(
    password: string,
    storedHash: string
): Promise<boolean> {
    const [algorithm, salt, hash] = storedHash.split("$");

    if (algorithm !== "scrypt" || !salt || !hash) {
        return false;
    }

    const derivedHash = scryptSync(password, salt, KEY_LENGTH);
    const storedBuffer = Buffer.from(hash, "hex");

    if (storedBuffer.length !== derivedHash.length) {
        return false;
    }

    return timingSafeEqual(storedBuffer, derivedHash);
}
