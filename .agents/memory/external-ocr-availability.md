---
name: External OCR availability
description: Third-party OCR credentials can be present but rejected, so enhanced OCR must remain optional and report provider authorization separately from local OCR health.
---

Treat external OCR as an explicitly available capability, not as a prerequisite for local extraction. A configured secret can still be rejected by the provider, and that state must not reduce the safety of local OCR or cause provider output to be trusted automatically.

**Why:** A live provider request accepted the image and reached OCR.space but returned an API-key authorization error. The local OCR path and operator review flow still need to work independently.

**How to apply:** Keep provider calls server-side, return a clear unavailable/configuration error for authorization failures, and benchmark external results before changing conservative merge or confirmation rules.