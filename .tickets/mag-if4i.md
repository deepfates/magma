---
id: mag-if4i
status: closed
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

## Notes

**2026-08-29T11:20:56Z**

Implemented in c44bc0e. porch:room-state v1 is the authoritative envelope for timer/artifacts, media/queue/receipts, chat/social, and retained TinyBase workspace. Existing production keys migrate atomically with exact backup at porch:room-state:backup:v1 and rollback-window dual-write. Tests prove representative v0 migration, exact backup, restart idempotence, atomic failure, future-version no-write rejection, and authoritative chat mutation. Canvas Yjs and admission remain separate authorities. Combined local CI: 87 unit tests, production build, 6/6 browser journeys. Deployed PartyKit and Vercel production; remote production suite: 6/6.
