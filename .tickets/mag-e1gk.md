---
id: mag-e1gk
status: open
deps: [mag-if4i]
links: []
created: 2026-08-29T10:42:42Z
type: feature
priority: 1
assignee: deepfates
parent: mag-ps2e
tags: [journal, history, persistence]
---
# Record a bounded journal of meaningful room changes

Store semantic events and named snapshots for source changes, artifact lifecycle, completed Blocks, and future items while excluding pointer noise and raw editor internals.

## Acceptance Criteria

- Journal entries have stable identity, author, time, kind, schema version, and bounded retention.
- Duplicate delivery is idempotent and concurrent operations produce one deterministic order where order matters.
- Privacy/local preferences and ephemeral presence never enter the journal.
- Existing rooms begin with a truthful migration boundary rather than invented past.
