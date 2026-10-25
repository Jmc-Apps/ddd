-- DDD v1.34: keep Field Hockey and Indoor Hockey benchmark data apart.
-- Run ONCE on the existing hgs-benchmarks-prod database, after 0002_match_format.sql, BEFORE deploying the v1.34 Worker.
-- Existing rows default to field_hockey. Indoor rows uploaded by older app versions were stored as Field 11-a-side;
-- they are corrected automatically: the next Field upload removes them from the Field set, and the next Indoor upload re-files them as indoor_hockey.
ALTER TABLE benchmark_matches ADD COLUMN sport TEXT NOT NULL DEFAULT 'field_hockey';
CREATE INDEX IF NOT EXISTS idx_benchmark_match_sport_cohort ON benchmark_matches(sport, match_format, goalkeeper_gender, goalkeeper_age_group, goalkeeper_team_level, goalkeeper_team_tier);
CREATE INDEX IF NOT EXISTS idx_benchmark_match_goalkeeper_sport ON benchmark_matches(goalkeeper_id, sport);
