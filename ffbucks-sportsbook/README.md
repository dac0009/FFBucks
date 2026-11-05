# FFBucks sportsbook

A play-money sportsbook on the FFBFFL's own weekly matchups. **Play money only. No real-money wagering.**

- First-time setup: see [SETUP.md](SETUP.md).
- Lines come from the league site (`FantasyFootballs/data/sportsbook/lines.json`); the line model is documented in that repo's `docs/METRICS.md`.
- Every rule (locks, self-betting, balances, grading) is enforced by the database in `supabase/migrations/`.
- `npm test` runs the odds, sync and full database tests. `npm run build` builds the site.
- `tests/e2e/fake-supabase.mjs` is a test-only stand-in for Supabase used to click through the app in a browser.
