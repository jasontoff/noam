# Paper Monsters (working title)

A side-view, health-based platform fighter in a layered paper-cutout style. Paper Monsters is a working title for a growing cast of distinct fighters. The current implementation includes Vampire, Assassin and Barbarian, plus practice bots that use those identities.

## Visual direction

The shared identity is handmade paper: layered scenery, cutout characters, tactile textures and theatrical presentation. Vampire keeps its gothic character design and abilities. Moonlit Manor is specifically the Vampire’s arena, not the theme for every map or the whole game.

Future arenas should have different settings, palettes, props and music suited to their characters. Possible directions (not final designs or implemented maps): a rugged mountain stronghold for Barbarian, and city rooftops for Assassin. Fighters can visit any arena; stage selection should be independent of fighter selection. Keep the overall menus and branding broad enough for more characters.

The current three-fighter roster is ready for further human play-testing. Additional characters and maps remain future work.


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

Original code-drawn paper scenery and articulated cutout characters, with cached procedural paper grain. Original synthesized music-box-like loop and sound effects using Web Audio; no downloaded assets or external dependencies. The earlier concept board is a direction reference, not runtime art.

## Tests and deployment

`node --test paper-monsters/tests/*.test.mjs`

Push to main triggers the existing Firebase Hosting workflow, copies public assets to `/paper-monsters/`, and adds a link on noam.bot. The game runs entirely in the browser; no backend or Cloud Run deployment is needed.

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
