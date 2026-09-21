---
name: Scoreboard OCR reliability
description: OCR uncertainty must remain visible to operators instead of being converted into plausible defaults.
---

Scoreboard OCR should preserve rows even when individual cells are unreadable, select among bounded preprocessing passes using row and field coverage, and represent uncertain team assignments as unknown until an operator resolves them. Crop inside user-defined column boundaries so red annotation lines do not contaminate OCR, and use bounded rank-sequence recovery only with a visible warning.

**Why:** A plausible default can silently move a participant to the wrong team or shift statistics, while the verifier is specifically designed to let an operator correct incomplete extraction.

**How to apply:** Keep image extraction and parsing conservative. Add new OCR repairs only when they are bounded, testable, and surfaced as warnings; never trade missing data for an unmarked guess. Prefer field-level recovery from alternate preprocessing passes only when the row geometry remains aligned.