---
id: mag-91ic
status: open
deps: [mag-e1gk, mag-021t, mag-9hst, mag-ism8]
links: []
created: 2026-08-29T10:42:42Z
type: feature
priority: 2
assignee: deepfates
parent: mag-ps2e
tags: [future, scheduling, queue]
---
# Let people place notes, sources, timers, and cues for later

Make the future legible through the existing queue and optional scheduled artifacts rather than a project planner.

## Acceptance Criteria

- A note, scene, timer, document, or cue can be placed Later with an optional timezone-safe date/time.
- Upcoming items are visible from Now and can be edited, activated, or removed by anyone.
- Automatic activation happens only when explicitly chosen and is idempotent across reconnect/restart.
- Missed schedules recover visibly instead of firing repeatedly or disappearing.
