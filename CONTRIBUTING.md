# Contributing

1. **Don't add fake data.** Never hardcode financial results, prices or dates, and never add sample figures to UI. Use `DataUnavailable` states.
2. **No arithmetic in prompts.** Calculations belong in `src/lib/domain` with unit tests that cover negative values, zero denominators and missing data.
3. **Respect source terms.** Don't add scrapers for undocumented exchange endpoints. New data sources need an entry in DATA_SOURCES.md, with licence evidence.
4. **Keep secrets server-side.** Put them in `.env` only, never with a `NEXT_PUBLIC_` prefix, and never commit them.
5. **Don't commit data.** Downloaded files and API responses stay out of git (`data/raw/` is ignored).
6. **Pass the checks before a PR:**

   ```bash
   npm test
   npm run typecheck
   npm run lint
   npm run build
   ```

7. **Licensing.** Contributions are licensed under Apache-2.0.
