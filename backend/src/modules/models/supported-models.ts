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
        description: "Arcee's 400B parameter model from Arcee AI",
        free: true
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
