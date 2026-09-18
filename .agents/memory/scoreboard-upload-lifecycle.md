---
name: Scoreboard upload lifecycle
description: Why verified scoreboard images are uploaded at commit time rather than during OCR.
---

Upload a verified scoreboard only when the operator commits the match. If the match write fails after storage succeeds, delete the uploaded object before returning the error.

**Why:** Uploading during file selection or OCR can leave persistent orphaned images when an operator replaces a file, closes the form, or abandons verification.

**How to apply:** Keep extraction and review local to the browser. Treat storage plus match creation as one API operation, link the returned storage identifier to the match, and compensate for partial failure by deleting the unlinked object.