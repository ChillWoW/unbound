import type { ModelSummary } from "./models.types";

interface SupportedModelDefinition {
    id: string;
    name: string;
    provider: string;
    description: string;
    free?: boolean;
}

const qwenModels: SupportedModelDefinition[] = [
    {
        id: "qwen/qwen3.5-flash-02-23",
        name: "Qwen 3.5 Flash",
        provider: "qwen",
        description: "Fast but performance-focused model from Qwen"
    },
    {
        id: "qwen/qwen3.5-plus-02-15",
        name: "Qwen 3.5 Plus",
        provider: "qwen",
        description:
            "Qwen's native vision-language model built on a hybrid architecture"
    },
    {
        id: "qwen/qwen3-coder-next",
        name: "Qwen 3 Coder Next",
        provider: "qwen",
        description: "Qwen's open-weight model optimized for coding agents"
    },
    {
        id: "qwen/qwen3-coder:free",
        name: "Qwen 3 Coder",
        provider: "qwen",
        description: "Qwen's model optimized for coding agents",
        free: true
    }
];

const stepfunModels: SupportedModelDefinition[] = [
    {
        id: "stepfun/step-3.5-flash:free",
        name: "Step 3.5 Flash",
        provider: "stepfun",
        description: "StepFun's most capable foundation model",
        free: true
    }
];

const arceeModels: SupportedModelDefinition[] = [
    {
        id: "arcee-ai/trinity-large-preview:free",
        name: "Trinity Large Preview",
        provider: "arcee-ai",
        description: "400B parameter model from Arcee AI",
        free: true
    }
];

const minimaxModels: SupportedModelDefinition[] = [
    {
        id: "minimax/minimax-m2.5",
        name: "Minimax M2.5",
        provider: "minimax",
        description:
            "SOTA language model designed for real-world productivity from Minimax"
    },
    {
        id: "minimax/minimax-m2.1",
        name: "Minimax M2.1",
        provider: "minimax",
        description:
            "Minimax's state-of-the-art large language model optimized for coding"
    }
];

const moonshotModels: SupportedModelDefinition[] = [
    {
        id: "moonshotai/kimi-k2.5",
        name: "Kimi K2.5",
        provider: "moonshot",
        description: "MoonShot AI's latest multimodal model"
    }
];

const xaiModels: SupportedModelDefinition[] = [
    {
        id: "x-ai/grok-4.1-fast",
        name: "Grok 4.1 Fast",
        provider: "x-ai",
        description: "xAI's best agentic tool calling model"
    }
];

const openaiModels: SupportedModelDefinition[] = [
    {
        id: "openai/gpt-5.4",
        name: "GPT-5.4",
        provider: "openai",
        description: "OpenAI's latest frontier model"
    },
    {
        id: "openai/gpt-5.3-codex",
        name: "GPT-5.3 Codex",
        provider: "openai",
        description: "OpenAI's most advanced agentic coding model"
    },
    {
        id: "openai/gpt-oss-120b:free",
        name: "GPT OSS 120B",
        provider: "openai",
        description: "OpenAI's large open model",
        free: true
    },
    {
        id: "openai/gpt-oss-20b:free",
        name: "GPT OSS 20B",
        provider: "openai",
        description: "OpenAI's small open model",
        free: true
    }
];

const googleModels: SupportedModelDefinition[] = [
    {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview",
        provider: "google",
        description: "Google's frontier reasoning model"
    },
    {
        id: "google/gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash Lite Preview",
        provider: "google",
        description:
            "Google's high-efficiency model optimized for high-volume use cases"
    },
    {
        id: "google/gemma-3-27b-it:free",
        name: "Gemma 3 27B",
        provider: "google",
        description: "Google's open-source model supporting vision-language",
        free: true
    }
];

const anthropicModels: SupportedModelDefinition[] = [
    {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        provider: "anthropic",
        description: "Anthropic's most capable Sonnet-class model yet"
    },
    {
        id: "anthropic/claude-opus-4.6",
        name: "Claude Opus 4.6",
        provider: "anthropic",
        description:
            "Anthropic's strongest model for coding and long-running professional tasks"
    }
];

const zaiModels: SupportedModelDefinition[] = [
    {
        id: "z-ai/glm-5",
        name: "GLM-5",
        provider: "zai",
        description: "Z-AI's flagship open-source foundation model"
    },
    {
        id: "z-ai/glm-4.7-flash",
        name: "GLM 4.7 Flash",
        provider: "zai",
        description: "Z-AI's model that balances performance and efficiency"
    },
    {
        id: "z-ai/glm-4.5-air:free",
        name: "GLM 4.5 Air",
        provider: "zai",
        description: "Z-AI's lightweight variant of GLM-4.5",
        free: true
    }
];

const deepseekModels: SupportedModelDefinition[] = [
    {
        id: "deepseek/deepseek-v3.2",
        name: "DeepSeek V3.2",
        provider: "deepseek",
        description:
            "Deepseek's model designed to harmonize high computational efficiency with strong reasoning and agentic tool-use performance"
    },
    {
        id: "deepseek/deepseek-chat-v3-0324",
        name: "DeepSeek Chat V3",
        provider: "deepseek",
        description: "Deepseek's mixture-of-experts model"
    }
];

const supportedModelDefinitions: SupportedModelDefinition[] = [
    ...qwenModels,
    ...stepfunModels,
    ...arceeModels,
    ...minimaxModels,
    ...moonshotModels,
    ...xaiModels,
    ...openaiModels,
    ...googleModels,
    ...anthropicModels,
    ...zaiModels,
    ...deepseekModels
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
                source: "openrouter",
                description: definition.description,
                contextLength: null,
                maxOutputTokens: null,
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
            source: "openrouter",
            description: definition.description,
            free: definition.free
        };
    });
}
