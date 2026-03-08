import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const debug = process.env.DEBUG === "true";

const sessionId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const logsDir = join(import.meta.dir, "..", "..", "logs");

if (debug) {
    mkdirSync(logsDir, { recursive: true });
}

const logFile = join(logsDir, `${sessionId}.log`);

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function write(level: LogLevel, message: string, data?: unknown): void {
    if (!debug) return;

    const timestamp = new Date().toISOString();
    const dataStr =
        data !== undefined
            ? " " +
              (typeof data === "string"
                  ? data
                  : JSON.stringify(data, null, 2))
            : "";
    const line = `[${timestamp}] [${level}] ${message}${dataStr}\n`;

    if (level === "ERROR") process.stderr.write(line);
    else process.stdout.write(line);

    try {
        appendFileSync(logFile, line);
    } catch {
        // Silently ignore file write errors
    }
}

export const logger = {
    info: (message: string, data?: unknown) => write("INFO", message, data),
    warn: (message: string, data?: unknown) => write("WARN", message, data),
    error: (message: string, data?: unknown) => write("ERROR", message, data),
    debug: (message: string, data?: unknown) => write("DEBUG", message, data),
    sessionId,
    logFile: debug ? logFile : null
};
