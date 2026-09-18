---
name: Distributed public-write limits
description: Scaling and restart requirements for anonymous public-write throttling.
---

Production rate limits for anonymous writes must use atomic state shared across every API instance. A process-local limiter is acceptable only when the persistent backend is intentionally unavailable in local development.

**Why:** Autoscaling creates independent server processes, and ordinary restarts erase memory. Process-local counters therefore allow clients to multiply their allowance across instances or reset it by crossing a restart boundary.

**How to apply:** Keep production counters in the durable backend, identify clients using a one-way address-derived key, return a retry interval when denied, and expire old buckets automatically. Do not require API restarts to preserve or synchronize active limits.