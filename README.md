# Magma

Magma is a private shared focus room: see who is here, name one outcome, work to one shared clock against a quiet living view, and talk at the break. The product should feel calm enough to live beside and crisp enough to operate deliberately; its technical systems exist to make that simple ritual trustworthy.

- **Live:** [magma-one-azure.vercel.app](https://magma-one-azure.vercel.app)
- **Room service:** `magma-focus.deepfates.partykit.dev`

## The product test

A new person should be able to make a room, invite someone, name one thing they want to finish, start together, enjoy the shared quiet, meet naturally at the break, and want to do it again. Work that does not materially improve that experience—or the trustworthiness of the path beneath it—is not the next priority. The detailed constraints below guard the experience; they are not a feature checklist or a reason to turn Magma into a collaboration suite.

## Definition of finished — the intended 1.0 endpoint

Magma 1.0 is finished when a trusted group of two to eight people can return to it as a place, not merely operate it as a timer. A first-time visitor should understand the room without instruction: see who is there, name one outcome, start the shared clock, work against the living view, and talk when focus ends.

The depth belongs in four predictable places:

- **Focus:** the current outcome, shared clock, start, completion, and return.
- **Scene:** live views, YouTube videos and playlists, the shared background queue, local sound, and one action that makes the device quiet.
- **Room:** presence, invitations, break-time conversation, reactions, and eventually opt-in voice when it can be dependable and private.
- **Board:** later work, durable notes, and unfinished outcomes carried forward from a focus.

The first screen stays spare; the room becomes deeper when a person reaches for it. That is progressive disclosure, not a smaller product. Shared controls must say what they change, personal controls must never affect another person, and joining must never interrupt the clock or scene.

Magma 1.0 is not complete until separate people can exercise the full create → invite → focus → break → return loop on desktop and phone; timer, queue, Board, presence, and conversation converge across browsers and reconnects; access is enforced by the server; quiet and reduced-sensory use are complete paths; and a clean checkout can reproduce the deployed behavior. Automated tests establish mechanics. Fresh users must still be able to operate the deployed room without coaching, correctly explain what is shared versus local, discover the deeper features, and want to return.

Magma is not video chat, public community discovery, an attendance system, or a competitive productivity game. It has no streaks, rankings, read receipts, surprise audio, or engagement debt. Expressiveness belongs at arrival, start, completion, and break; focus itself should get quieter over time.

## What is real

- Opening Magma without a room creates a private room URL. The first device claims it with a non-extractable, room-scoped P-256 key stored in IndexedDB; returning admission proves that key rather than trusting an editable profile or browser URL. After creation, the owner can copy an invitation or continue alone.
- Owners and stewards can create role-scoped, expiring invitation capabilities. The room address and invitation code remain separate, rotation is atomic, and owners can revoke a member across all connected tabs. Revocation stops shared media, clears visible room state, and removes that room's local workspace cache.
- The PartyKit worker enforces admission before the WebSocket reaches room code, strips client-supplied trusted headers, issues a fresh 30-second one-use ticket for every reconnect, and rechecks durable membership before revealing snapshots. Existing named rooms remain legacy-open instead of being silently claimed.
- PartyKit owns the canonical timer state. Server alarms settle elapsed phases exactly once; clients derive the display from a sampled server-time offset instead of broadcasting every second.
- PartyKit separately owns room-media transport and the background queue, with independent revisions. Queue entries have server-authored IDs, ordering, timestamps, contributor attribution, bounded persistence, idempotent operation receipts, and open or stewarded control. The YouTube IFrame API projects the active transport locally and corrects material VOD drift without feeding those corrections back into the room.
- The first member present holds timer authority across all of their tabs. Everyone else can propose a timer change; the host can approve it or hand over control, and host loss triggers a deterministic handoff. Non-guest members can contribute to the queue; owners choose whether everyone or only stewards can reorder and select.
- Focus completion creates one durable session record, sounds an optional synthesized local chime, and can automatically begin the shared break. The latest 24 records survive reloads.
- People have stable local profiles. Board tasks support ownership, while CRDT notes preserve useful context without turning the room conversation into a permanent archive.
- Room carries presence, conversation, and reactions through the full focus → break → return loop. Messages written during focus wait without badges or interruption and appear at the break; useful messages can be saved to the Board. Readiness informs but never gates or auto-starts the next focus. A sender keeps their draft until the server acknowledges the exact operation, and conversation clears only when focus actually begins again.
- Reactions and semantic room signals are phase-aware. During focus they produce no recipient event, badge, sound, or animation; completion releases only an aggregate summary. Reconnect restores that summary as calm text without replaying transient motion or sound. During breaks, signals arrive immediately. Peer audio is a separate local opt-in, off by default, and traffic is limited per member and per room.
- A manual reset, mode change, or cadence change returns the room to gathering: accepted words become visible, while transient reactions and signals are discarded rather than presented as a completion celebration.
- Tasks and sparks live in a TinyBase `MergeableStore`, persist to IndexedDB, and synchronize through the authenticated room socket. The server validates, canonicalizes, restamps, and durably stores accepted CRDT content; guests are read-only, author identity is server-bound, and hostile future clocks cannot dominate the room.
- Warm noise is synthesized locally with Web Audio. Wake Lock and opt-in completion notifications are progressive enhancements; no audio assets or tracking services are bundled.
- A dominant living view opens on the Treasure Island panorama from Mersea/Teleport and also accepts ABC7’s Treasure Island camera, TrazCam, NASA’s ISS feed, and standard YouTube video or playlist links. The deck policy governs source selection; non-guest participants can steer the separate shared transport. Both authorities converge across browsers and survive reconnects. Instrument mode cover-crops the embed; Camera Controls clears the instrument and exposes shared playback controls.
- The shared clock and four stable surfaces—Focus, Board, Scene, and Room—sit over the living view. Timing opens directly from the clock instead of competing as another destination. The clock remains reachable while a surface is open; drafts and shared state survive responsive posture changes.
- Scene keeps the active source, attribution, ordered background queue, policy, quick sources, and YouTube URL addition together. Focus-time additions are accepted without changing anyone’s view and become available at the break. Queue-level automatic advance is deliberately absent because live feeds and provider playlists do not provide trustworthy server-side endings.
- Scene keeps its authority boundary visible and operational: source and playback belong to the room; mute, visibility, synthesized warm noise, cue preferences, and sensory reduction stay on the individual device and never enter shared state.
- Before focus, a person names one visible outcome. Changing the room timing no longer erases it. When focus ends, the person can mark it finished or carry it directly onto the shared Board.
- The WebGL field is a fallback when the living view is closed. It pauses when hidden and respects reduced motion; it is atmosphere, not the product identity.

## Productivity grammar

The useful parts of *How to Do Things v1.0* and Bullet Journal appear as behavior, not terminology: choose a concrete outcome, focus, then either finish it or migrate it. The Board holds later work so the timer does not become a task manager. The room supplies presence, not surveillance, and begins again without streak debt.

Signals follow the same boundary. They carry shared meaning while each receiver chooses sound or silence; audio is off until chosen, and “quiet everything” is a complete setup. Magma is an instrument a person operates, not an optimizer that operates on the person.

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

New UUID rooms open behind the arrival veil. Create the room in the first browser, then share both the room URL and the separately displayed invitation code with the second browser. Named pre-existing rooms continue in legacy-open mode.

```sh
npm run check
```

This runs timer, media, queue, conversation, access, and YouTube URL tests; TypeScript and a production build; and real Chromium multiplayer tests covering clock authority across tabs, CRDT convergence, reconnect durability, host handoff, completion, focus-time quiet, break-time release, saving messages and unfinished outcomes to the Board, two-way media control, concurrent queue additions, personal-preference isolation, responsive surface continuity, phone layout, and automated accessibility checks.

## Put rooms online

Provision the worker's internal pre-admission secret once, deploy the worker, then point the web build at it:

```sh
npx partykit env add MAGMA_INTERNAL_SECRET
npm run deploy:room
VITE_PARTYKIT_HOST=magma-focus.deepfates.partykit.dev npm run build
```

`MAGMA_INTERNAL_SECRET` must be at least 32 characters and must stay in PartyKit's environment store; do not put it in source, Vite variables, or deployment arguments. Host `dist/` on an allowed HTTPS origin. Additional client origins must be listed exactly in `MAGMA_ALLOWED_ORIGINS` before deployment.

Private-room production admission is real, but one transport caveat remains: browser WebSockets cannot set an arbitrary authorization header, and this PartyKit version does not negotiate the asynchronous admission subprotocol correctly. The client therefore places only a 30-second, one-use admission ticket in the WebSocket handshake query and the worker consumes and strips it before room code. Invitation capabilities, signing keys, and profile fields never enter URLs. Eliminating even that ephemeral query credential—through a same-site cookie/custom-domain boundary or a runtime with correct subprotocol negotiation—remains required before the stricter 1.0 “no secrets in URLs” gate can be claimed.

`npm audit` currently reports five advisories inherited through PartyKit's local Miniflare/esbuild toolchain (four moderate, one high) with no non-breaking npm remediation. They do not appear in the Vite browser bundle, but the room toolchain should be upgraded or migrated with PartyKit's Cloudflare successor before treating this as a hardened public service.

## Architecture boundary

The CRDT owns independently editable workspace data. The clock, media transport, and Listening Deck use independent PartyKit revisions. Queue transport is server-sequenced rather than modeled as a CRDT because accepted order, attribution, policy, and disruptive activation need one room authority. Enqueue is idempotent and intentionally does not require a queue revision, so concurrent additions both survive; reorder, removal, selection, and policy are revision-bound so stale structural intent loses explicitly instead of silently overwriting. Playback commands bind both transport revision and active deck item. A phase boundary that activates a staged item commits timer, social state, deck, media, and alarm atomically. Local mute or sensory changes cannot enter shared state. The pure domains live in `src/domain/timer.ts`, `src/domain/media.ts`, and `src/domain/mediaQueue.ts`, shared by the PartyKit worker and their tests.

For ordinary videos and playlists, browsers converge to a server-anchored position within a practical buffering tolerance. For YouTube live cameras, synchronization means the same source and live-playback intent—not the same encoded frame, because provider latency and ads can differ by client.

The current deployed slice is a signed, revocable private focus room with an exercised first Floor → Porch → Floor loop and Listening Deck, not yet the complete social salon defined for 1.0 above. Bounded paginated communication and moderation history, real SFU/TURN voice, finer-grained policy for transport/text/soundboard/voice, production telemetry, broader nuisance-participant coverage, and representative human salon evidence remain incomplete.

The cover-cropped YouTube composition is intended for this personal instrument, not claimed as a generally distributable integration. The render layer keeps a clean media boundary so a licensed native HLS/WebRTC/video source can later replace it without changing the clock, room, ritual, or workspace authorities.
