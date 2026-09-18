# Convex backend

This directory is the unified backend for the Wargames archive. It replaces the
PostgreSQL/Prisma model from the original blueprint with Convex tables, queries,
and mutations.

Run `pnpm convex dev` from the project root after adding a Convex deployment.
Convex generates `convex/_generated/` locally; that generated directory is not
checked in. Set `VITE_CONVEX_URL` for the public client and `CONVEX_URL` for
server-side adapters.