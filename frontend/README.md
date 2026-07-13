# LifeOs frontend

React 19 + Vite + Tailwind CSS 4 frontend for LifeOs. See the
[repo root README](../README.md) for the full project overview, phase
build log, and backend setup.

## Scripts

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # typecheck + production bundle
npm run preview   # serve the production bundle locally
npm run lint
```

Requires the backend stack deployed and its API URL / Cognito IDs set in
`.env` (see `.env.example` and the deployed stack's CloudFormation outputs).

PWA note: the install prompt and real notification-permission grant are
best tested against `npm run build && npm run preview`, since some
install UX only fires over a production-style build.
