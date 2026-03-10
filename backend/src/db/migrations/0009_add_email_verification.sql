ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "token_hash" text NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_verification_tokens_token_hash_unique"
ON "email_verification_tokens" ("token_hash");
