# Integration tests (disposable staging only)

These scripts call a deployed LifeOs stack. They must never run against the real dev stack.
The coding session does not run them; you do.

## conversation-consistency.mjs (backend-v1 CS2)

Checks whether a conversation read right after a reply returns its turns. Run it once before
CS2 is deployed (baseline) and once after (expect zero misses).

### Prerequisites
- A disposable staging stack deployed from a disposable AWS account or a separate stack name
  (backend-v1 O8). It must not use the dev names in account 593110023904.
- A test user in that stack's Cognito pool.
- An ID token for that user. Get one by signing in as the test user in the app pointed at
  staging, or with the AWS CLI using the test user's credentials. Do not paste your real token.
- An Anthropic key with a spend cap, stored in the staging SSM parameter (backend-v1 O4).

### Environment
| Variable | Value |
|---|---|
| `LIFEOS_API_URL` | staging HTTP API base URL, for example `https://<id>.execute-api.ap-southeast-2.amazonaws.com/staging` |
| `LIFEOS_CHAT_URL` | staging chat Function URL |
| `LIFEOS_ID_TOKEN` | the test user's ID token |
| `ITERATIONS` | optional, default 50, max 200. Each iteration is one real model call. |
| `CLEANUP` | optional, `1` deletes the test conversations afterwards |

The script refuses to run if either URL contains the real dev API id (`yofhh85gua`).

### Run
```sh
cd backend
LIFEOS_API_URL=... LIFEOS_CHAT_URL=... LIFEOS_ID_TOKEN=... ITERATIONS=50 CLEANUP=1 \
  node integration/conversation-consistency.mjs
```

Output is JSON with `emptyReads`, `missingAssistantTurn` and `errors`. Exit code 0 means no
misses. Record the baseline (before CS2) and the post-deploy numbers in the changeset notes.

### Cost and cleanup
Every iteration calls the model. At 50 iterations on a small model, expect a few cents to low
dollars on a capped key. The script deletes its own conversations only when `CLEANUP=1`.
Test data is removed only with your confirmation (plan gate G8).

## Backups before any staging or real deploy
Take on-demand backups of the tables a changeset touches. CS2 touches
`LifeOs-AssistantConversations-<stage>`:

```sh
aws dynamodb create-backup --profile lifeos-deployer --table-name LifeOs-AssistantConversations-<stage> \
  --backup-name lifeos-cs2-pre-$(date +%Y%m%d%H%M)
aws dynamodb list-backups --profile lifeos-deployer --table-name LifeOs-AssistantConversations-<stage>
```
