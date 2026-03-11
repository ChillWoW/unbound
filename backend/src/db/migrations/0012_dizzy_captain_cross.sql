CREATE TABLE "user_memories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"keywords" jsonb NOT NULL,
	"source" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "memory_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "memory_min_confidence" text DEFAULT 'medium' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "memory_allow_preference" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "memory_allow_workflow" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "memory_allow_profile" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "memory_allow_project_context" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "memory_custom_instructions" text;
--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "user_memories_user_updated_at_idx" ON "user_memories" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE INDEX "user_memories_user_kind_updated_at_idx" ON "user_memories" USING btree ("user_id","kind","updated_at");
--> statement-breakpoint
CREATE INDEX "user_memories_user_confidence_updated_at_idx" ON "user_memories" USING btree ("user_id","confidence","updated_at");
