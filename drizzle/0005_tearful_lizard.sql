CREATE TABLE `run_replays` (
	`run_id` text PRIMARY KEY NOT NULL,
	`score` integer NOT NULL,
	`ticks` integer NOT NULL,
	`moves` text,
	`bytes` integer NOT NULL,
	`stored_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_replays_score` ON `run_replays` (`score`);--> statement-breakpoint
CREATE INDEX `idx_replays_stored` ON `run_replays` (`stored_at`);