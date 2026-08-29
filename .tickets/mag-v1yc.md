---
id: mag-v1yc
status: open
deps: [mag-ovqs, mag-ism8]
links: []
created: 2026-08-29T10:42:24Z
type: feature
priority: 1
assignee: deepfates
parent: mag-z8n5
tags: [chat, reactions, canvas]
---
# Make conversation spatial, durable, and lightweight

Extend the working chat with replies, reactions, unread state, pin-to-glass, and threads attached to spatial artifacts without turning conversation into a separate destination.

## Acceptance Criteria

- A message can reply, react, pin as a durable note, and reference a glass object.
- A glass object can open its thread and messages link back to it.
- Delete and current-session undo behave consistently for everyone.
- Chat remains reachable during focus, survives reload and same-person tabs, and does not cover the whole world on phone.
