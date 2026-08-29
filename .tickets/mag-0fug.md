---
id: mag-0fug
status: open
deps: [mag-9hst]
links: []
created: 2026-08-29T10:41:39Z
type: feature
priority: 2
assignee: deepfates
parent: mag-9eym
tags: [earth, map, situation]
---
# Add Earth, satellite weather, orbit, and calm world pulse

Render official NASA GIBS/EPIC, USGS, NWS, and official orbit sources natively or through supported embeds as a quiet world view rather than a crisis dashboard.

## Acceptance Criteria

- Earth offers timestamped full-disc and map views with correct attribution.
- Weather/cloud, daylight, earthquake, fire, and relevant alert overlays can coexist with the visual.
- Marks explain what, where, when, and link to the official source.
- View following is explicit and escapable; API delay preserves a timestamped last frame with Data delayed.
- Polling and caching follow provider guidance.
