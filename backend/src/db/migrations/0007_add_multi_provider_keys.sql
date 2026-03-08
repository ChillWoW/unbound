ALTER TABLE "user_settings" ALTER COLUMN "openrouter_api_key_ciphertext" DROP NOT NULL;
ALTER TABLE "user_settings" ALTER COLUMN "openrouter_api_key_preview" DROP NOT NULL;

ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "openai_api_key_ciphertext" text;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "openai_api_key_preview" text;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "anthropic_api_key_ciphertext" text;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "anthropic_api_key_preview" text;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "google_api_key_ciphertext" text;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "google_api_key_preview" text;
