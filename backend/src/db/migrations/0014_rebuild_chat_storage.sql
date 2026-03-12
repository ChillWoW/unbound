DROP TABLE IF EXISTS "conversation_reads";
--> statement-breakpoint
DROP TABLE IF EXISTS "todo_items";
--> statement-breakpoint
DROP TABLE IF EXISTS "message_attachments";
--> statement-breakpoint
DROP TABLE IF EXISTS "messages";
--> statement-breakpoint
DROP TABLE IF EXISTS "conversations";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"title_source" text NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"latest_message_id" text,
	"last_message_preview" text DEFAULT '' NOT NULL,
	"last_message_role" text,
	"latest_assistant_message_id" text,
	CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_user_last_message_at_idx" ON "conversations" USING btree ("user_id","last_message_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"parent_message_id" text,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"status" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_created_at_idx" ON "messages" USING btree ("conversation_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_role_created_at_idx" ON "messages" USING btree ("conversation_id","role","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_parent_message_id_idx" ON "messages" USING btree ("parent_message_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_attachments" (
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_attachments_message_idx" ON "message_attachments" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_attachments_conversation_idx" ON "message_attachments" USING btree ("conversation_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_attachments_storage_key_idx" ON "message_attachments" USING btree ("storage_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_reads" (
	"conversation_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_assistant_message_id" text,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_reads_pk" PRIMARY KEY("conversation_id","user_id"),
	CONSTRAINT "conversation_reads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "conversation_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "conversation_reads_last_read_assistant_message_id_messages_id_fk" FOREIGN KEY ("last_read_assistant_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_reads_user_updated_at_idx" ON "conversation_reads" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "todo_items" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todo_items_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "todo_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "todo_items_conversation_position_idx" ON "todo_items" USING btree ("conversation_id","position");
