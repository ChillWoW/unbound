import type { ModelSummary } from "./models.types";

interface SupportedModelDefinition {
    id: string;
    name: string;
    provider: string;
    description: string;
    free?: boolean;
}

const supportedModelDefinitions: SupportedModelDefinition[] = [
    {
        id: "qwen/qwen3.5-flash-02-23",
        name: "Qwen 3.5 Flash",
        provider: "qwen",
        description: "Fast but performance-focused model from Qwen"
    },
    {
        id: "stepfun/step-3.5-flash:free",
        name: "Step 3.5 Flash",
        provider: "stepfun",
        description: "StepFun's most capable foundation model",
        free: true
    },
    {
        id: "arcee-ai/trinity-large-preview:free",
        name: "Trinity Large Preview",
        provider: "arcee-ai",
        description: "400B parameter model from Arcee AI",
        free: true
    },
    {
        id: "minimax/minimax-m2.5",
        name: "Minimax M2.5",
        provider: "minimax",
        description:
            "SOTA language model designed for real-world productivity from Minimax"
    },
    {
        id: "moonshotai/kimi-k2.5",
        name: "Kimi K2.5",
        provider: "moonshot",
        description: "MoonShot AI's latest multimodal model"
    },
    {
        id: "x-ai/grok-4.1-fast",
        name: "Grok 4.1 Fast",
        provider: "x-ai",
        description: "xAI's best agentic tool calling model"
    }
];

export function selectSupportedModels(models: ModelSummary[]): ModelSummary[] {
    const modelsById = new Map(models.map((model) => [model.id, model]));

    return supportedModelDefinitions.map((definition) => {
        const model = modelsById.get(definition.id);

        if (!model) {
            return {
                id: definition.id,
                name: definition.name,
                provider: definition.provider,
                description: definition.description,
                contextLength: null,
                promptPricing: null,
                completionPricing: null,
                inputModalities: [],
                outputModalities: [],
                free: definition.free
            } satisfies ModelSummary;
        }

        return {
            ...model,
            name: definition.name,
            provider: definition.provider,
            description: definition.description,
            free: definition.free
        };
    });
}
