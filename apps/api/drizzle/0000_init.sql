CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`plant_id` text NOT NULL,
	`activity_type` text NOT NULL,
	`performed_at` text NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activities_plant_type_time_idx` ON `activities` (`plant_id`,`activity_type`,`performed_at`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`plant_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`is_cover` integer DEFAULT false NOT NULL,
	`captured_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photos_storage_key_unique` ON `photos` (`storage_key`);--> statement-breakpoint
CREATE INDEX `photos_plant_idx` ON `photos` (`plant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `photos_one_cover_per_plant` ON `photos` (`plant_id`) WHERE "photos"."is_cover" = 1;--> statement-breakpoint
CREATE TABLE `plants` (
	`id` text PRIMARY KEY NOT NULL,
	`species_id` text,
	`nickname` text NOT NULL,
	`custom_species_name` text,
	`location` text,
	`light_exposure` text,
	`window_orientation` text,
	`acquired_at` text,
	`pot_diameter_cm` real,
	`pot_material` text,
	`has_drainage` integer,
	`soil_description` text,
	`condition` text DEFAULT 'unknown' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plants_species_idx` ON `plants` (`species_id`);