# Paper Monsters (working title)

A side-view, health-based platform fighter in a layered paper-cutout style. The game is an ensemble fighter, not a vampire-themed game. This first play-test has one playable fighter (Vampire), one practice opponent, and one character-themed stage (Moonlit Manor). Planned roster: Barbarian, Assassin, and future characters; do not add them until Vampire has been play-tested. Future arenas should reflect those characters, not repeat the vampire theme.

## Run

From the repository root: `python3 -m http.server 8080 --bind 127.0.0.1`, then open http://127.0.0.1:8080/paper-monsters/public/.

## Controls

A/D or left/right: move. Space: jump / double-jump. J: knife. K: Bloodsuck. L: Dark Cloak. I: Bat Wings. WASD/arrows while a bat: fly. Esc: pause. Touch movement and clickable ability cards are included. Reset starts a fresh round; practice bot can spar or stand still. Sound is opt-in.

## Rules

- Vampire starts at 90 HP with a healing cap of 110. Bot starts at 100 HP. Victory/defeat at zero HP; this is not a percentage/knockout system.
- All fighters have a 3-damage knife attack with a 2-second cooldown.
- Bloodsuck: forward lunge, 5 damage and 5 healing, once per lunge. Missing stuns for 0.5 seconds. Cooldown 5 seconds from activation.
- Dark Cloak: invisible to the bot for 3 seconds, with a translucent local silhouette so the player can navigate. Can overlap attacks. Half damage and healing rounded up (knife 2; Bloodsuck 3/3). Cooldown 20 seconds from activation.
- Bat Wings: 10 seconds of free flight through platforms, smaller collision body, no ability activations. Cooldowns continue. Incoming damage multiplied by 1.5, retaining fractional HP. Cooldown 30 seconds after transformation ends. No early cancellation.
- Movement is confined to the practice stage; no fall deaths. Bot pauses tracking and attacking during cloak.

## Art/audio

Original code-drawn paper scenery and articulated cutout characters, with cached procedural paper grain. Original synthesized music-box-like loop and sound effects using Web Audio; no downloaded assets or external dependencies. The earlier concept board is a direction reference, not runtime art.

## Tests and deployment

`node --test paper-monsters/tests/core.test.mjs`

Push to main triggers the existing Firebase Hosting workflow, copies public assets to `/paper-monsters/`, and adds a link on noam.bot. The game runs entirely in the browser; no backend or Cloud Run deployment is needed.
