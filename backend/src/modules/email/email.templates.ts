import type {
    ActionEmailTemplateData,
    EmailTemplateContent,
    EmailTemplateMap,
    EmailTemplateName,
    NoticeEmailTemplateData,
    VerifyEmailTemplateData
} from "./email.types";

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function renderPreviewText(value?: string): string {
    if (!value) {
        return "";
    }

    return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(value)}</div>`;
}

function renderShell(input: {
    previewText?: string;
    title: string;
    body: string;
}): string {
    return `
<!doctype html>
<html lang="en">
    <body style="margin:0;background:#0d0d0d;padding:24px;font-family:Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;color:#c9c9c9;">
        ${renderPreviewText(input.previewText)}
        <div style="margin:0 auto;max-width:640px;border:1px solid #2e2e2e;border-radius:6px;background:#1f1f1f;padding:40px 32px;box-shadow:0 1px 2px rgba(0,0,0,0.25);">
            <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#d1d5db;">Unbound</p>
            <h1 style="margin:0 0 20px;font-size:32px;line-height:1.15;color:#c9c9c9;">${escapeHtml(input.title)}</h1>
            <div style="font-size:14px;line-height:1.7;color:#b8b8b8;">${input.body}</div>
        </div>
    </body>
</html>`.trim();
}

function renderActionTemplate(data: ActionEmailTemplateData): EmailTemplateContent {
    const bodyParts = [
        `<p style="margin:0 0 20px;">${escapeHtml(data.message)}</p>`
    ];

    if (data.ctaLabel && data.ctaUrl) {
        bodyParts.push(
            `<p style="margin:0 0 20px;"><a href="${escapeHtml(data.ctaUrl)}" style="display:inline-block;height:32px;line-height:32px;border-radius:6px;background:#ffffff;color:#141414;padding:0 16px;text-decoration:none;font-size:14px;font-weight:500;">${escapeHtml(data.ctaLabel)}</a></p>`
        );
    }

    if (data.outro) {
        bodyParts.push(
            `<p style="margin:0;">${escapeHtml(data.outro)}</p>`
        );
    }

    const textLines = [data.message];

    if (data.ctaLabel && data.ctaUrl) {
        textLines.push(`${data.ctaLabel}: ${data.ctaUrl}`);
    }

    if (data.outro) {
        textLines.push(data.outro);
    }

    return {
        subject: data.title,
        html: renderShell({
            previewText: data.previewText,
            title: data.title,
            body: bodyParts.join("")
        }),
        text: textLines.join("\n\n")
    };
}

function renderNoticeTemplate(data: NoticeEmailTemplateData): EmailTemplateContent {
    const body = data.lines
        .map((line) => `<p style="margin:0 0 16px;">${escapeHtml(line)}</p>`)
        .join("");

    const textLines = [...data.lines];

    if (data.outro) {
        textLines.push(data.outro);
    }

    return {
        subject: data.title,
        html: renderShell({
            previewText: data.previewText,
            title: data.title,
            body:
                body +
                (data.outro
                    ? `<p style="margin:8px 0 0;">${escapeHtml(data.outro)}</p>`
                    : "")
        }),
        text: textLines.join("\n\n")
    };
}

function renderVerifyEmailTemplate(
    data: VerifyEmailTemplateData
): EmailTemplateContent {
    const greeting = data.name?.trim()
        ? `Hi ${escapeHtml(data.name.trim())},`
        : "Hi,";

    return {
        subject: "Verify your email for Unbound",
        html: renderShell({
            previewText:
                data.previewText ??
                "Verify your email address to start using Unbound.",
            title: "Verify your email",
            body: [
                `<p style="margin:0 0 20px;">${greeting}</p>`,
                '<p style="margin:0 0 20px;">Confirm your email address to unlock your Unbound workspace.</p>',
                `<p style="margin:0 0 20px;"><a href="${escapeHtml(data.verifyUrl)}" style="display:inline-block;height:32px;line-height:32px;border-radius:6px;background:#ffffff;color:#141414;padding:0 16px;text-decoration:none;font-size:14px;font-weight:500;">Verify email</a></p>`,
                `<p style="margin:0;">If the button does not work, open this link:<br /><a href="${escapeHtml(data.verifyUrl)}" style="color:#d1d5db;word-break:break-all;">${escapeHtml(data.verifyUrl)}</a></p>`
            ].join("")
        }),
        text: [
            data.name?.trim() ? `Hi ${data.name.trim()},` : "Hi,",
            "Confirm your email address to unlock your Unbound workspace.",
            `Verify email: ${data.verifyUrl}`
        ].join("\n\n")
    };
}

const templateRenderers: {
    [TTemplate in EmailTemplateName]: (
        data: EmailTemplateMap[TTemplate]
    ) => EmailTemplateContent;
} = {
    action: renderActionTemplate,
    notice: renderNoticeTemplate,
    verifyEmail: renderVerifyEmailTemplate
};

export function renderEmailTemplate<TTemplate extends EmailTemplateName>(
    template: TTemplate,
    data: EmailTemplateMap[TTemplate]
): EmailTemplateContent {
    return templateRenderers[template](data);
}
