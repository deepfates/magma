# Magma

Magma is a multiplayer focus instrument: a living view, a server-authoritative clock, quiet presence, and a TinyBase CRDT workspace. The current name is less important than the interaction—the product should feel calm enough to live beside and crisp enough to operate deliberately.

- **Live:** [magma-one-azure.vercel.app](https://magma-one-azure.vercel.app)
- **Room service:** `magma-focus.deepfates.partykit.dev`

## Definition of finished — the intended 1.0 endpoint

Magma 1.0 is finished when a trusted group of two to eight people can use it as a place they genuinely return to: arrive without disruption, gather around a shared intention, work together without social noise, reconnect naturally at a break, and leave enough context for the next person or session. It should feel calm while inhabited, expressive at thresholds, and legible without instruction.

The quiet working posture is **the Floor**. The socially open break posture is **the Porch**. The timer is the room’s social protocol: it opens and closes bandwidth instead of merely counting minutes.

This is the product endpoint, not a description of what is implemented today. The sections below record current reality separately.

### The complete human loop

1. **Enter a real room.** A person follows a revocable invitation, joins under a stable room identity, chooses a name and sensory setup, and can see who is present without being tracked. Owners can lock the room, rotate invitations, admit or remove people, and delegate stewardship.
2. **Arrive quietly.** Joining never changes the timer or media and never interrupts a focus Block. A person can join now, wait for the next break, remain quietly present, or mark themselves away. Multiple tabs remain one social person.
3. **Gather deliberately.** Before a Block, people may name a visible finish line and indicate readiness. Readiness informs the steward but never becomes a vote, score, or gate. The room can begin immediately or after a short gathering window.
4. **Focus behind an attention firewall.** The shared clock, living view, personal finish line, and low-bandwidth presence remain available. New messages and nonessential reactions are accepted without badges, sounds, layout shifts, or individually attributable animation. Nobody is required to keep video, sound, notifications, or voice enabled.
5. **Cross the threshold together.** Completion creates one durable room Ember, releases held social signals as a restrained bloom, and lets each person privately count or release their own Block. The transition is expressive once, not continuously stimulating.
6. **Open the Porch.** During the break, an ephemeral conversation becomes live, optional voice becomes available, held messages appear, people can edit the listening queue, and useful lines can be promoted into durable Sparks. A person can choose a completely quiet break without changing the room for anyone else.
7. **Return cleanly.** The room signals the approaching Block visually, invites readiness again, and closes social bandwidth without forcibly changing another person’s microphone, volume, or sensory preferences.
8. **Remain useful asynchronously.** A completed Block may leave one optional handoff tied to a task or Spark. A later visitor can understand where the room left off without reading an endless chat archive or exposing attendance histories and productivity statistics.

### Complete capabilities

- **Presence:** explicit arriving, ready, focusing, away, Porch, and reconnecting states; optional finish lines and expiring return markers; no inferred attention, online-duration counters, read receipts, or “last active” surveillance.
- **Communication:** a bounded Porch conversation, focus-time whispers delivered only at the next break, promotion from conversation to Spark, phase-aware reactions, local blocking, and accessible text equivalents for every audible or animated signal.
- **Shared atmosphere:** a server-authoritative queue for supported live views, videos, music, and playlists; contributor attribution; deterministic concurrent enqueue and reorder; open-deck and stewarded-deck policies; phase-boundary staging for disruptive changes; local mute and visibility that no room command can override.
- **Sound and juice:** one local mixer with voice, shared media, ritual-signal, and personal-ambience buses; ducking that preserves speech and cues; a rate-limited semantic soundboard; optional trusted-room sound packs that are break-only by default; and one action that immediately quiets every nonessential local source.
- **Voice without video:** explicit opt-in room audio, joined muted, Porch-only as the recommended posture, open-room and policy-controlled push-to-talk alternatives, per-person local volume and block, device and network feedback, and no recording or transcription by default. Voice failure never impairs the clock, workspace, text, or media controls.
- **Shared work:** independently editable tasks and Sparks, ownership without territorial locking, bounded durable history, completion Embers, and optional human-authored handoffs that remain distinct from server-authored timing evidence.
- **Room governance:** owner, steward, member, and guest capabilities; separate policy for timer, media, queue, text, soundboard, voice, and invitations; revocable access; rate limits; room capacity; moderation receipts; and honest behavior when reliable exclusion is not possible.

### Calm and juice laws

- Juice concentrates at arrival, start, completion, and break. Entropy decays during focus.
- The room may communicate phase, presence, consent, or accomplishment. It does not manufacture engagement for its own sake.
- Quiet is a complete setup, never a degraded mode.
- No action by another participant can enable a person’s microphone, unmute audio, reveal a hidden view, disable reduced-sensory mode, or opt them into notifications.
- No streaks, leaderboards, XP, attendance rankings, comparative completion rates, urgency channels, or rewards for remaining connected.
- No typing indicators, read receipts, focus-time unread badges, surprise audio, autoplay assumptions, or guilt language for arriving late, leaving, staying silent, or releasing a Block.
- The living view remains the spatial field. Social tools appear as instruments when summoned and cover away when dismissed; Magma does not become a grid of feeds, chat columns, or floating widgets.

### Technical and experiential acceptance

Magma 1.0 is not complete until the following have been exercised through ordinary entry points under realistic conditions:

- Two to eight independent people can complete the full arrival → gathering → focus → completion → Porch → return loop across desktop and phone-sized layouts.
- Signed room access distinguishes stable identity from editable profile presentation. Invitations can be rotated, secrets and private profile fields do not enter URLs or shared client state, and authorization is enforced by the server rather than hidden UI.
- Canonical timer, media transport, queue, room policy, chat order, and moderation consequences survive reconnects and concurrent commands. Shared state converges without command echoes, duplicate messages, duplicate completion artifacts, or one subsystem invalidating another’s revision.
- Communication history is paginated and retention-bounded rather than embedded in general room snapshots. Server IDs, authorship, ordering, timestamps, deletion, and moderation are not client-asserted.
- Voice uses a real SFU/TURN media path with short-lived room grants. Tests cover denied permissions, device loss, reconnect, token expiry, local mute, moderator revocation, and two physical or independently isolated clients.
- Media and voice obey browser autoplay rules and provider terms without claiming sample-accurate synchronization. Provider or network failure produces a local fallback while the focus instrument remains usable.
- Keyboard operation, visible focus, reduced motion, reduced sensory output, screen-reader semantics, contrast, responsive posture changes, and text alternatives pass automated checks and human review.
- Per-message-class limits, bounded queue and history sizes, malformed input, replay, impersonation, reconnection, and nuisance-participant behavior have adversarial coverage. Operational telemetry records failures and rejection counts without logging message bodies, intentions, room secrets, microphone data, or media payloads.
- A clean checkout can run its documented verification, deploy both control plane and client, and reproduce a multi-browser production smoke test. The deployed room can recover from an interrupted client and a sleeping/restarted room authority without losing accepted durable state.

### Representative human acceptance

Automated evidence can prove mechanics; it cannot prove that the room deepens attention or that the Porch makes returning easier. Before 1.0, at least three independent groups must complete the full Floor → Porch → Floor loop without developer facilitation. The evidence must include a first-time steward, mixed phone and desktop use, a participant using a silent or reduced-sensory setup, a real voice session across independently isolated devices and networks, and a disrupted connection that recovers without social or state confusion.

Those groups must be able to explain who controlled what, what other people could perceive, what persisted, and how to make the room quiet. They must not need an external call or chat to complete the salon ritual. The owner must ratify from representative use—not screenshots or fixtures—that focus felt quieter than the break, social presence helped rather than competed, and people wanted to return without unread pressure or engagement debt.

One adversarial salon rehearsal must also survive this ordinary path: a locked room admits four distinct people; they enter with different sensory and voice choices; one joins late; focus-time messages and reactions remain noninterrupting; the steward disconnects; concurrent media or queue actions resolve visibly; an offline workspace edit converges; completion occurs exactly once; the Porch opens; only opted-in microphones publish; one participant is locally blocked and one guest is removed with access revoked; a useful message becomes a Spark; the room returns to focus; and reload restores durable room truth without replaying transient signals or enabling personal media.

### Deliberate non-goals for 1.0

Magma 1.0 is not video chat, a public community-discovery network, a creator broadcast platform, an enterprise attendance system, a permanent general-purpose chat server, or a competitive productivity game. It does not require recording, transcription, AI coaching, calendar integration, public profiles, native mobile background execution, arbitrary file sharing, or an unlimited custom-audio marketplace. Those may be considered later only if they strengthen the shared focus ritual without weakening privacy, calm, or room sovereignty.

“Finished” does not mean no future additions. It means the complete loop above is dependable, safe enough for its stated trusted-room use, beautiful in every supported posture, and compelling enough that people choose to return without being manipulated into returning.

## What is real

- A room is named by `?room=...`; the Invite button copies the join link.
- PartyKit owns the canonical timer state. Server alarms settle elapsed phases exactly once; clients derive the display from a sampled server-time offset instead of broadcasting every second.
- PartyKit separately owns the canonical room-media state: source, playback intent, position anchor, playlist index, controller, and revision. The YouTube IFrame API projects that state locally and corrects material VOD drift without feeding remote corrections back into the room.
- The first member present holds timer authority across all of their tabs. Everyone else can propose a timer change; the host can approve it or pass the crown, and host loss triggers a deterministic handoff. Shared media is democratic: every connected participant can steer it.
- Focus completion creates a durable room “ember,” sounds a synthesized local chime, and can automatically begin the shared break. The latest 24 artifacts survive reloads.
- People have stable local profiles and intentions. Tasks support ownership, while CRDT note cards (“sparks”) let the room communicate without breaking focus.
- Tasks and sparks live in a TinyBase `MergeableStore`, persist to IndexedDB, and synchronize through the same room. Server-side schemas, message caps, and rate limits constrain writes.
- Warm noise is synthesized locally with Web Audio. Wake Lock and opt-in completion notifications are progressive enhancements; no audio assets or tracking services are bundled.
- A dominant living view opens on the Treasure Island panorama from Mersea/Teleport and also accepts ABC7’s Treasure Island camera, TrazCam, NASA’s ISS feed, and standard YouTube video or playlist links. Any participant can change the shared source or transport; it converges across browsers and survives reconnects. Instrument mode cover-crops the embed; Camera Controls clears the instrument and exposes shared playback controls.
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

This runs timer/media state-machine and YouTube URL tests, TypeScript, a production build, and real Chromium multiplayer tests covering timer authority across tabs, CRDT convergence, reconnect durability, host handoff, server-alarm completion, one-time Block accounting, two-way media control and convergence, personal-preference isolation, surface continuity across posture changes, phone layout, and automated accessibility checks.

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

The current deployed slice is an excellent public-link focus room, not yet the private social salon defined for 1.0 above. Account recovery, organization policy, analytics, calendar integrations, and native mobile background execution remain outside the current release until their product meaning and operating model are chosen.

The cover-cropped YouTube composition is intended for this personal instrument, not claimed as a generally distributable integration. The render layer keeps a clean media boundary so a licensed native HLS/WebRTC/video source can later replace it without changing the clock, room, ritual, or workspace authorities.
