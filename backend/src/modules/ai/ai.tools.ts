import { tool } from "ai";
import { z } from "zod";

export const tools = {
    getCurrentTime: tool({
        description: "Get the current date and time for a given timezone",
        inputSchema: z.object({
            timezone: z
                .string()
                .optional()
                .describe("IANA timezone identifier, defaults to UTC")
        }),
        execute: async ({ timezone }) => {
            const now = new Date();
            return now.toLocaleString("en-US", {
                timeZone: timezone ?? "UTC",
                dateStyle: "full",
                timeStyle: "long"
            });
        }
    })
};
