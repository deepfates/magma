---
id: mag-s81z
status: open
deps: [mag-z6jr, mag-if4i]
links: []
created: 2026-08-29T10:41:10Z
type: task
priority: 1
assignee: deepfates
parent: mag-pu3x
tags: [canvas, yjs, durability]
---
# Bound and prove canvas synchronization and actor recovery

Replace full-document exchange on every open with a bounded Yjs synchronization handshake, surface size failures, and prove PartyKit storage recovery after actor restart.

## Acceptance Criteria

- Representative create/edit/delete history reconnects through a bounded diff rather than two unconditional full scenes.
- Restarted room authority restores an identical live scene.
- Malformed and oversized updates cannot corrupt the last good snapshot.
- Compaction, storage limit, and surfaced failure behavior are documented and tested.
