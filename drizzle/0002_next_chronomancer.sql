CREATE TABLE `security_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_key` text NOT NULL,
	`contact` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_security_reporter_created` ON `security_reports` (`reporter_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_security_created` ON `security_reports` (`created_at`);