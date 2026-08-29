# Porch product map

## Telos

Porch is a persistent multiplayer place with a full-window view onto the world and shared glass that friends can leave things on.

The finished product should let people do three kinds of things without feeling as though they entered separate applications:

1. **Look at something together** - a live camera, video or playlist, radio station, view of Earth, world pulse, native atmosphere, or supported public web surface.
2. **Leave something together** - ink, notes, links, images, documents, messages, intentions, and future reminders on one spatial surface.
3. **Operate an instrument together** - a focus Block, media queue, soundboard cue, conversation, or another small useful object placed in the room.

The world remains visually primary. Glass and instruments appear where they are used and recede afterward. Magma is the built-in reactive Glow view, not the product identity.

## Product laws

- **One place, not a suite.** Window, glass, instruments, and people compose in one spatial room. Features do not become top-level dashboards.
- **Equal agency.** Every admitted person can tune, draw, edit, delete, invite, talk, and operate instruments. Roles and policies stay out of the ordinary interface.
- **Shared intent, personal senses.** The room shares the selected source, queue, transport intent, artifacts, clock, and conversation. Each device owns mute, volume, sensory reduction, glass visibility, and accessibility preferences.
- **Use the correct consistency model.** CRDT documents own independently editable artifacts; server-sequenced state owns clocks, media commands, schedules, and destructive ordering; ephemeral channels own cursors, presence, voice, and effects.
- **Direct manipulation first.** An object is edited where it lives. Configuration is an in-context tuner with immediate feedback, not an administrative hierarchy.
- **Specialist engines behind owned seams.** Porch owns product meaning and stable state. Excalidraw/Yjs, media players, maps, radio directories, WebRTC, and other libraries own their difficult mechanics through narrow adapters.
- **Responsive posture, same product.** Desktop and phone rearrange and prioritize the same room, objects, commands, and state. Mobile is not a reduced parallel application.
- **Calm at rest, juicy in response.** Motion, sound, light, and haptics reward meaningful actions and collaboration, then settle. They do not become permanent visual demand.
- **Continuity without bureaucracy.** Past means retained residue and recoverable changes; future means a visible queue and things intentionally placed for later. Neither requires a project-management ontology.

These laws apply Interface Lab's engine-adapter, app-owned domain state, semantic command, responsive-posture, and feedback principles without importing its framework wholesale into this React application.

## Finished capability map

### 1. Arrival, identity, and room continuity

A person can create a Porch, invite someone with one payload, enter from another browser, return from a previously admitted device, and recover after reconnect. The room clearly conveys who is here without making membership administration the experience. Every admitted person has the same product controls.

Room state has an explicit shared/local/ephemeral classification and a migration path. Duplicate delivery is idempotent, reconnect restores canonical state, concurrent actions converge, and a broken optional source never takes down the place.

### 2. The window: shared views of the world

Treasure Island is the default full-bleed, cover-fitted view. Anyone can:

- select curated live cameras and live channels;
- paste, queue, reorder, select, play, pause, seek, and skip YouTube videos and playlists;
- browse and tune a world of radio stations;
- choose native Glow and Quiet views;
- open live Earth, satellite/weather, orbit, and a calm world-pulse view;
- share a supported public embed or synchronized link excursion.

A Porch scene is compositional rather than one overloaded media choice:

- one **visual** layer (camera, video, Earth, web, Glow, or Quiet);
- one independent **audio** layer (video audio, radio, ambience, or silence);
- zero or more restrained **world overlays** (weather, daylight, seismic or other situation signals);
- the shared **glass** above them.

The room shares source choice, queue, and meaningful transport commands. Live streams promise the same source and intent, not impossible frame-perfect CDN delivery. Each source reports loading/offline state, attribution, and a graceful fallback.

Supported public embeds use documented provider paths. Arbitrary sites that reject framing become synchronized link cards opened at their original URL. A hosted authenticated shared browser is a later infrastructure class, not an iframe workaround.

### 3. The glass: spatial artifacts

The infinite shared glass supports simultaneous cursors, drawing, erasing, selection, notes, rich text, links, images, documents, stamps, and placeable instruments. Any person can create, edit, move, layer, duplicate, and delete any room object. Touch, pen, mouse, and keyboard operate the same model.

Artifacts persist across reconnect and return. Assets have durable storage. Undo is safe in multiplayer, deleted material can be restored, and useful room content can be imported or exported without serializing private editor internals as the Porch protocol.

Messages and media can be pinned to the glass; spatial objects can link back to their source. Hiding the glass immediately reveals the unobstructed world.

### 4. Focus and self-captology

The focus instrument implements the small doing loop from the owner-supplied *How to Do Things v1.0* reference and the low-friction spirit of Bullet Journal:

1. choose one finishable task or small batch;
2. name or picture its finish line;
3. optionally jot the next one to three physical actions as a disposable Right Now List;
4. run one visible, shared 25-minute Block with mild urgency;
5. mark the completed Block with a satisfying but quiet physical trace;
6. stand, break, repeat, or red-carpet the next start.

The timer remains easy to start without setup. A person may place an intention beside it; co-workers can state their own intentions while sharing the same Block. During focus, transient chrome and noisy effects soften rather than locking conversation or changing permissions. Completion can bloom, chime, stamp the glass, and invite a brief debrief.

Daily marks may be satisfying and tangible, but there are no mandatory streaks, leaderboards, guilt mechanics, nested productivity records, or requirement to organize before starting. The product optimizes for beginning and finishing real work.

### 5. Sound, atmosphere, and playful feedback

Radio and playlists are room atmosphere with local listening consent. A soundboard supplies tasteful built-in and configurable cues for starting, finishing, encouragement, transitions, ambience, and playful interruption. A trigger produces a synchronized visual response and best-effort shared audio; each listener can mute it or reduce sensory intensity.

Sound pads and atmosphere can be arranged and saved with a Porch. The local mixer resolves video, radio, ambience, voice, and cues coherently rather than making each subsystem fight for the device.

### 6. People and communication

Presence includes stable identity, cursor, selection, speaking/focusing/away posture, and lightweight personal intention. Chat supports durable messages, replies, reactions, and pinning a message as a spatial note.

Voice is opt-in and camera-free. A person can join or leave voice, mute, choose a device, see who is speaking, and reconnect on desktop or phone. The initial topology targets trusted small rooms; a provider-backed SFU/TURN adapter can replace transport mechanics if room size requires it without changing Porch semantics.

Focus does not prohibit communication. Conversation may recede or hold notifications quietly, but a person can always reach it.

### 7. Past, future, and saved configurations

Returning restores the room, source composition, queue, objects, and intentional settings. A lightweight timeline shows meaningful room changes - source changes, created or deleted artifacts, completed Blocks, and placed future items - without logging every pointer movement.

A person can inspect an earlier state and restore an object without erasing newer work. Any note, source, timer, document, or cue may be placed for later with an optional date/time. Upcoming items remain visible and only activate automatically when explicitly configured.

People can save, name, apply, import, and export Porch setups: view composition, tool shelf, soundboard, focus treatment, and room defaults. Device-local sensory preferences remain outside shared setups.

### 8. Production craft and operability

The application is beautiful and legible with the world dominant, ordinary nouns and verbs, contextual tools, coherent typography, responsive posture, keyboard and assistive access, reduced motion, and explicit loading/recovery states.

Production has reproducible client and room deployment, source health/fallback behavior, bounded storage, schema migration, abuse-resistant input boundaries, and useful diagnostics. Browser acceptance drives multiple independent contexts through every shared capability and checks convergence, reconnect, reload, delayed durability, equal control, phone posture, and source failure.

## Current truth

### Implemented

- Production room creation, invitation, device return, presence count, and equal invitation.
- Full-window Treasure Island and curated YouTube live sources, arbitrary YouTube video/playlist parsing, native Glow, and Quiet.
- Shared media source/transport state and a server-owned media queue model.
- Excalidraw/Yjs glass with notes, freehand drawing, selection, movement, deletion, local undo mechanics, convergence, and persistence.
- Shared clock start, pause, and reset.
- Durable room chat and personal glass, video mute, Glow/Quiet, and warm-noise choices.

### Actually exercised

- Separate Chromium contexts create a note, converge, move it from the other context, reload it, and delete it from the other context.
- Protected-room creation, invitation, device-proof return, invitation by a second person, and a third person's convergent note.
- Either person starts and pauses the clock, changes the selected YouTube source, adds a playlist URL, and writes durable chat.
- One person's glass visibility, mute, and Glow choice remain local; same-device tabs retain accepted chat.
- A 390x844 browser creates a note without document overflow; the surrounding primary controls pass the retained automated accessibility inspection.
- Provider media is blocked in the deterministic journeys, so those checks prove synchronized intent and embed URLs, not actual external playback, live availability, playlist transport, or autoplay recovery.

### Partial or dormant

- The queue supports add, reorder, remove, stage, and select in domain/server code, but the current one-screen tuner exposes only immediate add/select.
- Reactions, presence choices, session cues, Block aims, ambient cue controls, and richer focus machinery remain in code from earlier versions but are not composed into the current Porch.
- Media sync exists for YouTube intent, but there is no general scene model, radio layer, overlay layer, health model, or source adapter contract.
- Excalidraw supplies more object mechanics than the Porch shelf exposes; live collaborator cursors, durable asset handling, links/documents, and Porch-level restore/export are unfinished.
- Protected canvas reload obtains a new ticket, but socket reconnect currently reuses a consumed one-time admission ticket and can fail until `mag-z6jr` lands.
- Freehand drawing, multiplayer undo ownership, pan/zoom continuity, canvas accessibility, PartyKit actor restart recovery, and actual external media playback are implemented or plausible at engine level but not yet exercised as product claims.
- Chat is durable but has no replies, reactions, spatial pinning, or voice.
- The clock is synchronized but does not implement the choose/finish-line/Block/mark/break loop.

### Absent

- Radio discovery/playback, Earth/satellite/orbit renderers, world-pulse overlays, and supported public web excursions.
- Rich artifact/asset pipeline and placeable media, focus, sound, or future objects.
- Room timeline, object restoration, scheduled future items, and saved Porch setups.
- Integrated soundboard/local mixer and camera-free voice.
- Offline artifact edits, explicit schema migrations across all room state, source observability/fallback receipts, and installable PWA behavior.

## Delivery map

The project-local ticket ledger is the executable dependency graph. Its epics mirror the capability map; leaf tickets describe one user-visible result and its acceptance evidence. Dependencies express real implementation ordering, not speculative importance.

The first enabling seams are:

1. a compositional Porch scene contract;
2. a durable asset boundary for glass artifacts;
3. a room journal for meaningful past/future operations;
4. presence events for cursors, effects, and later voice;
5. a semantic local audio mixer.

Once those exist, world sources, richer artifacts, focus Blocks, soundboard, communication, continuity, and saved setups can be completed independently without forking the product grammar.

Use `tk ready`, `tk blocked`, and `tk dep tree --full <epic>` from this repository to select and inspect work. A closed leaf means its acceptance behavior is implemented and exercised. Closing an epic requires every capability in that epic, not merely its underlying seam or one demonstration.

### Burn-down workflow

1. Run `tk ready` and select a ready **leaf**, not an epic. Claim it with `tk start <id>`.
2. Give a subagent or other worker the telos, complete ticket, current implementation evidence, relevant primary files/tests, dependencies, known traps, and exact meaning of done. Parallel writers use isolated worktrees.
3. Implement the user-visible capability and its acceptance evidence together. Do not close a ticket for a schema, adapter, mock, or test that leaves the named behavior unavailable.
4. Add a ticket note with the clean commit, commands exercised, production/browser evidence where relevant, and any remaining uncertainty that is genuinely outside that ticket.
5. The principal reviews the diff and ordinary entry path, reruns proportionate checks, integrates the clean change, then closes exactly that leaf. `tk ready` exposes newly unblocked work automatically.
6. When capability truth changes, update the smallest owning source - code/tests first, this Current truth section when the product boundary changes, and the README only when ordinary entry or architecture changes.

This workflow uses subagents to burn independent leaves in parallel while the principal retains product synthesis, dependency order, integration, and closure judgment.
