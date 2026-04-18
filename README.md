# noam

Projects for Noam. Hosted at [noam.bot](https://noam.bot).

---

## fps-game

Multiplayer browser FPS arena. Built with Three.js (rendering) and Socket.IO (realtime multiplayer).

**Live at:** [noam.bot/fps-game](https://noam.bot/fps-game/)

### Architecture

```
┌──────────────────────────┐        ┌────────────────────────────────┐
│ Browser (player)         │        │ Firebase Hosting (noam-bot)    │
│  - loads HTML/JS/models  │───────▶│  serves static files at        │
│                          │        │  noam.bot/fps-game/            │
│                          │        └────────────────────────────────┘
│                          │
│                          │        ┌────────────────────────────────┐
│  socket.io WebSocket     │───────▶│ Cloud Run: fps-game-server     │
│                          │        │  (Node.js + Express + Socket)  │
└──────────────────────────┘        │  us-central1                   │
                                    └────────────────────────────────┘
```

- **Frontend** lives in `fps-game/public/` and is served by Firebase Hosting at `noam.bot/fps-game/`.
- **Backend** is `fps-game/server.js` — an Express + Socket.IO server that runs on Cloud Run (project `gen-lang-client-0448267425`, region `us-central1`, service `fps-game-server`).
- The client detects it's not on localhost and opens a WebSocket to the Cloud Run URL hardcoded in `fps-game/public/game.js`.

### Run locally

```bash
cd fps-game
npm install
npm start
```

Open http://localhost:3000. The client auto-detects `localhost` and connects to the local server instead of the Cloud Run one.

---

## racing-game

Arcade racer with single-player and multiplayer (vs NPCs) modes. Pure client-side Three.js — no backend.

**Live at:** [noam.bot/racing-game](https://noam.bot/racing-game/)

### Architecture

```
┌──────────────────────────┐        ┌────────────────────────────────┐
│ Browser (player)         │        │ Firebase Hosting (noam-bot)    │
│  - loads HTML/JS         │───────▶│  serves static files at        │
│  - all game logic local  │        │  noam.bot/racing-game/         │
└──────────────────────────┘        └────────────────────────────────┘
```

NPCs are AI-driven locally in the browser — there's no server. "Multiplayer" just means more NPCs on the grid. NPC skill is randomised per race within 0.78–0.96 of the player's top speed, so races stay competitive but winnable.

### Run locally

```bash
cd racing-game
npm install
npm start
```

Open http://localhost:3001. Controls: WASD or arrow keys to drive, SPACE for handbrake.

---

## drawing-game

Multiplayer draw-and-guess ("Doodle Duel"). Built with Express + Socket.IO on the server, HTML5 Canvas + vanilla JS on the client. Skribbl.io-style turn-based rounds with a silly, school-safe word list.

**Live at:** [noam.bot/drawing-game](https://noam.bot/drawing-game/)

### Architecture

Same shape as fps-game: static files on Firebase Hosting, authoritative Socket.IO server on Cloud Run.

- **Frontend** in `drawing-game/public/` — single canvas, color/size toolbar, live scoreboard, chat panel.
- **Backend** is `drawing-game/server.js` — owns the round timer, word choice, drawer rotation, stroke broadcast, and scoring. Clients send normalized stroke coords (0..1) so every resolution renders consistently.
- Cloud Run service: `drawing-game-server` in `us-central1`.

### Run locally

```bash
cd drawing-game
npm install
npm start
```

Open http://localhost:3002 in two tabs (or on two devices on the same LAN). Needs at least 2 players to start a round.

### Scoring

- Guesser: +60 to +150 based on how fast they guessed.
- Drawer: +50 per correct guesser.
- Round ends when time runs out OR everyone has guessed.

---

## Repo layout

```
noam/
├── .github/workflows/       # CI/CD — auto-deploys on push to main
│   ├── deploy-hosting.yml   #   → Firebase Hosting (fps-game + racing-game + drawing-game)
│   └── deploy-cloudrun.yml  #   → Cloud Run (fps-game-server + drawing-game-server)
├── fps-game/
│   ├── public/              # Client code served to browsers
│   │   ├── index.html       #   UI shell, menus, HUD
│   │   ├── game.js          #   All game logic (rendering, input, networking)
│   │   └── models/          #   GLB character and weapon models
│   ├── server.js            # Authoritative game server (physics, hit detection, state)
│   ├── Dockerfile           # How Cloud Run builds the server container
│   ├── firebase.json        # Firebase Hosting config (deploys to "noam" target)
│   ├── .firebaserc          # Project + target mapping
│   └── package.json
├── racing-game/
│   ├── public/              # Client code (index.html + game.js)
│   ├── server.js            # Local dev server only (static files)
│   └── package.json
├── drawing-game/
│   ├── public/              # Canvas UI + client networking
│   │   ├── index.html
│   │   └── game.js
│   ├── server.js            # Authoritative round/scoring/stroke broadcast
│   ├── Dockerfile           # Cloud Run build
│   └── package.json
└── README.md
```

---

## Deploy

**You don't have to do anything manually.** Pushing to `main` triggers GitHub Actions:

- Changes under `fps-game/public/**`, `racing-game/public/**`, or `drawing-game/public/**` → Firebase Hosting redeploys (~35s)
- Changes to `fps-game/server.js`, `fps-game/Dockerfile`, or `fps-game/package*.json` → `fps-game-server` Cloud Run redeploys (~1m)
- Changes to `drawing-game/server.js`, `drawing-game/Dockerfile`, or `drawing-game/package*.json` → `drawing-game-server` Cloud Run redeploys (~1m)

Watch runs with `gh run list` or at https://github.com/jasontoff/noam/actions.

### Manual deploy (fallback)

```bash
# Firebase Hosting (static files for all games)
cd fps-game
# regenerate hosting-public/ first — see .github/workflows/deploy-hosting.yml
firebase deploy --only hosting:noam

# Cloud Run — fps-game server
gcloud run deploy fps-game-server \
  --source fps-game \
  --region us-central1 \
  --project gen-lang-client-0448267425 \
  --allow-unauthenticated \
  --session-affinity \
  --max-instances=20 \
  --timeout=3600

# Cloud Run — drawing-game server
gcloud run deploy drawing-game-server \
  --source drawing-game \
  --region us-central1 \
  --project gen-lang-client-0448267425 \
  --allow-unauthenticated \
  --session-affinity \
  --max-instances=20 \
  --timeout=3600
```

Session affinity matters — Socket.IO needs a sticky connection to one Cloud Run instance.

### Hosting setup reference

- **Firebase project:** `gen-lang-client-0448267425`
- **Firebase Hosting site:** `noam-bot` (target alias: `noam`), connected to the custom domain `noam.bot`
- **Cloud Run services:** `fps-game-server` and `drawing-game-server`, both in `us-central1`
- **GitHub Actions service account:** `github-deployer@gen-lang-client-0448267425.iam.gserviceaccount.com` (key stored as repo secrets `FIREBASE_SERVICE_ACCOUNT` and `GCP_SERVICE_ACCOUNT`)

---

## Notes for new contributors

- The fps-game server is authoritative — all hit detection, movement validation, and game state lives in `fps-game/server.js`. The client only renders and sends input.
- `fps-game/public/game.js` is a single ~1600-line file. Sections are commented; search by feature (e.g. `// === SHOOTING ===`).
- Adding a new weapon: edit `WEAPONS` in `fps-game/server.js` AND add a button in the weapon-select UI in `fps-game/public/index.html`.
- Character and weapon models are in `fps-game/public/models/`. They're GLB format loaded via Three.js GLTFLoader.
- The racing-game has no backend — NPC AI runs entirely client-side. Tune difficulty via the `skill` band in `racing-game/public/game.js` (`spawnCars`).
- The drawing-game server is authoritative over rounds/scoring/drawer selection. Word list lives at the top of `drawing-game/server.js` — add/remove freely. Canvas coords are normalized 0..1 so resolution doesn't matter.

## Troubleshooting

- **Game loads but can't connect:** check the relevant Cloud Run service is up (`gcloud run services describe fps-game-server --region us-central1`, or `drawing-game-server`). The hardcoded URL in the client's `game.js` must match the Cloud Run URL.
- **Changes don't appear after push:** check GitHub Actions ran (`gh run list`). Hosting is cached with `Cache-Control: no-cache` so hard-refresh usually works.
- **WebSocket disconnects randomly:** Cloud Run has a max request timeout of 60min (set via `--timeout=3600`). Idle instances also spin down; the first connection after a cold start may take a few seconds.
