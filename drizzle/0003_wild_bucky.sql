CREATE TABLE `security_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `game_runs` ADD `seed` integer;--> statement-breakpoint
ALTER TABLE `game_runs` ADD `rules_version` integer;--> statement-breakpoint
ALTER TABLE `game_runs` ADD `verified` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `game_runs` ADD `rate_key` text;--> statement-breakpoint
ALTER TABLE `game_runs` ADD `proof_hash` text;--> statement-breakpoint
ALTER TABLE `game_runs` ADD `rewards` text;--> statement-breakpoint
ALTER TABLE `game_runs` ADD `cosmetic` text;--> statement-breakpoint
ALTER TABLE `game_runs` ADD `quest_date` text;--> statement-breakpoint
ALTER TABLE `game_runs` ADD `proof_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_runs_rate_started` ON `game_runs` (`rate_key`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_runs_verified_player` ON `game_runs` (`player_id`,`verified`,`quest_date`);