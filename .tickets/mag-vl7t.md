---
id: mag-vl7t
status: open
deps: [mag-z6jr, mag-if4i, mag-8sg3]
links: []
created: 2026-08-29T10:43:01Z
type: feature
priority: 2
assignee: deepfates
parent: mag-5dlm
tags: [pwa, offline, reconnect]
---
# Make Porch installable and honest through offline and reconnect transitions

Add the reusable Interface Lab PWA boundary where useful, cache the native shell and Glow fallback, and reconcile supported local artifact edits without pretending external feeds work offline.

## Acceptance Criteria

- The installed app opens the last Porch shell and native Glow offline.
- External sources state offline and recover when connectivity returns.
- Supported local artifact edits queue and reconcile or surface an explicit conflict; timers do not run from divergent client clocks.
- Updates preserve drafts and warn before a required reload.
- Cache and offline storage are bounded and clearable.
