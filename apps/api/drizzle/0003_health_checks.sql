CREATE TABLE `health_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`plant_id` text NOT NULL,
	`photo_id` text,
	`ai_request_id` text NOT NULL,
	`condition` text NOT NULL,
	`confidence` text NOT NULL,
	`assessment_json` text NOT NULL,
	`applied_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ai_request_id`) REFERENCES `ai_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `health_checks_plant_time_idx` ON `health_checks` (`plant_id`,`created_at`);