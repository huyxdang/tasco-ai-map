# BigSet enrichment jobs — Quận 1 depth pack

Run BEFOREHAND as batch (never live; the runtime hot path stays local-only).
Runner: local BigSet clone (`~/side-projects/bigset`), keys `TINYFISH_API_KEY` +
By default BigSet uses `OPENROUTER_API_KEY` from `.env.local` (execution-only).

For the hackathon OpenAI adapter, run `pnpm bigset:openai`. It aliases the
existing `OPENAI_API_KEY` into BigSet's OpenRouter-named compatibility slot,
points that slot at `https://api.openai.com/v1`, and selects
`gpt-5.6-luna` for schema inference, orchestration, and investigation. Override
the model with `BIGSET_OPENAI_MODEL`. BigSet 0.1.x does not expose reasoning
effort through its public configuration, so the adapter records low effort as
requested provenance but cannot guarantee the backend forwards that setting.

Each job below is the plain-English dataset description to give BigSet. The
explicit field list keeps its inferred schema aligned with
`attribute-dictionary.json` (`fieldMap` keys) so `merge-enrichment.mjs` can map
outputs onto canonical Vietnamese attribute tokens without guesswork.

LESSONS FROM RUN 1 (GLM-5.2, 150 rows):
- Do NOT ask for latitude/longitude — agents can't extract them from
  JS-rendered map pages (61% of rows came back blank). The merge matches by
  name + street_address against Overture's exact coordinates instead. Ask for
  "street_address (exact, with house number)" and drop lat/long from the field
  lists when submitting new batches.
- Populate ONE dataset at a time (two concurrent populates OOM a 16GB machine).
- Prioritize FAMOUS venues: phrase batch-2 descriptions as "the most popular /
  best-known Xs in Quận 1 according to Foody rankings" — demo questions hit the
  head of the popularity curve, not the long tail.
- Model: openai/gpt-oss-120b:nitro (user mandate v3 — nitro routes to the
  fastest provider, e.g. Cerebras; extraction work doesn't need a smarter model).

## Job 1 — q1-cafes
"Cafés and coffee shops in Quận 1 (District 1), Ho Chi Minh City, Vietnam,
researched from Foody.vn and Google Maps. For each café: name, street address,
latitude, longitude, rating (0-5), review_count, wifi (true/false), quiet
(true/false), study_friendly (true/false), power_outlets (true/false),
air_conditioned (true/false), outdoor_seating (true/false), price_tier
(cheap/moderate/premium), open_late (true if open after 22:00), opens_early
(true if open before 07:00), parking (true/false), takeaway (true/false)."

## Job 2 — q1-restaurants
"Restaurants in Quận 1 (District 1), Ho Chi Minh City, Vietnam, researched from
Foody.vn and Google Maps. For each restaurant: name, street address, latitude,
longitude, rating (0-5), review_count, cuisine (vietnamese/italian/japanese/
korean/other), price_tier (cheap/moderate/premium), reservations (true/false),
romantic (true/false), family_friendly (true/false), open_late (true if open
after 22:00), outdoor_seating (true/false), parking (true/false), nice_view
(true/false), air_conditioned (true/false)."

## Job 3 — q1-hotels
"Hotels in Quận 1 (District 1), Ho Chi Minh City, Vietnam, researched from
Google Maps and Agoda/Booking listings. For each hotel: name, street address,
latitude, longitude, rating (0-5), review_count, price_tier (cheap/moderate/
premium), pool (true/false), breakfast (true/false), breakfast_buffet
(true/false), family_friendly (true/false), parking (true/false), nice_view
(true/false), quiet (true/false)."

## Collect + merge
Export each finished dataset as JSON (`bigset rows <datasetId> --json`) into
`scratch/bigset-output/<job>.json`, then:

    node scripts/merge-enrichment.mjs scratch/bigset-output/*.json

The merge prints the match-rate report. The demo may flip to the open pack only
when café+restaurant match-rate ≥ 60% (autoplan AD9).
