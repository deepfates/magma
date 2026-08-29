---
id: mag-4wh8
status: open
deps: [mag-9hst]
links: []
created: 2026-08-29T10:41:37Z
type: feature
priority: 1
assignee: deepfates
parent: mag-9eym
tags: [youtube, playlist, live]
---
# Make YouTube playback and feed surfing actually operable

Expose room-owned play, pause, seek where applicable, playlist index, previous/next, and curated live-feed surfing rather than relying on an iframe that cannot receive pointer input.

## Acceptance Criteria

- Either person can operate recorded transport and both converge within a documented tolerance after reload.
- Live sources share selection and live intent without pretending to support seeking or frame identity.
- Playlist next/previous and feed next/previous are reachable.
- A real-provider smoke path covers one live source and one playlist; deterministic tests cover transport mechanics.
- Removed, private, or embed-disabled media offers retry, next, and Glow.
