---
id: mag-if4i
status: open
deps: []
links: []
created: 2026-08-29T10:41:09Z
type: task
priority: 1
assignee: deepfates
parent: mag-pu3x
tags: [state, migration, storage]
---
# Version and migrate the authoritative room state

Define versioned stored envelopes and migrations for the room, scene, queue, chat, and later journal so new capabilities can land without silently stranding existing Porches.

## Acceptance Criteria

- Current production snapshots load through an explicit migration into the current schema.
- Unknown future versions fail visibly without overwriting stored data.
- Migration is idempotent and covered with representative old-state fixtures.
- A backup or recoverable prior value exists until migrated state is successfully persisted.
