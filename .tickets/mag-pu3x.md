---
id: mag-pu3x
status: open
deps: [mag-z6jr, mag-s5it, mag-if4i, mag-s81z, mag-sw9q]
links: []
created: 2026-08-29T10:40:46Z
type: epic
priority: 0
assignee: deepfates
parent: mag-51wi
tags: [multiplayer, platform]
---
# Make the multiplayer floor durable and comprehensible

Complete the admission, reconnect, persistence, migration, and connection-truth floor on which every Porch capability depends.

## Acceptance Criteria

- Protected and legacy rooms reconnect without re-entry or silent state loss.
- Shared state has explicit versioning and recovery.
- The visible connection state describes the whole place, not only one socket.
