---
name: GitHub write access
description: How repository writes work in this workspace when the local GitHub remote is not authenticated.
---

Use configured GitHub integrations for repository writes instead of asking for a token or placing credentials in the Git remote. The standard GitHub App API connection may allow Git-object creation but not branch-ref updates; use the separately authorized GitHub source-control connection for fast-forward-only ref changes when available.

**Why:** The local HTTPS remote can be readable but reject pushes because it has no usable GitHub credential. API connections can also differ in repository write permissions: creating Git objects does not guarantee permission to move a branch ref.

**How to apply:** Resolve the available GitHub connections and use their authenticated proxies without exposing credentials. Before updating a ref, verify the target is a descendant of the current branch and set `force` to false; then verify the ref and local upstream agree.