# Paper Monsters (working title)

A side-view, health-based platform fighter in a layered paper-cutout style. The game is an ensemble fighter, not a vampire-themed game. Vampire has been play-tested. The roster now includes Vampire and Assassin, plus practice bots that use those identities. Moonlit Manor remains the first character-themed stage. Barbarian is planned but has no specified moves yet; do not invent its design. Future arenas should reflect those characters, not repeat the vampire theme.

## Run

From the repository root: `python3 -m http.server 8080 --bind 127.0.0.1`, then open http://127.0.0.1:8080/paper-monsters/public/.

## Controls

A/D or left/right: move. Space: jump / double-jump. Vampire: J knife, K Bloodsuck, L Dark Cloak, I Bat Wings. Assassin: J katana, K dagger, L throwing knives. Point or tap in the arena to set aim; W/S or up/down adjusts the angle for keyboard-only aiming, with left/right movement setting facing. WASD/arrows while a bat: fly. Esc: pause. Touch movement and clickable ability cards are included. Reset starts a fresh round; practice bot can spar or stand still. Sound is enabled by default and starts when the player enters the stage (a browser-permitted interaction). The sound toggle can mute it before or during play.

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
- Katana: 5 damage, 115px melee reach (plus target body radius), 1.5s cooldown.
- Dagger: 43px reach, 3s cooldown; 1 damage in front of target, 15 from behind according to target facing. Gold cross-cut effects and BACKSTAB text distinguish rear hits.
- Throwing knives: 7s cooldown. Three projectiles spaced 0.14s apart, 680px/s with 1.35s lifetime. Aim is locked at activation. Successful hits within a volley deal 3, 4, then 5; misses do not increment the hit count. Projectiles use swept collision checks and pass through one-way platforms.
- Fighter and opponent selectors reset the round; random opponent chooses Vampire or Assassin on each reset. No Barbarian placeholder.
- Bot: 0.8s reaction to a player moving behind it, 0.6s visible windup, 2.8s post-attack recovery. Vampire bot alternates knife/Bloodsuck; Assassin bot alternates katana/throwing knives. Bots use two attacks to keep practice readable, not the full player kit. Bot projectile aim is fixed when windup begins so the player can dodge. Standing-still mode keeps the bot's facing and cancels outstanding bot activity/projectiles.
- Sound remains enabled by default, activated by entering the stage; mute remains available.
