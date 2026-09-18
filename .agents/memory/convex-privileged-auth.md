---
name: Convex privileged write authentication
description: Why privileged Convex functions authenticate with a checked-in digest and what must stay synchronized.
---

Privileged Convex functions must verify the SHA-256 digest of the server-provided session secret before reading admin data or writing matches and seed data.

**Why:** The available Convex deploy key has restricted permissions: it cannot write deployment environment variables, and the normal `convex dev --once` flow can fail on `deployment:logs:view`. Keeping only a one-way digest in Convex code prevents direct public mutation calls without duplicating the original secret.

**How to apply:** If the Replit session secret rotates, update the expected digest in Convex and redeploy through a workflow that does not require unavailable log permissions before restarting the API. Never store the original secret in code or memory.