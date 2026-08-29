---
id: mag-z6jr
status: open
deps: []
links: []
created: 2026-08-29T10:41:08Z
type: bug
priority: 0
assignee: deepfates
parent: mag-pu3x
tags: [canvas, admission, reconnect]
---
# Refresh protected canvas admission on every reconnect

The canvas PartySocket currently reuses a consumed 30-second one-time ticket. Fetch a fresh ticket for every connection attempt and keep room/canvas recovery coordinated.

## Acceptance Criteria

- In a protected room, force the canvas socket offline or closed after its ticket is consumed.
- It reconnects without another invitation or page reload.
- Both people can then create an element observed by the other.
- Repeated reconnects leave no duplicate connections or ghost presence.
