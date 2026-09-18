---
name: Convex development sync permissions
description: Constraint affecting local Convex function deployment and integration validation.
---

Do not assume the available Convex deploy key can sync changed functions to the development deployment. A sync attempt can fail on the `deployment:logs:view` permission before publishing changes.

**Why:** The checked-in API can be ahead of the active development deployment, causing integration tests to fail on missing functions even when local compile checks pass.

**How to apply:** When Convex-backed integration tests report a missing function, compare the checked-in function set with the deployment error. Treat a log-view permission failure as a deployment-validation block rather than changing unrelated application code.