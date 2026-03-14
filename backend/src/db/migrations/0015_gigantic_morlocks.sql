CREATE TABLE "message_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"filename" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"extracted_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_mcp_servers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"transport" text DEFAULT 'streamable_http' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"url_ciphertext" text NOT NULL,
	"url_preview" text NOT NULL,
	"auth_mode" text DEFAULT 'none' NOT NULL,
	"auth_header_name" text,
	"auth_token_ciphertext" text,
	"auth_token_preview" text,
	"tool_prefix" text NOT NULL,
	"allowed_tools" jsonb,
	"discovered_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_health_status" text DEFAULT 'unknown' NOT NULL,
	"last_health_error" text,
	"last_connected_at" timestamp with time zone,
	"last_discovered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text NOT NULL,
	"model_id" text NOT NULL,
	"provider" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"input_cost_micros" bigint DEFAULT 0 NOT NULL,
	"output_cost_micros" bigint DEFAULT 0 NOT NULL,
	"total_cost_micros" bigint DEFAULT 0 NOT NULL,
	"prompt_price_per_token" text,
	"completion_price_per_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "latest_message_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_message_preview" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_message_role" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "latest_assistant_message_id" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "monthly_budget_cents" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "budget_alert_threshold" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mcp_servers" ADD CONSTRAINT "user_mcp_servers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_attachments_message_idx" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_attachments_conversation_idx" ON "message_attachments" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "message_attachments_storage_key_idx" ON "message_attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "user_mcp_servers_user_updated_at_idx" ON "user_mcp_servers" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_mcp_servers_user_tool_prefix_unique" ON "user_mcp_servers" USING btree ("user_id","tool_prefix");--> statement-breakpoint
CREATE INDEX "usage_records_user_created_at_idx" ON "usage_records" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_records_user_model_idx" ON "usage_records" USING btree ("user_id","model_id");--> statement-breakpoint
CREATE INDEX "usage_records_user_conversation_idx" ON "usage_records" USING btree ("user_id","conversation_id");