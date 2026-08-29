---
id: mag-p7ef
status: in_progress
deps: [mag-if4i]
links: []
created: 2026-08-29T10:41:35Z
type: feature
priority: 0
assignee: deepfates
parent: mag-9eym
tags: [scene, media, architecture]
---
# Introduce the compositional Porch scene contract

Replace the single YouTube-shaped source with one visual layer, one independent radio layer, zero or more world overlays, attribution/capability/health metadata, and explicit shared versus local fields.

## Acceptance Criteria

- Existing rooms migrate to the same visible source.
- Changing visual does not stop radio; changing radio does not reload visual.
- Two browsers reload into the same scene while local mute, volume, overlay visibility, and sensory choices remain independent.
- Every source adapter declares attribution, capabilities, health, and fallback.
