ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "kimi_api_key_ciphertext" text;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "kimi_api_key_preview" text;
