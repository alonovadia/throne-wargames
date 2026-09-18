# Throne & Liberty Wargames

Public ranked wargames archive and admin-managed match ingestion surface for
organized Throne & Liberty 6v6 events.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/throne-wargames run dev` — run the public web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm convex dev` — run the Convex development backend
- Required env: `VITE_CONVEX_URL`, `CONVEX_URL`, and server-only `ADMIN_ACCESS_CODE` for connected admin writes

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 adapter around Convex-backed domain functions
- DB: Convex
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/throne-wargames/` — public React/Vite experience and admin shell
- `artifacts/api-server/src/routes/wargames.ts` — public reads and admin write boundary
- `artifacts/api-server/src/data/wargames.ts` — non-persistent empty-state fallback with calculated aggregates
- `convex/schema.ts` — Convex tables and indexes
- `convex/public.ts` — public queries
- `convex/admin.ts` — visitor, roster, and match mutations
- `lib/api-spec/openapi.yaml` — public/admin contract source of truth

## Architecture decisions

- Convex replaces the PostgreSQL/Prisma blueprint so storage, queries, mutations,
  and visitor events share one backend.
- Public pages do not require an account. Admin writes are validated on the
  server with `ADMIN_ACCESS_CODE`; client state is never treated as auth.
- Without a Convex deployment, the API starts empty and computes statistics only
  from records created during the current process. It never fabricates sample
  rankings, matches, visitor totals, or performance metrics.
- OCR results remain human-in-the-loop: raw extraction is not committed until an
  admin verifies the twelve participant rows.

## Product

Season story, public leaderboards, player profiles, completed match archive,
six-player roster applications, visitor analytics, and admin-only verified
scoreboard ingestion.

## User preferences

- Keep public viewing account-free; only authorized admins can modify data.
- Use Convex instead of PostgreSQL and Prisma.
- Keep the product modern, story-led, and analytics-focused.

## Gotchas

- `convex/_generated/` is created by `pnpm convex dev`; it is not part of the
  source handoff.
- Never add fabricated statistics to the fallback. Empty archives should render
  explicit empty states until verified records exist.
- Admin routes intentionally return `401` without `ADMIN_ACCESS_CODE`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
