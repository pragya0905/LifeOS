# LifeOs

Personal life-tracking web app — tasks, daily schedule, journaling, and habit
trackers, with AI-assisted priority suggestions and journal habit-extraction
via the Claude API.

## Stack

- **Frontend**: React 19 + Vite + Tailwind CSS 4 (`frontend/`)
- **Backend**: AWS SAM — Lambda (Node.js 20, TypeScript, esbuild) + API
  Gateway HTTP API (`backend/`)
- **Database**: DynamoDB (`PAY_PER_REQUEST`, one table per feature)
- **Auth**: AWS Cognito User Pool, JWT authorizer, custom React sign-up/login
  UI via Amplify Auth (no Hosted UI)
- **AI**: Anthropic Claude API (`claude-sonnet-5`), structured JSON output
- **Voice input**: Browser Web Speech API
- **PWA**: Web App Manifest, installable, custom service worker

## Status

**Phase 1 — complete.** Core CRUD for tasks/journal/habits, AI-assisted
priority + habit extraction, daily schedule view, voice-to-text journaling,
and PWA installability are all built, deployed, and verified against real
AWS infrastructure (`ap-southeast-2`, stack `lifeos-backend-dev`).

Phase 2 not yet started.

## Phase 1 build log

Each step below was deployed to real AWS and verified end-to-end (Cognito
JWTs, DynamoDB reads/writes, API Gateway authorizer, and — from step 2
onward — the browser UI) before moving to the next.

| Step | What shipped | Endpoint(s) |
|---|---|---|
| 1 | SAM backend skeleton: Cognito User Pool + client, 3 DynamoDB tables (`TasksTable`, `JournalEntriesTable`, `HabitLogsTable`), HTTP API with Cognito JWT authorizer, health-check Lambda | `GET /whoami` |
| 2 | Frontend scaffold: React Router protected routes, Amplify Auth wired to the real user pool, custom sign-up/login forms | — |
| 3 | Tasks CRUD (no AI yet) — first use of the ownership pattern (`userId` from JWT `sub`, cross-user access denied) | `POST /tasks`, `GET /tasks`, `PATCH /tasks/{id}` |
| 4 | Journal entry CRUD, plain text only | `POST /journal`, `GET /journal` |
| 5 | Habit tracker, manual ticking only | `GET /habits/{date}`, `PATCH /habits/{date}/{type}` |
| 6 | Voice-to-text on the Journal form via the Web Speech API | — (frontend only) |
| 7 | Claude API habit auto-extraction on journal save, with a "manual wins" atomic write guard so AI writes never clobber a manual edit | uses `PATCH /habits/{date}/{type}` internally |
| 8 | Claude API-suggested task priority | — (Tasks UI + Lambda) |
| 9 | Daily schedule view, pulling tasks + habits together for a given date | `GET /schedule/{date}` |
| — | Post-launch cleanup: purged test data from all 3 tables, tightened IAM (`DynamoDBReadPolicy` instead of `DynamoDBCrudPolicy`) on the four read-only functions (`ListTasksFunction`, `ListJournalEntriesFunction`, `GetHabitsForDateFunction`, `GetScheduleFunction`) | — |
| — | PWA setup: manifest + maskable icons, installable (`beforeinstallprompt` UI), custom `injectManifest` service worker with `push`/`notificationclick` listeners and a local test-notification pipeline (no backend push-sending infra yet — permission request + local display only) | — |

### Conventions established along the way

- **Ownership pattern**: every Lambda derives `userId` from the Cognito JWT
  `sub` claim — never from the request body — so cross-user access is
  structurally impossible, not just checked. Verified with two real users at
  every CRUD step.
- **Least-privilege IAM**: each function's DynamoDB policy is scoped to
  exactly the table(s) it touches; read-only functions get
  `DynamoDBReadPolicy`, write-path functions get `DynamoDBCrudPolicy`.
- **Manual-wins writes**: AI-driven habit extraction uses a
  `ConditionExpression` (`attribute_not_exists(...) OR #source = :aiSource`)
  so it can never overwrite a manual edit, without needing a separate read.
- **Secrets**: the Anthropic API key lives in SSM Parameter Store
  (`SecureString`), never in `template.yaml` or source.

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

## Repo layout

```
LifeOs/
├── backend/            # SAM app: template.yaml, Lambda functions (src/functions/*), shared code (src/common/)
└── frontend/            # Vite + React app
```
