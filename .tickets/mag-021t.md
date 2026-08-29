---
id: mag-021t
status: closed
deps: [mag-if4i]
links: []
created: 2026-08-29T10:42:12Z
type: feature
priority: 1
assignee: deepfates
parent: mag-o7e8
tags: [focus, block-method, intention]
---
# Build the complete low-friction Block instrument

Turn the fixed clock into optional furniture for choose, finish line, disposable Right Now actions, one shared Block, a careful completion mark, and break/repeat/red-carpet transitions.

## Acceptance Criteria

- A Block can start immediately with default 25 minutes or with one task and finish line.
- Each person can state an intention while sharing the timer.
- A disposable one-to-three-item Right Now list stays visible without becoming a task database.
- Completion creates one satisfying trace, then offers break, repeat, or prepare the next start.
- Focus softens chrome but never locks chat or changes permissions.
- No streaks, leaderboard, quotas, guilt copy, or mandatory long-term accounting appears.

## Notes

**2026-08-29T11:51:10Z**

Implemented on main in 920f377 with browser-found focus conversation correction in e38ef6c. Optional Block supports immediate default 25m start or one thing + finish line + 1-3 disposable Right Now moves, durable per-person plans, shared intentions, restrained completion trace, and atomic break/repeat/prepare-next. Focus softens chrome but conversation and controls remain open; no streaks, quotas, leaderboards, guilt, or accounting. Retained two-browser coverage proves plan visibility, clock start, and focus conversation. Integrated CI: 103 unit tests, build, 8/8 browser journeys; deployed production 8/8. Manual browser pass prepared/started a Block, chatted during focus, reloaded, and verified running clock, message, and all plan fields; it exposed and verified the corrected Focus/Conversation stays open language.
