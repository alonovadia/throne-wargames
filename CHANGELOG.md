# Changelog

All notable changes to Throne & Liberty Wargames are documented here.

## [Unreleased]

### Added

- Added a live Convex-backed archive with seeded match history and a dynamic administrator-managed class catalog.
- Added audited administrator workflows for reviewing roster applications, restoring discarded matches, correcting archived records, and inspecting operational summaries.
- Added scoreboard OCR upload, row verification, and persistent verified scoreboard sources.
- Added browser coverage for selecting overlapping scoreboard screenshots, deduplicating merged rows, and preserving manual confirmation requirements.
- Added generated API client freshness validation and a plain-language project README.

### Changed

- Added shared protection for public forms and visitor analytics against abusive write traffic.
- Updated the Wargames landing page and shared shell with the current visual system, persistent dark mode, and a pre-paint theme restore so refreshes keep the selected appearance.
- Renamed the primary navigation tab from “Chronicle” to “Home”.
- Made scoreboard uploads resolution-independent, with automatic aspect-ratio-preserving scaling before OCR.
- Expanded verified matches to support two teams of up to 48 players each while keeping signup squads at exactly six players.
- Updated match archive, leaderboard, and player-profile language and team-size displays for large-team records.
- Updated the browser OCR harness to accept one or more supplied screenshots for end-to-end verification.

### Fixed

- Prevented unverified scoreboard rows from being accepted into archived match records.
- Kept scoreboard uploads from being persisted when the corresponding match write fails.
- Made class-catalog creation label and normalize class keys, explain missing operator information, and return clear validation errors instead of failing silently.