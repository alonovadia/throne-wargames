# Scoreboard OCR Corpus

This corpus is a small labeled regression set built from the supplied scoreboard captures:

- `1_1789717015998.png`: ranks 1–10 from the original capture
- `image_1789717406320.png`: ranks 11–19 from the continuation capture
- `image_1789717304337.png`: ranks 1–10 with the visible red boundary overlay

Each JSON capture records the expected rank, character name, team, kills, assists, Damage Dealt, Damage Taken, and Amount Healed for every visible row.

## Acceptance thresholds

The current labels require:

- 100% row recall
- zero extra rows
- zero shifted rows
- zero name mismatches
- zero team mismatches
- zero numeric mismatches
- zero uncertain rows

The evaluator also supports relaxed `minRowRecall` and `maxUncertainRows` values for future captures where the source image is intentionally noisy. It reports missing rows, extra rows, shifted rows, name mismatches, team mismatches, numeric mismatches, and uncertain rows separately so a change can be diagnosed instead of reduced to one score.

The corpus is intentionally limited to the current scoreboard layout. New layouts should add a separate labeled capture rather than weakening these thresholds.