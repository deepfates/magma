# Magma

Magma is a multiplayer focus ritual with a full-screen lava shader, a server-authoritative clock, live presence, reactions, and a TinyBase CRDT workspace. It takes the useful shape of Flocus—one beautiful timer plus small focus tools—without copying its branding or assets.

- **Live:** [magma-one-azure.vercel.app](https://magma-one-azure.vercel.app)
- **Room service:** `magma-focus.deepfates.partykit.dev`

## What is real

- A room is named by `?room=...`; the Invite button copies the join link.
- PartyKit owns the canonical timer state. Server alarms settle elapsed phases exactly once; clients derive the display from a sampled server-time offset instead of broadcasting every second.
- The first person present holds the room tempo. Everyone else can propose a timer change; the host can approve it or pass the crown, and host loss triggers a deterministic handoff.
- Focus completion creates a durable room “ember,” sounds a synthesized local chime, and can automatically begin the shared break. The latest 24 artifacts survive reloads.
- People have stable local profiles and intentions. Tasks support ownership, while CRDT note cards (“sparks”) let the room communicate without breaking focus.
- Tasks and sparks live in a TinyBase `MergeableStore`, persist to IndexedDB, and synchronize through the same room. Server-side schemas, message caps, and rate limits constrain writes.
- Warm noise is synthesized locally with Web Audio. Wake Lock and opt-in completion notifications are progressive enhancements; no audio assets or tracking services are bundled.
- The WebGL lava responds to phase, presence, and completion energy, pauses when hidden, and respects reduced motion.

## Run two-player locally

```sh
npm install
npm run dev
```

Open the same URL (including its `?room=` value) in two browser windows. The web app runs on `http://localhost:5173`; the PartyKit room runs on port `1999`.

```sh
npm run check
```

This runs timer/state-machine tests, TypeScript, a production build, and real Chromium multiplayer tests covering authority, CRDT convergence, reconnect durability, host handoff, server-alarm completion, phone layout, and automated accessibility checks.

## Put rooms online

Deploy the PartyKit worker, then point the web build at it:

```sh
npm run deploy:room
VITE_PARTYKIT_HOST=magma-focus.deepfates.partykit.dev npm run build
```

Host `dist/` on any static host. New rooms receive high-entropy links, but production identity and private-room authorization are intentionally not faked: anyone with a room link can join. Treat current rooms as public and do not put secrets in the workspace.

`npm audit` currently reports five advisories inherited through PartyKit's local Miniflare/esbuild toolchain (four moderate, one high) with no non-breaking npm remediation. They do not appear in the Vite browser bundle, but the room toolchain should be upgraded or migrated with PartyKit's Cloudflare successor before treating this as a hardened public service.

## Architecture boundary

The CRDT owns independently editable workspace data. The clock is server-authoritative because resolving concurrent edits and agreeing on wall time are different problems. The timer domain is pure TypeScript in `src/domain/timer.ts`, shared by the PartyKit worker and its tests.

The current endpoint is an excellent public-link focus room, not an account product. Private teams, account recovery, moderation, organization policy, analytics, calendar integrations, and native mobile background execution are deliberately outside this release until their product meaning and operating model are chosen.
