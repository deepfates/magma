---
id: mag-ovqs
status: closed
deps: [mag-z6jr]
links: []
created: 2026-08-29T10:41:57Z
type: feature
priority: 1
assignee: deepfates
parent: mag-sigy
tags: [canvas, presence, cursors]
---
# Put people on the glass with cursors, selections, and follow

Use Excalidraw pointer/collaborator seams plus ephemeral PartyKit messages so people inhabit the shared surface rather than only a side panel.

## Acceptance Criteria

- Two browsers see server-bound names/colors, cursors, selection outlines, and drawing/typing posture.
- A person can follow another view and any local navigation exits follow.
- Multi-tab identity emits one active pointer; disconnect removes presence promptly and never persists it.
- Forged client identity is ignored and reduced motion has a quiet alternative.

## Notes

**2026-08-29T11:51:10Z**

Implemented on main in d12289e. Canvas PartyKit now carries bounded ephemeral server-stamped collaborator state beside Yjs: name/color, cursor, pointer button, selected IDs, drawing/typing/selecting posture, view follow, local-navigation exit, one active pointer per protected membership, disconnect cleanup, forged-identity rejection, and reduced-motion quiet treatment. Nothing persists. Retained protected-room browser coverage exercises two people plus same-identity tab, live protocol semantics, follow/unfollow, cleanup and reload. Integrated CI: 103 unit tests, build, 8/8 browser journeys; deployed production 8/8. Excalidraw cursor/selection paint is structurally exercised through its native collaborator map, not pixel-diff asserted; pathological half-open lease expiry remains transport-owned uncertainty.
