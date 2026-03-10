import { Resend } from "resend";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { renderEmailTemplate } from "./email.templates";
import type {
    SendEmailInput,
    SendEmailResult,
    SendTemplateEmailInput,
    EmailTemplateName
} from "./email.types";

const resendClient = env.resendApiKey ? new Resend(env.resendApiKey) : null;

function normalizeRecipients(input: string | string[]): string[] {
    const recipients = Array.isArray(input) ? input : [input];

    return recipients.map((recipient) => recipient.trim()).filter(Boolean);
}

function getEmailFrom(): string {
    if (!env.emailFrom) {
        throw new Error("EMAIL_FROM is required when sending email.");
    }

    return env.emailFrom;
}

function getResendClient(): Resend {
    if (!resendClient) {
        throw new Error("RESEND_API_KEY is required when sending email.");
    }

    return resendClient;
}

export const emailService = {
    async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
        const to = normalizeRecipients(input.to);

        if (to.length === 0) {
            throw new Error("At least one recipient is required.");
        }

        if (!env.emailEnabled) {
            logger.info("Email skipped because delivery is disabled.", {
                to,
                subject: input.subject
            });

            return {
                id: null,
                skipped: true
            };
        }

        const resend = getResendClient();
        const from = getEmailFrom();

        const result = await resend.emails.send({
            from,
            to,
            subject: input.subject,
            html: input.html,
            text: input.text,
            replyTo: input.replyTo ?? env.emailReplyTo ?? undefined,
            tags: input.tags
        });

        if (result.error) {
            logger.error("Failed to send email.", {
                to,
                subject: input.subject,
                error: result.error
            });
            throw new Error(result.error.message);
        }

        logger.info("Email sent.", {
            id: result.data?.id ?? null,
            to,
            subject: input.subject
        });

        return {
            id: result.data?.id ?? null,
            skipped: false
        };
    },

    async sendTemplateEmail<TTemplate extends EmailTemplateName>(
        input: SendTemplateEmailInput<TTemplate>
    ): Promise<SendEmailResult> {
        const content = renderEmailTemplate(input.template, input.data);

        return this.sendEmail({
            to: input.to,
            subject: content.subject,
            html: content.html,
            text: content.text,
            replyTo: input.replyTo,
            tags: input.tags
        });
    }
};
