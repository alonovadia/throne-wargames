---
name: pnpm workspace normalization
description: Prevent dependency installs from silently rewriting curated pnpm workspace configuration.
---

After a filtered dependency install or `pnpm audit --fix`, review `pnpm-workspace.yaml` separately from the package and lockfile changes. Restore curated comments, ordering, security settings, and catalog ranges if pnpm normalized the file. Audit fixes invoked from nested manifest directories still mutate the shared workspace configuration, including directories outside the workspace package globs.

**Why:** The workspace's pnpm version rewrote the YAML during an otherwise targeted package install, including moving supply-chain settings and changing a catalog range to the resolved version. Its audit fixer also strips comments and adds overlapping, unbounded overrides to that shared file.

**How to apply:** When adding or updating a package, keep only the intended package manifest and lockfile importer changes unless the workspace configuration itself was deliberately changed. Consolidate overlapping audit overrides to the strongest patched minimum and constrain compatible majors instead of accepting unbounded upgrades.