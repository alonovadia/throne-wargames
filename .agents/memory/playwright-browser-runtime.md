---
name: Playwright browser runtime
description: Replit's cached Playwright headless shell can lack Nix shared libraries; use the provided system Chromium wrapper and avoid scanning the Nix store.
---

The browser test runner must not scan `/nix/store` to discover shared libraries. This environment's store is extremely large, and the scan can block Playwright before Chromium launches. Prefer the bounded `/repl/tools/bin/chromium` wrapper through Playwright launch options; it supplies its own library path.

**Why:** An unbounded Nix-store scan caused browser tests to appear stalled for many minutes, while the cached headless shell failed immediately on missing `libgbm.so.1`.

**How to apply:** When configuring Playwright in this workspace, use `launchOptions.executablePath` with the system Chromium wrapper when it exists, and keep browser smoke and corpus tests separately runnable.