---
id: mag-7jqg
status: open
deps: [mag-9hst, mag-6nb5, mag-021t]
links: []
created: 2026-08-29T10:42:43Z
type: feature
priority: 2
assignee: deepfates
parent: mag-ps2e
tags: [presets, configuration, portability]
---
# Save, share, import, and apply named Porch setups

Persist coherent combinations of scene, tool shelf, soundboard, focus treatment, and room defaults while keeping device sensory choices local.

## Acceptance Criteria

- Anyone can save, rename, apply, export, import, and delete a setup.
- Applying is atomic or reports a recoverable partial-source failure.
- Setup files are versioned, validated, portable, and cannot smuggle arbitrary scripts or private local preferences.
- Applying a setup converges across browsers without changing another person's mute, volume, reduced motion, or glass visibility.
