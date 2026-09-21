---
name: Multi-image OCR source semantics
description: Product and reliability rules for processing overlapping scoreboard screenshots.
---

All selected scoreboard screenshots contribute to local OCR and enhanced OCR, but only the first selected image is archived with the match record. Enhanced OCR should run sequentially so each provider request remains isolated and rate-limit pressure is visible.

**Why:** The existing match storage contract accepts one screenshot, while operators need overlapping captures to recover unreadable fields and deduplicate repeated ranks without losing review safeguards.

**How to apply:** Keep the first-image archival limitation explicit in the operator UI. Merge rows by rank first, retain uncertainty and warnings, and leave merged rows unconfirmed until an operator checks them.