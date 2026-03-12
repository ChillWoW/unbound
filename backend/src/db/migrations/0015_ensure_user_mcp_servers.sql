CREATE TABLE IF NOT EXISTS "user_mcp_servers" (
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_mcp_servers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_mcp_servers_user_updated_at_idx" ON "user_mcp_servers" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_mcp_servers_user_tool_prefix_unique" ON "user_mcp_servers" USING btree ("user_id","tool_prefix");
