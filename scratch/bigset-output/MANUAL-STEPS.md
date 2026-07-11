# BigSet enrichment jobs — status + manual steps for Edward

BigSet **does** run fully headless (no UI needed) via `npx @adamexu/bigset`. It is
**not** a UI-only tool. The only reason the three jobs did not finish is an
**OpenRouter account/key limit** — a billing action only you can take. Everything
else was automated.

## What was done (headless, no clicking)

1. Started BigSet locally: `npx @adamexu/bigset start` (downloads a release, boots
   Convex + backend + frontend + a local OS-keychain credential bridge). No Docker.
2. Seeded credentials into the OS keychain from `.env.local` (service
   `ai.bigset.local-credentials`, accounts `bigset-local:tinyfish` /
   `bigset-local:openrouter`). Keys were never printed or copied elsewhere. They
   persist, so you won't need to re-enter them.
3. Submitted all three datasets with the verbatim descriptions from
   `scripts/bigset-jobs/README.md` via `bigset create "<desc>" --rows 50`.
4. Each dataset built, ran research sub-agents, and inserted rows — then failed
   partway. Partial rows were exported to `scratch/bigset-output/<job>.json`.

Dataset IDs are in `scratch/bigset-output/jobs.json`.

## The two blockers hit

1. **Default model blocked by data policy.** BigSet's default populate model is
   `qwen/qwen3.7-max`. Your OpenRouter account's privacy/data policy blocks the
   providers that serve it → `No endpoints available matching your guardrail
   restrictions and data policy` (HTTP 404). Worked around by overriding the
   populate models to `anthropic/claude-sonnet-4.6` (which your account allows —
   schema inference already used it successfully).

2. **API key credit limit exhausted (the hard stop).** The OpenRouter key in
   `.env.local` has a **per-key spend limit of $10**, and it is spent
   (`usage ≈ $9.96`, `limit_remaining ≈ $0.04`). Populate now returns HTTP 402:
   *"This request requires more credits, or fewer max_tokens."* Your account still
   has ~$9.5 of its $25 balance, but this key is capped at $10 and can't reach it.
   (The Anthropic override in blocker #1 is ~10x pricier than qwen and is what
   drained the key this fast.)

## What YOU need to do (a few clicks on openrouter.ai)

Pick ONE of these, then re-run (commands below):

- **Cheapest path:** at <https://openrouter.ai/settings/privacy>, enable the
  provider setting that allows the qwen endpoints (allow providers that may train
  on prompts / relax the data policy). Then you can drop the Anthropic override and
  use BigSet's cheap default model — and **also** raise the key's spend limit so it
  can draw on the remaining account balance.
- **Simplest path:** at <https://openrouter.ai/settings/keys>, raise/remove the
  `$10` limit on this key (or create a new uncapped key and put it in `.env.local`).
  Keep the Anthropic override. Note this model is expensive; 3×50 rows may cost a
  few dollars.

## Re-run after fixing the key (all headless)

```bash
# 1. start the backend (keys already in keychain)
cd ~/side-projects/tasco-ai-map
set -a; source .env.local; set +a
BIGSET_LOCAL_WORKSPACE_ID=bigset-local BIGSET_KEYCHAIN_PORT=3599 \
  POPULATE_ORCHESTRATOR_MODEL=anthropic/claude-sonnet-4.6 \
  INVESTIGATE_SUBAGENT_MODEL=anthropic/claude-sonnet-4.6 \
  npx @adamexu/bigset start &
# (if you fixed the data policy in path #1, you can omit the two *_MODEL= overrides)

# 2. re-run populate for each dataset (re-populate replaces existing rows)
npx @adamexu/bigset populate jd7em53sxpp66hycp9n58bjemd8abtzm   # q1-cafes
npx @adamexu/bigset populate jd744eta9tefxtgwcdr4qt2mdh8aame0   # q1-restaurants
npx @adamexu/bigset populate jd784p7jr4fybkrv7jyeynz67n8abcge   # q1-hotels

# 3. watch status until "live"
npx @adamexu/bigset status jd7em53sxpp66hycp9n58bjemd8abtzm

# 4. export when done
npx @adamexu/bigset rows jd7em53sxpp66hycp9n58bjemd8abtzm --json > scratch/bigset-output/q1-cafes.json
npx @adamexu/bigset rows jd744eta9tefxtgwcdr4qt2mdh8aame0 --json > scratch/bigset-output/q1-restaurants.json
npx @adamexu/bigset rows jd784p7jr4fybkrv7jyeynz67n8abcge --json > scratch/bigset-output/q1-hotels.json

# 5. then the merge from scripts/bigset-jobs/README.md
node scripts/merge-enrichment.mjs scratch/bigset-output/*.json
```

## Current partial exports (already on disk)

- `scratch/bigset-output/q1-cafes.json` — 20 rows
- `scratch/bigset-output/q1-restaurants.json` — 18 rows
- `scratch/bigset-output/q1-hotels.json` — 15 rows

These have the full requested schema (name, address, lat/lng, rating, wifi,
price_tier, study_friendly, etc.). Some boolean cells are blank where the agent
couldn't verify them — a full re-run after topping up should fill more in.

## Note: local backend was STOPPED to free RAM

The BigSet backend was shut down (nothing left listening on 3500/3501/3210/3599).
The datasets persist in Convex on disk (`~/.bigset/data`), and the partial exports
are already saved, so nothing was lost. Restart with the `start_backend_command`
in `jobs.json` (or the block above) only after you've fixed the OpenRouter key —
do NOT restart/re-populate before then, since every populate call costs money.
