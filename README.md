# Magma

Magma is a multiplayer focus instrument: a living view, a server-authoritative clock, quiet presence, and a TinyBase CRDT workspace. The current name is less important than the interaction—the product should feel calm enough to live beside and crisp enough to operate deliberately.

- **Live:** [magma-one-azure.vercel.app](https://magma-one-azure.vercel.app)
- **Room service:** `magma-focus.deepfates.partykit.dev`

## What is real

- A room is named by `?room=...`; the Invite button copies the join link.
- PartyKit owns the canonical timer state. Server alarms settle elapsed phases exactly once; clients derive the display from a sampled server-time offset instead of broadcasting every second.
- PartyKit separately owns the canonical room-media state: source, playback intent, position anchor, playlist index, controller, and revision. The YouTube IFrame API projects that state locally and corrects material VOD drift without feeding remote corrections back into the room.
- The first member present holds room authority across all of their tabs. Everyone else can propose a timer change; the host can approve it or pass the crown, and host loss triggers a deterministic handoff. Only the host steers shared media.
- Focus completion creates a durable room “ember,” sounds a synthesized local chime, and can automatically begin the shared break. The latest 24 artifacts survive reloads.
- People have stable local profiles and intentions. Tasks support ownership, while CRDT note cards (“sparks”) let the room communicate without breaking focus.
- Tasks and sparks live in a TinyBase `MergeableStore`, persist to IndexedDB, and synchronize through the same room. Server-side schemas, message caps, and rate limits constrain writes.
- Warm noise is synthesized locally with Web Audio. Wake Lock and opt-in completion notifications are progressive enhancements; no audio assets or tracking services are bundled.
- A dominant living view opens on the Treasure Island panorama from Mersea/Teleport and also accepts ABC7’s Treasure Island camera, TrazCam, NASA’s ISS feed, and standard YouTube video or playlist links. The host-selected source converges across browsers and survives reconnects. Instrument mode cover-crops the embed; Camera Controls clears the instrument and exposes shared playback controls.
- The shared clock and four stable surfaces—Workspace, Environment, Tempo, and Room—are inscribed over the living view. The clock remains reachable while a surface is open; surface drafts and shared state survive responsive posture changes.
- Environment makes the authority boundary visible: source and playback belong to the room; mute, visibility, synthesized warm noise, cue preferences, and sensory reduction stay on the individual device and never enter the room snapshot or CRDT.
- Before a focus Block, a person can name one visible finish line and expand a disposable three-item “Right Now” list. Afterward they decide whether the interval was clean and finish-directed; the daily tally counts that decision exactly once, resets each day, and never becomes a streak or leaderboard.
- The WebGL field is a fallback when the living view is closed. It pauses when hidden and respects reduced motion; it is atmosphere, not the product identity.

## Productivity grammar

Magma intentionally has less productivity machinery than its atmosphere might suggest. Its ritual combines the Block Method in *How to Do Things v1.0* with Bullet Journal’s rapid capture, reflection, and migration:

1. Choose a finish-directed Block and picture what “done” will visibly mean.
2. If useful, write no more than three immediate physical actions.
3. Work inside the shared clock; the room supplies presence, not surveillance.
4. At completion, personally decide whether the Block counted. A compromised Block can be released without pretending the work did not happen.
5. Keep only a daily tally. Begin again tomorrow without streak debt.

The cue deck follows the same boundary. Signals are authored and previewable, audio is off until chosen, and “quiet everything” is a complete setup. Magma is an instrument a person operates, not an optimizer that operates on the person.

## Interface laws and reuse boundaries

- TinyBase remains scoped to independently editable shared workspace data. The clock and continuous media transport are separate server-authoritative state machines because converging text edits, agreeing on wall time, and anchoring playback are different problems.
- The render architecture follows Interface Lab’s artifact-first hierarchy, lightest-boundary rule, stable surface identity, and capability-preserving responsive postures. Its private pre-1.0 Svelte packages are not imported into this React app; the product laws transfer, not framework machinery or unlicensed source.
- Web Audio and the YouTube IFrame API remain native integrations. Adding a larger framework for either would increase architecture without increasing the capability.
- Starred projects such as ENTHEA informed sensory-safety ideas but are not copied into Magma; its AGPL license and different product shape make inspiration the correct reuse boundary.

## Run two-player locally

```sh
npm install
npm run dev
```

Open the same URL (including its `?room=` value) in two browser windows. The web app runs on `http://localhost:5173`; the PartyKit room runs on port `1999`.

```sh
npm run check
```

This runs timer/media state-machine and YouTube URL tests, TypeScript, a production build, and real Chromium multiplayer tests covering authority across tabs, CRDT convergence, reconnect durability, host handoff, server-alarm completion, one-time Block accounting, two-browser media convergence, personal-preference isolation, surface continuity across posture changes, phone layout, and automated accessibility checks.

## Put rooms online

Deploy the PartyKit worker, then point the web build at it:

```sh
npm run deploy:room
VITE_PARTYKIT_HOST=magma-focus.deepfates.partykit.dev npm run build
```

Host `dist/` on any static host. New rooms receive high-entropy links, but production identity and private-room authorization are intentionally not faked: anyone with a room link can join. Treat current rooms as public and do not put secrets in the workspace.

`npm audit` currently reports five advisories inherited through PartyKit's local Miniflare/esbuild toolchain (four moderate, one high) with no non-breaking npm remediation. They do not appear in the Vite browser bundle, but the room toolchain should be upgraded or migrated with PartyKit's Cloudflare successor before treating this as a hardened public service.

## Architecture boundary

The CRDT owns independently editable workspace data. The clock and media transport use independent PartyKit revisions and server epochs. A stale media command cannot invalidate a timer command, and local mute or sensory changes cannot enter shared state. The pure domains live in `src/domain/timer.ts` and `src/domain/media.ts`, shared by the PartyKit worker and their tests.

For ordinary videos and playlists, browsers converge to a server-anchored position within a practical buffering tolerance. For YouTube live cameras, synchronization means the same source and live-playback intent—not the same encoded frame, because provider latency and ads can differ by client.

The current endpoint is an excellent public-link focus room, not an account product. Private teams, account recovery, moderation, organization policy, analytics, calendar integrations, and native mobile background execution are deliberately outside this release until their product meaning and operating model are chosen.

The cover-cropped YouTube composition is intended for this personal instrument, not claimed as a generally distributable integration. The render layer keeps a clean media boundary so a licensed native HLS/WebRTC/video source can later replace it without changing the clock, room, ritual, or workspace authorities.
