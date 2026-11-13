CREATE TRIGGER leaderboard_insert AFTER INSERT ON game_runs
WHEN NEW.verified=1 AND NEW.finished_at IS NOT NULL
BEGIN
  INSERT INTO security_state (key,value) VALUES ('leaderboard_revision','1')
  ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1;
END;
--> statement-breakpoint
CREATE TRIGGER leaderboard_update AFTER UPDATE OF score,verified,finished_at,player_id,nickname,map,difficulty ON game_runs
WHEN (OLD.verified=1 AND OLD.finished_at IS NOT NULL) OR (NEW.verified=1 AND NEW.finished_at IS NOT NULL)
BEGIN
  INSERT INTO security_state (key,value) VALUES ('leaderboard_revision','1')
  ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1;
END;
--> statement-breakpoint
CREATE TRIGGER leaderboard_delete AFTER DELETE ON game_runs
WHEN OLD.verified=1 AND OLD.finished_at IS NOT NULL
BEGIN
  INSERT INTO security_state (key,value) VALUES ('leaderboard_revision','1')
  ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1;
END;
