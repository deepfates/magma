---
id: mag-u12o
status: open
deps: [mag-ovqs, mag-6nb5]
links: []
created: 2026-08-29T10:42:25Z
type: feature
priority: 2
assignee: deepfates
parent: mag-z8n5
tags: [voice, webrtc, realtime]
---
# Add opt-in camera-free voice for small Porches

Provide room voice through a replaceable WebRTC transport, initially bounded to trusted small groups, with no camera path and no recording.

## Acceptance Criteria

- Joining Porch never requests microphone access; Join voice does.
- Join/leave, mute, input device, speaking indication, failure, and reconnect are obvious.
- No camera permission, video surface, recording, or persisted audio exists.
- Four people survive one reconnect and the supported room-size bound is stated honestly.
- Signaling/transport can move to an SFU/TURN provider without changing Porch room semantics.
