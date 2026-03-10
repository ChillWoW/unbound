export interface EmailTag {
    name: string;
    value: string;
}

export interface SendEmailInput {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    tags?: EmailTag[];
}

export interface SendEmailResult {
    id: string | null;
    skipped: boolean;
}

export interface EmailTemplateContent {
    subject: string;
    html: string;
    text: string;
}

export interface ActionEmailTemplateData {
    previewText?: string;
    title: string;
    message: string;
    ctaLabel?: string;
    ctaUrl?: string;
    outro?: string;
}

export interface NoticeEmailTemplateData {
    previewText?: string;
    title: string;
    lines: string[];
    outro?: string;
}

export interface VerifyEmailTemplateData {
    previewText?: string;
    name?: string | null;
    verifyUrl: string;
}

export interface EmailTemplateMap {
    action: ActionEmailTemplateData;
    notice: NoticeEmailTemplateData;
    verifyEmail: VerifyEmailTemplateData;
}

export type EmailTemplateName = keyof EmailTemplateMap;

export interface SendTemplateEmailInput<TTemplate extends EmailTemplateName> {
    to: string | string[];
    template: TTemplate;
    data: EmailTemplateMap[TTemplate];
    replyTo?: string;
    tags?: EmailTag[];
}
