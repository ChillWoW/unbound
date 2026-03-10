import type {
    ActionEmailTemplateData,
    EmailTemplateContent,
    EmailTemplateMap,
    EmailTemplateName,
    NoticeEmailTemplateData
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
    <body style="margin:0;background:#111827;padding:24px;font-family:Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;color:#f9fafb;">
        ${renderPreviewText(input.previewText)}
        <div style="margin:0 auto;max-width:640px;border:1px solid #4b5563;border-radius:6px;background:#1f2937;padding:40px 32px;box-shadow:0 1px 2px rgba(0,0,0,0.25);">
            <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8eb8ff;">Unbound</p>
            <h1 style="margin:0 0 20px;font-size:32px;line-height:1.15;color:#f9fafb;">${escapeHtml(input.title)}</h1>
            <div style="font-size:14px;line-height:1.7;color:#d1d5db;">${input.body}</div>
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
            `<p style="margin:0 0 20px;"><a href="${escapeHtml(data.ctaUrl)}" style="display:inline-block;height:32px;line-height:32px;border-radius:6px;background:#e5eefc;color:#111827;padding:0 16px;text-decoration:none;font-size:14px;font-weight:500;">${escapeHtml(data.ctaLabel)}</a></p>`
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

const templateRenderers: {
    [TTemplate in EmailTemplateName]: (
        data: EmailTemplateMap[TTemplate]
    ) => EmailTemplateContent;
} = {
    action: renderActionTemplate,
    notice: renderNoticeTemplate
};

export function renderEmailTemplate<TTemplate extends EmailTemplateName>(
    template: TTemplate,
    data: EmailTemplateMap[TTemplate]
): EmailTemplateContent {
    return templateRenderers[template](data);
}
