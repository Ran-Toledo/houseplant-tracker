CREATE TABLE `care_guide_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`species_id` text NOT NULL,
	`lang` text NOT NULL,
	`section_key` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`model` text NOT NULL,
	`vector` blob NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `care_guide_sections_lang_idx` ON `care_guide_sections` (`lang`);