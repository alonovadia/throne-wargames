# Changelog

All notable changes to Throne & Liberty Wargames are documented here.

## [Unreleased]

### Added

- Added a live Convex-backed archive with seeded match history and a dynamic administrator-managed class catalog.
- Added audited administrator workflows for reviewing roster applications, restoring discarded matches, correcting archived records, and inspecting operational summaries.
- Added scoreboard OCR upload, row verification, and persistent verified scoreboard sources.
- Added generated API client freshness validation and a plain-language project README.

### Changed

- Added shared protection for public forms and visitor analytics against abusive write traffic.
- Updated the Wargames landing page and shared shell with the current visual system, persistent dark mode, and a pre-paint theme restore so refreshes keep the selected appearance.
- Renamed the primary navigation tab from “Chronicle” to “Home”.

### Fixed

- Prevented unverified scoreboard rows from being accepted into archived match records.
- Kept scoreboard uploads from being persisted when the corresponding match write fails.