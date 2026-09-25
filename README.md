# LifeOs

Personal life-tracking web app — tasks, journal, habits, medications, cycle
tracking, budget, routines, wishes, and AI-generated insights, all in one
account. The core idea: a normal journal sentence, not a form, is the
primary way data gets in — Claude reads what you wrote and fills in the
rest.

**Demo:** [d27z12rdh95fmx.cloudfront.net](https://d27z12rdh95fmx.cloudfront.net)
— a public one-pager with live screenshots and real product/engineering
details. The app itself requires an account (built for personal use, not
public signup), so this is the best way to see how it actually works
without logging in.

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** — component breakdown, data model,
  AI integration internals, deployment, cost model, and known limitations
  (what was deliberately deferred and why).
- **[HLD & LLD](docs/HLD_LLD.md)** — requirements, capacity estimation, full
  field-level schemas, API contracts, sequence diagrams, and the exact
  algorithms running in production.
- **[Alexa integration](docs/ALEXA.md)** — optional voice control via a custom
  Alexa skill; manual Alexa Developer Console setup (the AWS side deploys
  with everything else).

## Features

- **Tasks** — due dates, effort estimates, AI-suggested priority with a
  deterministic guardrail (forced to High the moment the math proves the
  estimate no longer fits before the deadline — no AI call needed for that).
- **Journal** — free text or voice input, one entry per day. Claude extracts
  water, exercise, steps (or distance, converted to steps via your height),
  food + meal type, sleep times, weight, mood, medications taken, routine
  steps completed, cycle events, calls, and expenses — never overwriting a
  manually-entered value.
- **Habits** — daily water/exercise/steps tracking with per-metric goals and
  streaks, editable up to 8 days back.
- **Medications** — dosage/notes, daily taken/missed logging, a rolling
  adherence percentage, daily push reminders.
- **Logs** — catch-all for food and calls.
- **Cycle** — period start/end and symptom logging, with phase estimation
  and next-period prediction from your own logged history (never a medical
  claim). Hidden entirely if you set sex to male.
- **Budget** — per-category recurring monthly limits, expense tracking
  against an overall monthly budget.
- **Routines** — multi-step daily checklists (skincare, morning routine,
  etc.) with per-step done/skipped state and streaks.
- **Wishes** — goal tracking across 5 progress modes (percentage, milestone,
  habit-linked, time-based, quantity), with deadline and falling-behind
  push reminders.
- **Insights** — on-demand AI summary (today/week) plus an automatic weekly
  digest push, roughly once every 7 days per user.
- **Assistant** — a dedicated chat page (voice in/out, not just text) backed by a
  Claude tool-calling loop that can read and log almost everything above —
  habits, logs, routine/medication ticks, tasks, journal — on request. Adds
  three things beyond simple logging: semantic search over your journal
  history (RAG, via Bedrock Titan embeddings), a persistent memory of facts
  it's learned about you across conversations, and a deterministic
  `get_progress_summary` tool (falling-behind wishes, habit streaks, budget
  pace projections — all computed in code, never estimated by the model)
  that grounds its coaching in real numbers and states gaps plainly before
  offering encouragement.
- **Calendar** — month grid on desktop, a reflowed agenda list on phones.
- Installable **PWA** with Web Push notifications.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4, route-based
  code splitting, a shared design-token system (`frontend/`)
- **Backend**: AWS SAM — 58 Lambda functions (Node.js 20, arm64, TypeScript,
  esbuild) behind an API Gateway HTTP API, 52 routes (`backend/`)
- **Database**: DynamoDB — 16 tables, `PAY_PER_REQUEST`, every table
  partitioned by the authenticated user's ID (no GSIs — every access
  pattern is a direct key lookup)
- **Auth**: AWS Cognito User Pool, JWT authorizer, custom React
  sign-up/login UI via Amplify Auth (no Hosted UI); a second app client
  handles OAuth account linking for the optional Alexa skill
- **AI**: Anthropic Claude API (`claude-haiku-4-5`) for structured JSON
  output (journal extraction, insights, task-priority suggestion) and for
  the Assistant's tool-calling chat loop; AWS Bedrock Titan Embeddings for
  journal semantic search — both stay inside the same AWS account rather
  than adding another vendor
- **Notifications**: Web Push (VAPID) via 5 independently-scheduled Lambdas
- **Hosting**: S3 + CloudFront for both the app frontend and the public demo
  site (`demo-site/`) — two fully independent stacks/distributions
- **Voice**: Browser Web Speech API for input (Journal, Alexa-style quick
  logging, and the Assistant), browser `SpeechSynthesis` for the
  Assistant's spoken replies — both free, zero new dependency
- **PWA**: Web App Manifest, installable, custom `injectManifest` service
  worker

## Status

In active use daily by a small number of real users. Deployed to a single
environment (`ap-southeast-2`, stack `lifeos-backend-dev`) — no separate
staging stage yet, a deliberate tradeoff at this scale rather than an
oversight.

### Conventions established along the way

- **Ownership pattern**: every Lambda derives `userId` from the Cognito JWT
  `sub` claim — never from the request body — and every DynamoDB table
  partitions on it, so cross-user access is structurally impossible, not
  just checked.
- **Least-privilege IAM**: each function's policies are scoped to exactly
  the table(s)/parameter(s) it touches.
- **Manual-wins writes**: AI-driven extraction uses a `ConditionExpression`
  (`attribute_not_exists(...) OR #source = :aiSource`) so it can never
  overwrite a manual edit.
- **Don't trust the model with arithmetic**: where AI output feeds a
  calculation (e.g. distance → step count, or the Assistant's falling-behind/
  streak/budget-pace numbers), the model reports the raw fact and the app
  computes the result deterministically in code — Claude only narrates it.
- **Best-effort AI, mandatory core write**: journal entries, task saves,
  etc. always succeed even if the Claude call fails — AI enrichment is
  additive, never load-bearing.
- **Secrets**: the Anthropic API key and Web Push VAPID private key live in
  SSM Parameter Store (`SecureString`), never in `template.yaml` or source.

## Local development

### Backend

```bash
cd backend
npm install
sam build
sam deploy --guided   # first time only; subsequent: sam build && sam deploy
```

Stack config lives in `backend/samconfig.toml` (region `ap-southeast-2`,
stack name `lifeos-backend-dev`). No secrets are stored there.

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Other scripts: `npm run build` (typecheck + production bundle),
`npm run preview` (serve the production bundle locally), `npm run lint`.

To try the PWA install prompt and real notification permission grant, use
`npm run build && npm run preview` and open the printed URL — some install
UX only fires over a production-style build.

### Demo site

```bash
cd demo-site
sam build
sam deploy --guided   # first time only
aws s3 cp index.html s3://<DemoSiteBucketName output>/index.html
```

A separate, independent stack (`lifeos-demo-site-dev`) — its own S3 bucket
and CloudFront distribution, no shared resources with the app. See
`demo-site/template.yaml` for details.

## Repo layout

```
LifeOs/
├── backend/            # SAM app: template.yaml, Lambda functions (src/functions/*), shared code (src/common/)
├── frontend/            # Vite + React app
└── demo-site/            # Standalone public one-pager + its own SAM template/CloudFront stack
```
