export const IMAGE_GENERATION_MODEL_IDS = [
    "bytedance-seed/seedream-4.5",
    "google/gemini-3.1-flash-image-preview"
] as const;

export type ImageGenerationModelId =
    (typeof IMAGE_GENERATION_MODEL_IDS)[number];

export interface ImageGenerationConfig {
    aspectRatio?: string;
    imageSize?: string;
}

export type MessageGenerationOptions =
    | {
          mode: "chat";
      }
    | {
          mode: "image";
          modelId: ImageGenerationModelId;
          imageConfig?: ImageGenerationConfig;
      };
