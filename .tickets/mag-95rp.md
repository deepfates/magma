---
id: mag-95rp
status: open
deps: [mag-e1gk, mag-ism8, mag-9hst]
links: []
created: 2026-08-29T10:42:42Z
type: feature
priority: 2
assignee: deepfates
parent: mag-ps2e
tags: [history, restore, timeline]
---
# Build Earlier, Now, and recoverable object restore

Expose a light human timeline of saved scenes, meaningful moments, and deleted objects; previewing history must not mutate the live Porch.

## Acceptance Criteria

- Earlier can preview timestamped moments and clearly distinguishes historical from live media.
- Now returns to the current room without side effects.
- Restore creates a new current version and preserves the pre-restore state as recoverable history.
- Deleted objects remain recoverable for a bounded period.
- Concurrent restore resolves without erasing newer unrelated work.
