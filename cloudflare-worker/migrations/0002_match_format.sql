ALTER TABLE benchmark_matches ADD COLUMN match_format TEXT NOT NULL DEFAULT '11-a-side';
CREATE INDEX IF NOT EXISTS idx_benchmark_match_format_cohort ON benchmark_matches(match_format, goalkeeper_gender, goalkeeper_age_group, goalkeeper_team_level, goalkeeper_team_tier);
