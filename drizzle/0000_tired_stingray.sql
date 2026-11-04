CREATE TABLE `game_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`nickname` text NOT NULL,
	`map` text NOT NULL,
	`difficulty` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`score` integer,
	`duration_seconds` integer,
	`outcome` text
);
--> statement-breakpoint
CREATE INDEX `idx_runs_started` ON `game_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_runs_player_started` ON `game_runs` (`player_id`,`started_at`);