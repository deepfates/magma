---
id: mag-p7ef
status: closed
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

## Notes

**2026-08-29T11:51:10Z**

Implemented on main in c187060 and composed with Block in 920f377. Shared scene v1 supplies one visual, independent KEXP radio, daylight overlay, and declared attribution/capabilities/health/fallback. Room envelope v1->v2 migration preserves the existing visible source with exact v1 backup. Retained two-context coverage proves visual/radio lifecycle independence, shared convergence, reload, and distinct local mute/volume/overlay/sensory choices. Integrated CI: 103 unit tests, build, 8/8 browser journeys; deployed production 8/8. Manual browser pass selected live Treasure Island + KEXP + daylight and observed real YouTube playback. KEXP upstream availability/autoplay and active health probing remain provider/frontier concerns, not claims of this ticket.
