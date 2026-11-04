import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const securityReports = sqliteTable('security_reports', {
  id: text('id').primaryKey(),
  reporterKey: text('reporter_key').notNull(),
  contact: text('contact').notNull(),
  details: text('details').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [index('idx_security_reporter_created').on(table.reporterKey,table.createdAt),index('idx_security_created').on(table.createdAt)]);
export const profiles = sqliteTable('player_profiles', {
  accountId: text('account_id').primaryKey(),
  data: text('data').notNull(),
  revision: integer('revision').notNull().default(1),
});

export const runs = sqliteTable('game_runs', {
  id: text('id').primaryKey(),
  playerId: text('player_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  nickname: text('nickname').notNull(),
  map: text('map').notNull(),
  difficulty: text('difficulty').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  score: integer('score'),
  durationSeconds: integer('duration_seconds'),
  outcome: text('outcome'),
  seed: integer('seed'),
  rulesVersion: integer('rules_version'),
  verified: integer('verified').notNull().default(0),
  rateKey: text('rate_key'),
  proofHash: text('proof_hash'),
  rewards: text('rewards'),
  cosmetic: text('cosmetic'),
  questDate: text('quest_date'),
  proofAttempts: integer('proof_attempts').notNull().default(0),
}, table => [
  index('idx_runs_started').on(table.startedAt),
  index('idx_runs_player_started').on(table.playerId, table.startedAt),
  index('idx_runs_rate_started').on(table.rateKey, table.startedAt),
  index('idx_runs_verified_player').on(table.playerId, table.verified, table.questDate),
]);
export const securityState = sqliteTable('security_state', {key:text('key').primaryKey(),value:text('value').notNull()});
