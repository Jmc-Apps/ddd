Hockey Goalie Stats Benchmark Worker v1.2

The Worker accepts schema versions 1.0, 1.1 and 1.2.
- 1.1 added match_format so 7-a-side and 11-a-side Field Hockey cohorts stay separate.
- 1.2 adds sport so Field Hockey and Indoor Hockey data stay separate. Each app's upload now only replaces matches for its own sport, so a Field upload can no longer delete Indoor matches (or the reverse). Indoor matches are stored with match_format "indoor".
- Uploads from older app versions without a sport value are filed by their sourceApp name ("Indoor Hockey Goalie Stats" = indoor_hockey, anything else = field_hockey).

Updating the existing hgs-benchmarks-prod database (do these in order):

1. Confirm migrations/0002_match_format.sql has already been applied (it has: PRAGMA table_info(benchmark_matches) showed match_format). Do not run 0002 again.
2. In the D1 console for hgs-benchmarks-prod, run migrations/0003_sport.sql exactly once.
   Check: PRAGMA table_info(benchmark_matches) now lists sport, TEXT, NOT NULL, default 'field_hockey'.
   The old v1.1 Worker keeps working after this step, so there is no downtime.
3. Open Workers & Pages, then hgs-benchmark-api. Replace the Worker code with worker.js and deploy it.
4. In the Worker's Settings, confirm the D1 binding variable is DB and points to hgs-benchmarks-prod.
5. Open https://hgs-benchmark-api.datadrivendevelopmenthgs.workers.dev/api/v1/health
   It should show "ok":true, "sportColumn":true and "matchFormatColumn":true, plus the current match count.
   If sportColumn is false, step 2 was not applied: run it before using the apps.
6. Open the Field Hockey app with an opted-in goalkeeper, then the Indoor Hockey app. Each uploads automatically.
   Older Indoor rows that were wrongly stored as Field 11-a-side are corrected by these two uploads.

New database: run schema.sql only (it already includes match_format and sport).

wrangler.toml still contains a placeholder database_id. Replace it with the real hgs-benchmarks-prod id before using Wrangler; the Cloudflare dashboard route above does not need it.

Deploying the apps, deploying the Worker and migrating D1 are three separate steps. Uploading a new app ZIP does not change the Worker or the database.

Duplicate protection:
- Each anonymous goalkeeper has a permanent goalkeeper_id, shared by Field and Indoor.
- Each match has a permanent benchmark_match_id.
- The primary key is goalkeeper_id plus benchmark_match_id.
- Re-uploading replaces the saved version of that match and its shots.
- Matches removed from an app's eligible upload are removed centrally for that sport only.

Privacy:
- The apps send no goalkeeper names, team names, opponent names or match names.
- Opting out removes the anonymous goalkeeper and all their matches and shots, in both sports.
