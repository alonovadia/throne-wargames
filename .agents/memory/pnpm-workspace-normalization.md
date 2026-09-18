---
name: pnpm workspace normalization
description: Prevent dependency installs from silently rewriting curated pnpm workspace configuration.
---

After a filtered dependency install, review `pnpm-workspace.yaml` separately from the package and lockfile changes. Restore curated comments, ordering, security settings, and catalog ranges if pnpm normalized the file.

**Why:** The workspace's pnpm version rewrote the YAML during an otherwise targeted package install, including moving supply-chain settings and changing a catalog range to the resolved version.

**How to apply:** When adding or updating a package, keep only the intended package manifest and lockfile importer changes unless the workspace configuration itself was deliberately changed.