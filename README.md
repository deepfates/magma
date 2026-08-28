# Magma

Magma is a multiplayer Pomodoro room with a full-screen lava shader, a server-time clock, live presence, reactions, and a TinyBase CRDT task list. It takes the useful shape of Flocus—one beautiful timer plus small focus tools—without copying its branding or assets.

## What is real

- A room is named by `?room=...`; the Invite button copies the join link.
- PartyKit owns the canonical timer state (`mode`, `status`, `endsAt`, `remainingMs`, `revision`). Clients derive the display from the shared epoch instead of sending a network update every second.
- Participant presence and floating reactions use ephemeral room messages.
- Tasks live in a TinyBase `MergeableStore`, persist to IndexedDB, and synchronize through the same PartyKit room.
- The background is a real WebGL fragment shader. It becomes more energetic while the clock runs and respects reduced-motion preferences.

The warm-noise control is currently visual scaffolding; no third-party audio is bundled. Timer completion chimes, auto-advance, shared notes, and durable focus history remain future capability rather than claimed functionality.

## Run two-player locally

```sh
npm install
npm run dev
```

Open the same URL (including its `?room=` value) in two browser windows. The web app runs on `http://localhost:5173`; the PartyKit room runs on port `1999`.

```sh
npm run check
```

This runs the timestamp/state-machine tests, TypeScript, and the production build.

## Put rooms online

Deploy the PartyKit worker from your own account, then point the web build at it:

```sh
npm run deploy:room
VITE_PARTYKIT_HOST=magma-focus.YOUR_PARTYKIT_USERNAME.partykit.dev npm run build
```

Host `dist/` on any static host. Production auth and private-room authorization are intentionally not faked in this slice; anyone with a room link can join and control its timer.

`npm audit` currently reports five advisories inherited through PartyKit's local Miniflare/esbuild toolchain (four moderate, one high) with no non-breaking npm remediation. They do not appear in the Vite browser bundle, but the room toolchain should be upgraded or migrated with PartyKit's Cloudflare successor before treating this as a hardened public service.

## Architecture boundary

The CRDT owns independently editable workspace data. The clock is server-authoritative because resolving concurrent task edits and agreeing on wall time are different problems. The timer domain is pure TypeScript in `src/domain/timer.ts`, shared by the PartyKit worker and its tests.
