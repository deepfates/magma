---
id: mag-8sg3
status: in_progress
deps: [mag-if4i]
links: []
created: 2026-08-29T10:41:58Z
type: feature
priority: 1
assignee: deepfates
parent: mag-sigy
tags: [assets, storage, canvas]
---
# Add a durable authenticated asset boundary for the glass

Implement the editor asset adapter against bounded room-authorized object storage so image and document artifacts can survive processes and devices.

## Acceptance Criteria

- An admitted person uploads a supported asset and another resolves the same bytes.
- Reload and room-authority restart retain it.
- Size, type, malformed input, quota, retry, orphan retention, and access checks are explicit.
- Deleting one shape does not destroy an asset still referenced elsewhere.
