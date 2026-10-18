Hockey Goalie Stats Benchmark Worker v1.1

The Worker accepts schema versions 1.0 and 1.1. Version 1.1 adds match_format so 7-a-side and 11-a-side benchmark cohorts stay separate. Older matches migrate as 11-a-side.

Cloudflare dashboard deployment:

1. Open Workers & Pages, then hgs-benchmark-api.
2. Replace the current Worker code with worker.js and deploy it.
3. On a new D1 database, run schema.sql. On the existing hgs-benchmarks-prod database, run migrations/0002_match_format.sql before deploying this Worker. This adds the match_format column and index; historical rows default to 11-a-side.
4. In the Worker's Settings, confirm the D1 binding variable is DB and points to hgs-benchmarks-prod.
5. Open https://hgs-benchmark-api.datadrivendevelopmenthgs.workers.dev/api/v1/health
6. Confirm the response says {"ok":true,"database":"connected"}.
7. Open app v5.85, opt in and select Upload Data & Refresh Benchmarks.

Duplicate protection:

- Each anonymous goalkeeper has a permanent goalkeeper_id.
- Each match has a permanent benchmark_match_id.
- The database primary key is goalkeeper_id plus benchmark_match_id.
- Re-uploading replaces the saved version of that match and its shots.
- Matches removed from the authoritative eligible upload are removed centrally.

Privacy:

- The app sends no goalkeeper names, team names, opponent names or match names.
- Opting out removes the anonymous goalkeeper, matches and shots from the central database.

Benchmark format migration:

- A clean database gets match_format from schema.sql.
- Existing databases need migrations/0002_match_format.sql exactly once before the updated Worker is deployed. Do not run the migration twice.
- The app labels legacy matches without a format as 11-a-side.
