---
id: mag-sw9q
status: open
deps: [mag-if4i]
links: []
created: 2026-08-29T10:41:11Z
type: chore
priority: 2
assignee: deepfates
parent: mag-pu3x
tags: [cleanup, migration, tinybase]
---
# Retire the hidden productivity-suite transport safely

The current Porch still opens unused TinyBase task/spark transport and retains unreachable suite UI/server paths. Preserve or migrate any real stored data, then remove the unused runtime.

## Acceptance Criteria

- Representative retained rows have a verified export or migration to Porch artifacts.
- Opening a Porch no longer starts TinyBase workspace traffic.
- Unreachable BlockAim, EnvironmentLab, ritual/assist UI, obsolete policy authorities, and dead CSS are removed where no longer needed.
- The production bundle and room server shrink while all retained behaviors remain green.
