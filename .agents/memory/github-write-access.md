---
name: GitHub write access
description: How repository writes work in this workspace when the local GitHub remote is not authenticated.
---

Use the configured GitHub integration for repository writes instead of asking for a token or placing credentials in the Git remote.

**Why:** The local HTTPS remote can be readable but reject pushes because it has no usable GitHub credential, while the Replit-managed GitHub connection can authenticate API writes without exposing a token.

**How to apply:** Resolve the added GitHub connection, use its authenticated proxy for Git data API operations, and verify the resulting branch commit through the same connection.