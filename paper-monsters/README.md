# Paper Monsters (working title)

A side-view, health-based platform fighter in a layered paper-cutout style. Paper Monsters is a working title for a growing cast of distinct fighters. The current implementation includes Vampire, Assassin and Barbarian, plus practice bots that use those identities.

## Visual direction

The shared identity is handmade paper: layered scenery, cutout characters, tactile textures and theatrical presentation. Vampire keeps its gothic character design and abilities. Moonlit Manor is specifically the Vampire’s arena, not the theme for every map or the whole game.

Three selectable arenas have distinct platform layouts: Moonlit Manor has balanced wings and a high perch; Broken Stronghold has stepped flanking routes and a low center; Rooftop Run has staggered narrow ledges. Fighters can visit any arena. Further visual and musical differentiation remains future work.

The current three-fighter roster is ready for further human play-testing. Additional characters remain future work.


## Run

From the repository root: `python3 -m http.server 8080 --bind 127.0.0.1`, then open http://127.0.0.1:8080/paper-monsters/public/.

## Controls

A/D or left/right: move. Space: jump / double-jump. Vampire: J knife, K Bloodsuck, L Dark Cloak, I Bat Wings. Assassin: J katana, K dagger, L throwing knives. Left-click the arena to aim and fire an Assassin volley; L remains available. Touch the arena to set aim, then tap Throwing Knives; W/S or up/down adjusts the angle for keyboard-only aiming, with left/right movement setting facing. WASD/arrows while a bat: fly. Esc: pause. Touch movement and clickable ability cards are included. Reset starts a fresh round; practice bot can spar or stand still. Sound is enabled by default and starts when the player enters the stage (a browser-permitted interaction). The sound toggle can mute it before or during play.

## Rules

- Vampire starts at 90 HP with a healing cap of 110. Bots use their chosen fighter’s starting/max HP. Victory/defeat at zero HP; this is not a percentage/knockout system.
- Vampire retains its 3-damage knife attack with a 2-second cooldown. Assassin has only its three specified attacks, no generic fourth knife.
- Bloodsuck: forward lunge, 5 damage and 5 healing, once per lunge. Missing stuns for 0.5 seconds. Cooldown 5 seconds from activation.
- Dark Cloak: invisible to the bot for 3 seconds, with a translucent local silhouette so the player can navigate. Can overlap attacks. Half damage and healing rounded up (knife 2; Bloodsuck 3/3). Cooldown 20 seconds from activation.
- Bat Wings: 10 seconds of free flight through platforms, smaller collision body, no ability activations. Cooldowns continue. Incoming damage multiplied by 1.5, retaining fractional HP. Cooldown 30 seconds after transformation ends. No early cancellation.
- Movement is confined to the practice stage; no fall deaths. Bot pauses tracking and attacking during cloak.

## Art/audio

Original code-drawn paper scenery and articulated cutout characters, with cached procedural paper grain. Original synthesized music-box-like loop and sound effects using Web Audio; no downloaded art or audio assets. The earlier concept board is a direction reference, not runtime art.

## Tests and deployment

`node --test paper-monsters/tests/*.test.mjs`

Push to main triggers the existing Firebase Hosting workflow, copies public assets to `/paper-monsters/`, and adds a link on noam.bot. Practice runs in the browser. Online play requires the separately deployed authoritative Cloud Run service described below. Hosting deployments do not deploy the server.

## Assassin and practice bots

- Assassin: 80 starting/max HP, no healing ability.
- Katana: 5 damage, 115px melee reach (plus target body radius), 3s cooldown.
- Dagger: 43px reach, 5s cooldown; 1 damage in front of target, 15 from behind according to target facing. Gold cross-cut effects and BACKSTAB text distinguish rear hits.
- Throwing knives: 12s cooldown. Three projectiles spaced 0.14s apart, 680px/s with 1.35s lifetime. Aim is locked at activation. Successful hits within a volley deal 3, 4, then 5; misses do not increment the hit count. Projectiles use swept collision checks and pass through one-way platforms.
- Fighter and opponent selectors reset the round; random opponent chooses Vampire, Assassin, or Barbarian on each reset.
- Bot: 0.8s reaction to a player moving behind it, 0.6s visible windup, 2.8s post-attack recovery. Vampire bot alternates knife/Bloodsuck; Assassin bot alternates katana/throwing knives. Vampire and Assassin bots use two attacks to keep practice readable; Barbarian bot uses both axe attacks and Rampage. Bot projectile aim is fixed when windup begins so the player can dodge. Standing-still mode keeps the bot's facing and cancels outstanding bot activity/projectiles.
- Sound remains enabled by default, activated by entering the stage; mute remains available.

## Barbarian

120 starting/max HP. Base movement 216px/s (10% slower than the other fighters' 240px/s). Three abilities only; no generic knife.

- J — Cleaving Strike: 10 damage, 150px forward reach plus target radius, 0.35s visible windup, 0.7s total action. Speed is 55% of the current base during this action. Its overhead arc extends 35px higher against targets above it; horizontal reach and downward reach are unchanged. Cooldown 3.5s from activation.
- K — Axe Tempest: five alternating sweeps that cover both sides with 135px reach plus target radius. Impacts at 0.35, 0.85, 1.35, 1.85 and 2.35s; action ends at 2.65s. Successful hits escalate 2,4,6,8,10 (30 maximum before modifiers). Misses do not advance the count. Movement is 30% of current base, no new jumps, no hit-stun applied to opponents. Cooldown 45s from activation.
- L — Rampage: lasts 3s, can overlap either axe action. Damage dealt ×1.5, damage received ×0.8, base movement 264px/s (10% faster than other fighters); axe movement restrictions still apply. No damage rounding is applied by these modifiers. Cooldown 60s from activation.
- If no damage was dealt during Rampage: cancel outstanding axe action, stun 3s, then move at 55% base speed for a full 5s. A single successful damage event during Rampage prevents both penalties.

## Balance validation

See `balance/REPORT.md` and the reproducible `balance/simulate.mjs`. This uses the actual runtime update/physics/attacks with scripted player inputs in both engine slots; it does not infer human competitive balance from DPS alone.

## iPad and hybrid input

Touch layout activates with coarse-pointer capability, or iPadOS's MacIntel platform plus multiple touch points. A Touch controls / Keyboard layout toggle allows manual selection on hybrid devices. Both layouts retain keyboard and mouse input. The touch layout uses a viewport-height-limited arena, compact selectors, 44px-minimum movement/pause/reset targets, 66px ability buttons with cooldowns, and safe-area padding. Normal page scrolling and zoom remain available outside gameplay controls.

- Hold left/right and tap Jump twice for a double-jump. Other fingers can activate abilities simultaneously.
- Vampire bat: hold up/down and left/right together for diagonal flight. Jump also flies upward while held.
- Assassin: touch/drag the arena to aim without firing, then tap Throwing Knives. Up/down adjust angle; horizontal movement sets facing. Mouse left-click aims and fires immediately; right-click and UI clicks do not fire. Keyboard L is unchanged.
- Barbarian: tap either axe ability and Rampage with separate contacts to overlap them. Cooldowns and movement restrictions are unchanged.
- Pointer IDs and keyboard holds are tracked independently; cancellation, lost capture, reset, pause, window blur, hidden page, resize and rotation clear held input. Rotation/focus loss pauses active play. Resume with the pause overlay.
- Sound stays on by default and unlocks on entry/interaction; mute is retained. Audio resumes only through interactions. DOM HUD updates are capped near12Hz while physics and canvas retain animation-frame timing.

Validation: 51 automated tests include real handler calls with multiple synthetic pointer IDs, keyboard/touch overlap, bat flight, double jump, axe/Rampage overlap, aiming-only touch, mouse firing without duplicates, input interruption and iPad desktop-UA detection. Browser checks cover768×1024,1024×768,820×1180 and1180×820 layouts,44px target sizes, no horizontal overflow, and desktop mouse/keyboard regression. These are desktop-browser viewport checks and automated input-handler tests, not physical iPad Safari or hardware multi-touch testing.

## Online multiplayer

Choose a fighter, then choose a mode:

- **Online 1 vs 1:** waits for a real second player, then starts after a three-second countdown.
- **Public battle royale:** 2–5 real players. After the second player joins, the lobby waits up to 30 seconds; five players shorten the countdown to three seconds. No bots fill empty slots.
- **Host friends / Join friends:** share the eight-character room code or copy an invite link. Rooms support 2–5 players. Everyone presses Ready, then the host starts. The host chooses the map before the round.

Health reaching zero eliminates a player. The last survivor wins; a three-minute round with multiple survivors is a draw. Each melee swing strikes one nearby opponent. Ready again after a round to rematch; private rooms also need the host to start again. Leaving forfeits. A network disconnect allows 15 seconds to reconnect while the fighter remains vulnerable; host ownership transfers when the host leaves. Online pause stops your inputs, but the shared match continues.

The Node WebSocket server owns movement, collisions, combat, cooldowns, readiness and results. It simulates at 60 Hz and sends snapshots around 20 Hz; the browser interpolates rendering. Hidden opponents' coordinates are omitted during cloak. Player names are generated; there are no accounts or chat.

### Local server and deployment

Run `npm ci --prefix paper-monsters`, then `PORT=8081 npm start --prefix paper-monsters`. Run the static HTTP server on port 8080 as above. Production clients connect to `wss://paper-monsters-server-146189216753.us-central1.run.app/play`.

Deploy backend changes from the repository root:

```sh
gcloud run deploy paper-monsters-server --source paper-monsters --project gen-lang-client-0448267425 --region us-central1 --allow-unauthenticated --max-instances 1 --min-instances 0 --concurrency 100 --timeout 3600 --memory 256Mi --cpu 1 --quiet
```

Then prepare `fps-game/hosting-public` using the complete Prepare hosting-public step in `.github/workflows/deploy-hosting.yml` (preserving all other games), and deploy with `firebase deploy --only hosting:noam --project gen-lang-client-0448267425 --non-interactive --config fps-game/firebase.json`. The existing GitHub hosting service account has a service-usage permission issue; local authenticated Firebase CLI deployment works. Shared combat-rule changes require both backend and frontend deployments.

### Verification and limits

`node --test paper-monsters/tests/*.test.mjs` covers combat, desktop/touch input, authoritative simulation, real socket room lifecycle, public queues, reconnects, rematches and invalid messages. `node paper-monsters/tests/live-smoke.mjs` explicitly exercises the deployed service and writes `LIVE-VERIFICATION.json`; it is not part of ordinary unit tests.

Rooms live in memory in a single Cloud Run instance, capped at 100 connected sockets. Restarts or deployments can end rooms, and this release does not support horizontal scaling or durable reconnect across a server restart. Network latency affects responsiveness; there is no rollback or lag compensation. Cloud Run WebSocket requests have a 60-minute maximum lifetime; the client reconnects when interrupted. See [Cloud Run WebSocket guidance](https://docs.cloud.google.com/run/docs/triggering/websockets).

Browser tests cover separate sessions and tablet-sized layouts. Physical iPad Safari testing and real-player balance testing remain to be done.
