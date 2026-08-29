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

## Implemented now

- A full-window Treasure Island view by default, with curated Bay and NASA sources, arbitrary YouTube videos/playlists, native WebGL Glow, and Quiet.
- A real tldraw document surface for notes, drawing, selection, manipulation, undo/history, camera behavior, and collaborator presence.
- tldraw's native sync protocol backed by its official `TLSocketRoom`, with official room snapshots persisted by a dedicated PartyKit canvas party.
- A narrow `PorchCanvas` adapter that supplies Porch identity and tools, removes the generic whiteboard chrome, and leaves the native editor reachable through ordinary canvas gestures and shortcuts.
- Self-hosted tldraw fonts, translations, icons, and embed assets using tldraw's official Vite asset package rather than a hidden CDN dependency.
- Lazy editor loading after the Porch admission threshold; the arrival surface does not import or mount the canvas engine.
- Any admitted person can create, edit, move, and delete canvas objects; operate the clock; choose the shared media source; write in the room; and create another invitation.
- PartyKit authorities for room admission, people/chat, the shared clock, and media intent. Wall time and playback remain outside document history because they are temporal state, not canvas edits.
- Local-only glass visibility, Glow/Quiet presentation, mute, volume, and synthesized warm sound.
- Existing TinyBase task and spark tables retained for non-destructive migration. They are not a second canvas or collaboration model.

## Architecture

The design follows Interface Lab's engine-adapter idiom:

```text
Porch product surface
  ├─ PorchCanvas adapter ── tldraw editor + native presence/history
  │                         └─ tldraw sync party + PartyKit persistence
  └─ Porch room model ───── PartyKit clock, media, chat, admission
```

The application owns room identity, product tools, media meaning, and temporal authorities. tldraw owns its document schema, hit testing, gestures, rendering, camera, history, and sync protocol. Porch does not build parallel versions of those mechanisms or serialize editor internals into PartyKit.

## Exercised evidence

```sh
npm install
npm run check
```

The automated browser journeys use separate isolated Chromium contexts and real tldraw gestures. They exercise:

- one person leaving a note and another moving and deleting it;
- cross-browser convergence, reload persistence, and the native tldraw sync party;
- either person starting and pausing the shared clock;
- either person changing the shared window while glass and atmosphere choices remain local;
- protected-room creation, invitation, device-proof return, invitation by a second person, and a third person's convergent note;
- a phone viewport and accessibility inspection of the primary product controls.

A separate browser-control pass also created a tldraw note through the visible Porch surface and found no console errors. These prove bounded mechanics. They do not yet prove broad desirability or long-lived public operation.

## Run locally

```sh
npm run dev
```

Open the same `?room=` URL in separate browser profiles. The local services are:

- Vite client: `http://127.0.0.1:5173`
- PartyKit room authority: port `1999`
- tldraw canvas party: `/parties/canvas/:room` on the same PartyKit service

## Current limits and unknowns

- The current tldraw SDK displays its required production watermark unless `VITE_TLDRAW_LICENSE_KEY` is supplied under an appropriate tldraw license. The project does not bypass it.
- Canvas assets currently use tldraw's inline base64 prototype store. Images and other large assets need a real object-storage adapter before they are product-ready.
- Protected canvas connections obtain a fresh one-time admission ticket and the canvas party asks the main room authority to consume it before accepting the websocket. Legacy rooms retain their historical open behavior.
- The shared clock is a fixed Porch instrument. Moving high-frequency clock state into document history would be the wrong abstraction; a future spatial clock needs a custom tldraw shape whose geometry is documentary while time remains server-authoritative.
- A true arbitrary shared browser cannot be an iframe feature: sites can refuse embedding, and proxying authenticated browsing introduces cookie, security, rights, and operating-cost boundaries. The honest near-term model is supported embeds plus shared links and media objects.
- YouTube should become an unobscured media window before broad distribution. The current overlay is retained for the owner's personal prototype and is not claimed as a generally compliant integration.
- Production telemetry, nuisance-participant testing, canvas compaction under long-lived use, and representative human return behavior remain unknown.
- The local PartyKit toolchain reports five npm advisories. They do not appear in the Vite browser bundle, but the room toolchain needs an upgrade or migration before hardened public use is claimed.

## Deploy

Provision `MAGMA_INTERNAL_SECRET` in PartyKit, then deploy all three runtime surfaces:

```sh
npm run deploy:room
VITE_PARTYKIT_HOST=magma-focus.deepfates.partykit.dev npm run build
npx vercel --prod
```

The secret must be at least 32 characters and remain in PartyKit's environment store. Additional web origins must be listed in `MAGMA_ALLOWED_ORIGINS`. A production asset store and long-running operational evidence remain required before calling the public deployment hardened.
