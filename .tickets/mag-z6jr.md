---
id: mag-z6jr
status: closed
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

## Notes

**2026-08-29T11:20:56Z**

Implemented in e6bede5. PorchCanvas now supplies PartySocket an async query provider that refreshes the protected-room one-time admission ticket for every connection attempt. Retained Playwright coverage forcibly closes the page-side canvas websocket twice, proves distinct tickets and one replacement connection per close, preserves two-person presence and scene state, and proves one subsequent edit from each person without duplicate element IDs. Combined local CI: 87 unit tests, production build, 6/6 browser journeys. Deployed PartyKit and Vercel production; remote production suite: 6/6. Physical network-loss emulation remains separately unproven because Chromium did not close the established websocket.
