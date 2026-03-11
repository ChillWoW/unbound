import type { ProviderType } from "../../lib/provider-registry";
import { AppError } from "../../lib/app-error";

export interface ModelSummary {
    id: string;
    name: string;
    provider: string;
    source: ProviderType;
    description: string | null;
    contextLength: number | null;
    maxOutputTokens: number | null;
    promptPricing: string | null;
    completionPricing: string | null;
    inputModalities: string[];
    outputModalities: string[];
    free?: boolean;
}

const SUPPORTED_INPUT_MODALITIES = new Set(["text", "image", "file"]);

export function sanitizeInputModalities(modalities: string[]): string[] {
    const seen = new Set<string>();

    for (const modality of modalities) {
        const normalized = modality.trim().toLowerCase();
        if (!SUPPORTED_INPUT_MODALITIES.has(normalized) || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
    }

    if (seen.size === 0) {
        return ["text"];
    }

    return Array.from(seen);
}

interface OpenRouterModelRecord {
    id?: unknown;
    name?: unknown;
    description?: unknown;
    context_length?: unknown;
    top_provider?: {
        max_completion_tokens?: unknown;
    } | null;
    pricing?: {
        prompt?: unknown;
        completion?: unknown;
    } | null;
    architecture?: {
        input_modalities?: unknown;
        output_modalities?: unknown;
    } | null;
}

interface OpenRouterModelsResponse {
    data?: unknown;
}

export { AppError as ModelsError };

function toStringOrNull(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
}

function toNumberOrNull(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }

    return value;
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
}

function toModelSummary(value: unknown): ModelSummary | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const model = value as OpenRouterModelRecord;
    const id = toStringOrNull(model.id);

    if (!id) {
        return null;
    }

    return {
        id,
        name: toStringOrNull(model.name) ?? id,
        provider: "",
        source: "openrouter",
        description: toStringOrNull(model.description),
        contextLength: toNumberOrNull(model.context_length),
        maxOutputTokens: toNumberOrNull(
            model.top_provider?.max_completion_tokens
        ),
        promptPricing: toStringOrNull(model.pricing?.prompt),
        completionPricing: toStringOrNull(model.pricing?.completion),
        inputModalities: sanitizeInputModalities(
            toStringArray(model.architecture?.input_modalities)
        ),
        outputModalities: toStringArray(model.architecture?.output_modalities)
    };
}

export function normalizeModelsResponse(payload: unknown): ModelSummary[] {
    if (!payload || typeof payload !== "object") {
        throw new AppError(
            502,
            "OpenRouter returned an invalid models payload."
        );
    }

    const response = payload as OpenRouterModelsResponse;

    if (!Array.isArray(response.data)) {
        throw new AppError(
            502,
            "OpenRouter returned an invalid models payload."
        );
    }

    return response.data
        .map(toModelSummary)
        .filter((model): model is ModelSummary => model !== null);
}
