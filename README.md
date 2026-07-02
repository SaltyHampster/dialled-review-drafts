# Dialled Review Drafts

Discord-triggered call review draft generator. Separate service from your existing **dialled-call-reviews** repo (the one that posts into student channels and handles Daily Accountability) - this only produces drafts and hands finished, edited reviews back to that existing service's API at the end.

## How it works

1. You paste a transcript in a dedicated Discord channel. The bot logging in is the same bot as your other services - no new Discord application.
2. This service classifies the call type, pulls relevant past examples + lessons from its own Postgres, and generates a draft review.
3. It posts the draft back in Discord with a link to the edit page on your Lovable portal.
4. On the portal, you pick which student the review is for (dropdown populated from the existing service's real roster), edit the draft, and hit submit.
5. This service saves the before/after pair (for the lessons loop), flattens the edited draft into plain text, and calls `POST /api/review-complete` on your existing `dialled-call-reviews` service - the exact same endpoint it already uses to post into a student's channel.
6. A weekly script distills recent edits into reusable "lessons," pulled into future drafts automatically.

## No shared database, on purpose

This service has entirely its **own** Postgres (new Railway project) for `transcripts`, `drafts`, `call_review_edits`, `lessons_learned`, `call_review_examples`.

It never touches the existing service's database. Instead it calls two endpoints already exposed on that service:

- `GET /api/students` → the student roster (`student_id`, `name`, `channel_id`), cached here for 5 minutes to avoid hammering it
- `POST /api/review-complete` → hands off the finished review; the existing service resolves the channel and posts it, exactly as it does today for every other review

**On keeping this in the same Railway project as the existing service, for private networking:** not worth it here. Private networking on Railway only works between services *within the same project* - so putting this in the same project would save you a public network hop for DB access, but you don't need DB access at all, since the existing service already exposes exactly what you need over its own API. Two separate projects, talking over HTTP with an API key, keeps both services independently deployable and doesn't risk one project's issues bleeding into the other. Stick with the isolated-projects pattern you've been using for your other bots.

## 1. GitHub setup

```bash
git init
git add .
git commit -m "Initial scaffold"
gh repo create dialled-review-drafts --private --source=. --push
```

## 2. Discord setup - reuse, don't recreate

No new Discord application needed.

1. Pick or create the channel you'll paste transcripts into.
2. Confirm your existing bot (Application ID `1505924516587638876`) has `Send Messages`, `Read Message History`, and `View Channel` on that channel - likely already true from your other bots.
3. Put that channel's ID into `DISCORD_CALL_REVIEW_DRAFTS_CHANNEL_ID`, and the same bot token your other services use into `DISCORD_BOT_TOKEN`.

## 3. Railway setup

Create a **new Railway project** (separate from `dialled-call-reviews`, same isolation pattern as your other bots).

**Service 1: the bot + API** (`npm start`)
- Attach a Postgres plugin to *this* project for this service's own tables.
- Set all env vars from `.env.example`. `CALL_REVIEW_SERVICE_API_KEY` should match whatever `PORTAL_API_KEY` is set to on the existing service - check its Railway variables to get the value.
- After first deploy, run the migration once: `railway run npm run migrate`.

**Service 2: weekly distillation cron**
- Same repo, same env vars, Railway Cron Job, start command `npm run distill`, scheduled weekly (e.g. `0 6 * * 1`).

## 4. Seed the few-shot examples

Pull your best historical call reviews into a JSON file matching the shape in `src/scripts/seedExamples.js`, then:

```bash
railway run node src/scripts/seedExamples.js path/to/examples.json
```

15-25 examples spread across call types and scenario tags meaningfully improves draft quality from day one.

## 5. Lovable portal side

Two endpoints for the portal to call (both require header `x-internal-secret` matching `INTERNAL_WEBHOOK_SECRET` - unrelated to the existing service's own API key):

- `GET /api/students` → returns `{ students: [{ student_id, name, channel_id }] }` for the dropdown
- `GET /api/draft/:transcriptId` → returns the transcript + latest draft
- `POST /api/submit` → body `{ transcriptId, draftId, finalOutput, studentId, callDate?, callLink?, videoReviewLink? }`

Give Lovable this prompt to build the edit page:

> Add a new admin-only route `/call-review-admin/:transcriptId` to the Dialled portal. On load, call `GET {REVIEW_DRAFTS_SERVICE_URL}/api/draft/:transcriptId` and `GET {REVIEW_DRAFTS_SERVICE_URL}/api/students`, both with header `x-internal-secret: {secret}`. Show a required student dropdown populated from the students response (label: name, value: student_id). Render the draft's `sections` array as individually editable text areas, plus an editable `main_takeaways` list. Show call type read-only at the top. Optionally include fields for call link and video review link. Add a "Submit Review" button that POSTs to `{REVIEW_DRAFTS_SERVICE_URL}/api/submit` with the same header, sending `{ transcriptId, draftId, finalOutput, studentId, callLink, videoReviewLink }` where `finalOutput` matches the draft's original JSON shape with edited text. Disable submit until a student is selected. Use existing Dialled brand styling (red `#E24B4A`, cream `#FAF6EF`). On success, show which channel it was posted to and disable the form.

You'll need `REVIEW_DRAFTS_SERVICE_URL` and the shared secret as env vars in Lovable Cloud.

## What gets sent to the existing service

`POST /api/submit` here calls `POST {CALL_REVIEW_SERVICE_BASE_URL}/api/review-complete` with:

```json
{
  "student_id": "...",
  "student_name": "...",
  "call_date": "...",
  "notes": "**Discovery**\n...\n\n**Main Takeaways**\n• ...",
  "call_link": "...",
  "video_review_link": "..."
}
```

`notes` is the structured draft flattened into the same plain-text format `buildReviewEmbeds` in your existing `index.js` already expects and splits into chunks - nothing on the existing service needs to change.

## Local development

```bash
npm install
cp .env.example .env   # fill in values
npm run migrate
npm start
```

## Repo structure

```
src/
  index.js                entrypoint - starts bot + API together
  db/
    pool.js                this service's own Postgres
    migrate.js               migration runner (this service's DB only)
  migrations/
    001_init.sql              this service's schema
  discord/
    bot.js                   Discord listener - classify, generate, post draft
  routes/
    api.js                   endpoints the Lovable portal calls
  services/
    anthropicClient.js        Claude API client
    classify.js                call-type classification
    retrieval.js                few-shot examples + lessons from this service's own DB
    generate.js                  conditional-section draft generation
    students.js                  calls the existing service's /api/students (HTTP, not DB)
    formatReview.js               flattens structured draft into plain-text notes
  scripts/
    seedExamples.js              one-time historical review import
    distillLessons.js             weekly cron - edits -> reusable lessons
```
