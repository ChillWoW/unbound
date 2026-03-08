CREATE TABLE IF NOT EXISTS "todo_items" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'todo_items_conversation_id_conversations_id_fk'
	) THEN
		ALTER TABLE "todo_items"
		ADD CONSTRAINT "todo_items_conversation_id_conversations_id_fk"
		FOREIGN KEY ("conversation_id")
		REFERENCES "public"."conversations"("id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'todo_items_user_id_users_id_fk'
	) THEN
		ALTER TABLE "todo_items"
		ADD CONSTRAINT "todo_items_user_id_users_id_fk"
		FOREIGN KEY ("user_id")
		REFERENCES "public"."users"("id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "todo_items_conversation_position_idx"
ON "todo_items" USING btree ("conversation_id", "position");
