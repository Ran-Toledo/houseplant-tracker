CREATE TABLE `care_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`plant_id` text NOT NULL,
	`activity_type` text NOT NULL,
	`mode` text NOT NULL,
	`interval_days` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`snoozed_until` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `care_schedules_plant_type_idx` ON `care_schedules` (`plant_id`,`activity_type`);