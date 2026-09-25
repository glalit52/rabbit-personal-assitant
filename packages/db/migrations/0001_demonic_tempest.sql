ALTER TABLE "identities" ADD COLUMN "external_account_id" varchar(255);--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identities_provider_idx" ON "identities" USING btree ("tenant_id","provider");