---
id: mag-0ste
status: open
deps: [mag-9hst, mag-6nb5]
links: []
created: 2026-08-29T10:41:38Z
type: feature
priority: 1
assignee: deepfates
parent: mag-9eym
tags: [radio, audio, discovery]
---
# Add independent radio playback and a world station tuner

Use publisher-supported HTTPS streams for defaults and an open licensed station directory for globe/list discovery; do not proxy undocumented Radio Garden endpoints.

## Acceptance Criteria

- KEXP and a curated permitted set play independently of the visual.
- People can search or explore by place, language, and genre and select a station for the room.
- Each browser opts into audio and owns mute/volume.
- Failure uses an alternate endpoint or shows Station unavailable with source/homepage attribution.
- Radio Garden remains an outbound excursion unless an official integration becomes available.
