# The Porch

The Porch is a persistent window onto the world that friends can leave things on.

Open one link together. The viewport is a live view or a slow field of light. Over it is shared glass: draw, leave a note, talk, change the view, run the same clock, and return later to find the intentional marks still there. Every admitted person has the same direct product capabilities. Sound, reduced sensory mode, and whether the glass is visible remain personal.

- **Live Porch:** [magma-one-azure.vercel.app](https://magma-one-azure.vercel.app)
- **Room authority:** `magma-focus.deepfates.partykit.dev`

The production alias runs the Porch client and its coordinated PartyKit room/canvas bundle. Magma now names the native Glow atmosphere, not the product.

## Product test

Two people who know nothing about the project should be able to follow one invitation, recognize that they share a place, see one another there, draw and write on the same glass, move or remove what either person left, change the world behind it, start the same clock, reload, and find the place intact.

The small product grammar is:

- **window** — a shared live view, video, playlist, or native atmosphere;
- **glass** — a persistent spatial surface directly over the world;
- **instruments** — a few shared, legible controls such as the clock;
- **people** — presence, invitation, and lightweight conversation.

Porch is not a productivity-suite dashboard and it is not a reskinned generic whiteboard. The product owns this grammar and the restrained one-screen composition. Specialist libraries own the difficult mechanics underneath it.

The complete requested product space, current capability boundary, and dependency-shaped delivery program live in [PRODUCT.md](PRODUCT.md). This repository owns a local `.tickets` ledger for executable status; use `tk ready` and `tk blocked` here. The product map owns meaning, while tickets record work rather than redefining it.

## Implemented now

- A full-window Treasure Island view by default, with curated Bay and NASA sources, arbitrary YouTube videos/playlists, native WebGL Glow, and Quiet.
- A real Excalidraw surface for notes, drawing, selection, manipulation, undo/history, camera behavior, and keyboard gestures.
- A native-Yjs Excalidraw scene: the CRDT is the document model rather than a second array-shaped synchronization shim. A dedicated PartyKit canvas party merges, broadcasts, and persists its binary Yjs updates.
- A narrow `PorchCanvas` transport adapter that supplies Porch tools and admission, removes the generic whiteboard chrome, and uses the editor's explicit local-update, remote-update, and initialization boundaries.
- Self-hosted Excalidraw fonts copied into the production build rather than fetched from a third-party font CDN.
- Lazy editor loading after the Porch admission threshold; the arrival surface does not import or mount the canvas engine.
- Any admitted person can create, edit, move, and delete canvas objects; operate the clock; choose the shared media source; write in the room; and create another invitation.
- PartyKit authorities for room admission, people/chat, the shared clock, and media intent. Wall time and playback remain outside document history because they are temporal state, not canvas edits.
- A versioned authoritative room-state envelope migrates existing production keys atomically, retains an exact rollback backup, rejects unknown future schemas without writing, and dual-writes the legacy keys during the rollback window.
- Local-only glass visibility, Glow/Quiet presentation, mute, volume, and synthesized warm sound.
- Existing TinyBase task and spark tables retained for non-destructive migration. They are not a second canvas or collaboration model.

## Architecture

The design follows Interface Lab's engine-adapter idiom:

```text
Porch product surface
  ├─ PorchCanvas adapter ── Excalidraw editor + native Yjs scene/history
  │                         └─ binary update party + PartyKit persistence
  └─ Porch room model ───── PartyKit clock, media, chat, admission
```

The application owns room identity, product tools, media meaning, and temporal authorities. Excalidraw owns its per-property Yjs document schema, hit testing, gestures, rendering, camera, and history. Porch transports the editor's Yjs updates without inventing a second canvas model or serializing editor internals into the main room protocol.

## Exercised evidence

```sh
npm install
npm run check
```

The automated browser journeys use separate isolated Chromium contexts and real Excalidraw gestures. They remain on the canvas past the former delayed production failure and exercise:

- one person leaving a note and another moving and deleting it;
- cross-browser convergence, reload persistence, and the native Yjs scene transport;
- either person starting and pausing the shared clock;
- either person changing the shared live window, adding a YouTube playlist, and writing in room chat while glass, mute, and atmosphere choices remain local;
- protected-room creation, invitation, device-proof return, invitation by a second person, and a third person's convergent note;
- repeated protected-canvas socket closure, fresh one-time admission on each reconnect, retained presence and scene, and subsequent editing by both people without duplicate elements;
- a phone viewport and accessibility inspection of the primary Porch controls.

A separate hands-on browser pass kept the canvas open for ten seconds, created a note through the visible surface, observed it in a second session, moved and deleted it from there, then created another note and verified it after reload. The complete canvas reload story was also repeated three times concurrently to falsify the initialization race that the first implementation missed.

## Run locally

```sh
npm run dev
```

Open the same `?room=` URL in separate browser profiles. The local services are:

- Vite client: `http://127.0.0.1:5173`
- PartyKit room authority: port `1999`
- Yjs canvas party: `/parties/canvas/:room` on the same PartyKit service

Protected canvas connections obtain a fresh one-time admission ticket and the canvas party asks the main room authority to consume it before accepting the websocket. Legacy rooms retain their historical open behavior.

## Deploy

Provision `MAGMA_INTERNAL_SECRET` in PartyKit, then deploy all three runtime surfaces:

```sh
npm run deploy:room
VITE_PARTYKIT_HOST=magma-focus.deepfates.partykit.dev npm run build
npx vercel --prod
```

The secret must be at least 32 characters and remain in PartyKit's environment store. Additional web origins must be listed in `MAGMA_ALLOWED_ORIGINS`.
