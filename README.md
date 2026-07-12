# LifeOs

Personal life-tracking web app — tasks, daily schedule, journaling, and habit trackers, with AI-assisted priority suggestions and journal habit-extraction via the Claude API.

## Stack

- **Frontend**: React 19 + Vite + Tailwind CSS (`frontend/`)
- **Backend**: AWS SAM (Lambda + API Gateway HTTP API) + DynamoDB (`backend/`)
- **Auth**: AWS Cognito User Pool, JWT-based
- **AI**: Anthropic Claude API
- **Voice input**: Browser Web Speech API

## Status

Phase 1, Step 1: SAM backend skeleton (Cognito + DynamoDB + HTTP API + health-check Lambda). See `backend/`.
