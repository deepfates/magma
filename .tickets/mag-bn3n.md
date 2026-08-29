---
id: mag-bn3n
status: open
deps: [mag-z6jr]
links: []
created: 2026-08-29T10:41:58Z
type: feature
priority: 1
assignee: deepfates
parent: mag-sigy
tags: [canvas, undo, conflicts]
---
# Expose Porch-native undo and exercise canvas conflicts

Add minimal Undo/Redo controls through the editor adapter and define local-history behavior under concurrent remote edits.

## Acceptance Criteria

- A creates A1, B creates B1, and A undo removes only A1 while preserving B1 in every client.
- Redo restores A1; remote changes do not enter the wrong undo stack.
- Real freehand drawing, independent concurrent marks, same-element conflicts, movement, deletion, reload, and touch camera gestures converge without duplicates or crashes.
