CREATE TABLE `ai_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`plant_id` text,
	`photo_id` text,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`latency_ms` integer,
	`error_code` text,
	`result_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_requests_created_idx` ON `ai_requests` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_requests_plant_idx` ON `ai_requests` (`plant_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
