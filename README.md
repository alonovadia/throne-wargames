# Throne & Liberty Wargames

Throne & Liberty Wargames is a public record of organized Team vs Team (GvG) matches.

Anyone can view match results, player records, rankings, and season statistics.
Visitors do not need an account. Match records and roster applications are
managed by authorized administrators.

## What the app can do

### Public pages

- Show the latest match and recent season activity
- List completed matches and both six-player teams
- Rank players by their match results
- Compare weapon combinations and player performance
- Open a player profile with match history, averages, and personal records
- Accept applications from complete Guild Roster followed by Statics.

The public archive starts empty. It does not create sample players, matches, or
statistics.

### Match recording

Administrators can upload a scoreboard screenshot and use OCR to read it. OCR
only prepares a draft. An administrator must check all 12 rows, confirm both
teams, select missing weapons, and correct missing statistics before saving the
match.

The original scoreboard image is kept with the match record. Invalid team
sizes, duplicate players, incomplete rows, and negative statistics are rejected.

### Administration

Authorized administrators can:

- Review, approve, reject, or cancel roster applications
- Add verified match results
- Correct an archived match
- Discard a match without deleting its history
- Restore a match that was discarded by mistake
- Review an audit trail of archive changes
- View recent traffic and application activity

Public forms use duplicate protection, bot checks, and shared rate limits.
Rate-limit counters are stored in Convex, so they continue to work when the API
scales to more than one server or restarts.

## Main tools

- React, Vite, and TypeScript for the website
- Express for the API
- Convex for records, uploaded scoreboard references, rate limits, and visitor
  events
- Tesseract.js for scoreboard text recognition
- Recharts for charts
- OpenAPI, Orval, and Zod for API types and request checks

## Project layout

```text
artifacts/throne-wargames/   Website
artifacts/api-server/        Express API
convex/                      Database schema and backend functions
lib/api-spec/                OpenAPI contract
lib/api-client-react/        Generated React API client
lib/api-zod/                 Generated request and response checks
```

## Run the project

### Requirements

- Node.js 24
- pnpm
- A Convex project

### Install packages

```bash
pnpm install
```

### Configure environment variables

Set these values through your environment or Replit Secrets. Do not commit
their real values.

```text
CONVEX_URL
VITE_CONVEX_URL
CONVEX_DEPLOY_KEY
SESSION_SECRET
ADMIN_ACCESS_CODE
```

`SESSION_SECRET` protects server-to-Convex operations.
`ADMIN_ACCESS_CODE` protects the current administrator entry point.

### Prepare Convex

```bash
pnpm convex dev
```

This creates the generated Convex bindings and synchronizes the backend
functions with your development deployment.

### Start the API and website

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/throne-wargames run dev
```

On Replit, the configured workflows start these services with the correct ports
and paths.

## Project checks

Run the main checks before publishing a change:

```bash
pnpm run typecheck
pnpm run check:api-client
pnpm --filter @workspace/throne-wargames run build
```

## Security notes

- Public visitors can read records without signing in.
- Administrative requests are checked by the API before they reach Convex.
- The website never treats a browser-only flag as administrator permission.
- Uploaded scoreboard files are checked for size and file type.
- Secrets belong in environment settings, not source files.

For a larger administrator team, replace the shared administrator code with
individual accounts and roles so every action can be tied to a verified person.
