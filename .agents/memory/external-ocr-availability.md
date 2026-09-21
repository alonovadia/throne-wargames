---
name: External OCR availability
description: Third-party OCR credentials can be present but rejected, so enhanced OCR must remain optional and report provider authorization separately from local OCR health.
---

Treat external OCR as an explicitly available capability, not as a prerequisite for local extraction. A configured secret can still be rejected by the provider, and full-image OCR text may be grouped by columns rather than rows; that state must not reduce the safety of local OCR or cause provider output to be trusted automatically.

**Why:** A live provider request first returned an API-key authorization error, and after authorization its plain text output grouped scoreboard columns separately. Word-position overlay data was needed to reconstruct candidate rows, but the resulting accuracy was still not sufficient to trust automatically.

**How to apply:** Keep provider calls server-side, request overlay data when row structure matters, return a clear unavailable/configuration error for authorization failures, and benchmark external results before changing conservative merge or confirmation rules.