const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.static('public'));

// Word list — silly, fun, safe. Aimed at 5th-grade boys but fun for everyone.
// Each round, the drawer picks from one easy, one medium, and one hard word.
// Harder picks earn more points (see DIFFICULTY_MULTIPLIER).
const WORDS = {
  easy: [
    // simple shapes, short words, easy to draw in 10 seconds
    'apple', 'hat', 'cat', 'dog', 'sun', 'moon', 'star', 'fork', 'spoon', 'cup',
    'ball', 'fish', 'tree', 'house', 'car', 'book', 'eye', 'heart', 'cloud',
    'egg', 'flag', 'key', 'pen', 'bed', 'chair', 'door', 'leaf', 'pizza',
    'donut', 'cookie', 'cake', 'kite', 'boat', 'banana', 'fire', 'web',
    'bee', 'frog', 'pig', 'cow', 'bird', 'owl', 'fox', 'bear', 'bat', 'ant',
    'sock', 'shoe', 'ring', 'bag', 'box', 'coin', 'map', 'tent', 'snake',
    'hot dog', 'snowman', 'rainbow', 'smiley face', 'worm',
  ],
  medium: [
    // recognizable creatures/objects that take some thought to draw
    'dolphin', 'elephant', 'penguin', 'giraffe', 'octopus', 'shark', 'butterfly',
    'dragon', 'skateboard', 'bicycle', 'guitar', 'rocket', 'submarine', 'castle',
    'volcano', 'tornado', 'ninja', 'pirate', 'vampire', 'zombie',
    'lightsaber', 'water balloon', 'pizza slice', 'hamburger', 'taco', 'popcorn',
    'cactus', 'lighthouse', 'backpack', 'rubber chicken', 'whoopee cushion',
    'stinky sock', 'basketball hoop', 'fidget spinner', 'pretzel', 'sandwich',
    'pineapple', 'strawberry', 'watermelon', 'airplane', 'helicopter',
    'fire truck', 'sloth', 'flamingo', 'raccoon', 't-rex', 'creeper',
    'mario mustache', 'ice cream cone', 'wizard', 'knight', 'robot', 'alien',
    'ufo', 'trampoline', 'treehouse', 'disco ball', 'lava lamp',
    'pufferfish', 'hedgehog', 'mummy', 'skeleton',
  ],
  hard: [
    // tricky to draw, tricky to guess — and funny compound scenes for bonus chaos
    'yacht', 'chandelier', 'xylophone', 'telescope', 'kaleidoscope', 'periscope',
    'chameleon', 'narwhal', 'platypus', 'capybara', 'pterodactyl',
    'accordion', 'armadillo', 'anteater', 'hippopotamus', 'rhinoceros', 'tuxedo',
    'saxophone', 'unicycle', 'stethoscope', 'boombox', 'axolotl',
    'dinosaur eating pizza', 'octopus wearing a top hat', 'bigfoot taking a selfie',
    'dragon with a birthday cake', 'robot dog', 'cat in boots',
    'trex tying shoes', 'wizard playing video games', 'loch ness monster',
    'mount rushmore', 'eiffel tower', 'haunted house', 'statue of liberty',
    'astronaut eating spaghetti', 'ninja eating a taco', 'penguin surfing',
    'chicken on a motorcycle', 'alien at school', 'bigfoot on a skateboard',
    'shark wearing sunglasses', 'monkey driving a car',
    'cow jumping over the moon', 'dog on a skateboard', 'tornado of cats',
    'slipping on a banana peel', 'gumball machine', 'treasure map',
  ],
};

const DIFFICULTY_MULTIPLIER = { easy: 1, medium: 1.3, hard: 1.7 };

const ROUND_TIME = 75;        // seconds to draw
const WORD_CHOICE_TIME = 12;  // seconds to pick
const ROUND_END_TIME = 6;     // seconds between rounds
const MIN_PLAYERS = 2;
// Timer pauses while a guesser is typing only when <= this much time is left.
const TYPING_PAUSE_THRESHOLD_MS = 15 * 1000;
// Hard cap so the pause can't be abused to stall the round forever.
const MAX_PAUSE_PER_ROUND_MS = 20 * 1000;

const GAME = {
  players: {},          // id -> { id, name, score, color, guessedThisRound, isDrawer }
  turnOrder: [],        // ids in draw order
  turnIndex: 0,
  drawerId: null,
  word: null,
  difficulty: null,     // 'easy' | 'medium' | 'hard' while drawing
  wordChoices: [],      // [{word, difficulty}, ...]
  state: 'waiting',     // 'waiting' | 'choosing' | 'drawing' | 'roundEnd'
  roundEndsAt: 0,
  strokes: [],          // for late joiners this round
  roundScores: {},      // id -> points earned this round
  roundNumber: 0,
  typingGuessers: new Set(), // socket ids currently typing a guess
  pausedAt: null,       // Date.now() when pause started, or null
  pauseUsedMs: 0,       // total paused ms this round (capped at MAX_PAUSE_PER_ROUND_MS)
};

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#a855f7', '#ec4899',
];
let colorIdx = 0;

function pickThreeWords() {
  // One easy, one medium, one hard.
  return ['easy', 'medium', 'hard'].map(difficulty => {
    const pool = WORDS[difficulty];
    const word = pool[Math.floor(Math.random() * pool.length)];
    return { word, difficulty };
  });
}

function maskWord(word) {
  // replace letters with underscores, keep spaces and hyphens
  return word.split('').map(c => (c === ' ' || c === '-') ? c : '_').join('');
}

function publicPlayerList() {
  return Object.values(GAME.players).map(p => ({
    id: p.id, name: p.name, score: p.score, color: p.color,
    isDrawer: p.id === GAME.drawerId,
    guessed: !!p.guessedThisRound,
  }));
}

// Timer info as ms-remaining so clients don't depend on their own clock
// agreeing with the server's clock. { msLeft, paused }.
function getTimeInfo() {
  if (GAME.state === 'waiting' || !GAME.roundEndsAt) {
    return { msLeft: 0, paused: false };
  }
  const ref = GAME.pausedAt || Date.now();
  return {
    msLeft: Math.max(0, GAME.roundEndsAt - ref),
    paused: !!GAME.pausedAt,
  };
}

function broadcastState(extra = {}) {
  const t = getTimeInfo();
  io.emit('state', {
    state: GAME.state,
    drawerId: GAME.drawerId,
    drawerName: GAME.players[GAME.drawerId]?.name || null,
    wordMask: GAME.word ? maskWord(GAME.word) : null,
    wordLength: GAME.word ? GAME.word.length : null,
    difficulty: GAME.difficulty,
    msLeft: t.msLeft,
    paused: t.paused,
    players: publicPlayerList(),
    roundNumber: GAME.roundNumber,
    ...extra,
  });
}

function maybePause() {
  if (GAME.pausedAt) return;
  if (GAME.state !== 'drawing') return;
  if (GAME.typingGuessers.size === 0) return;
  if (GAME.pauseUsedMs >= MAX_PAUSE_PER_ROUND_MS) return;
  const msLeft = GAME.roundEndsAt - Date.now();
  if (msLeft > TYPING_PAUSE_THRESHOLD_MS) return;
  GAME.pausedAt = Date.now();
  broadcastState();
}

function maybeResume() {
  if (!GAME.pausedAt) return;
  if (GAME.typingGuessers.size > 0 && GAME.pauseUsedMs < MAX_PAUSE_PER_ROUND_MS) return;
  const pauseDur = Date.now() - GAME.pausedAt;
  const remainingBudget = Math.max(0, MAX_PAUSE_PER_ROUND_MS - GAME.pauseUsedMs);
  const credited = Math.min(pauseDur, remainingBudget);
  GAME.roundEndsAt += credited;
  GAME.pauseUsedMs += credited;
  GAME.pausedAt = null;
  broadcastState();
}

function startGameIfReady() {
  const count = Object.keys(GAME.players).length;
  if (GAME.state === 'waiting' && count >= MIN_PLAYERS) {
    GAME.turnOrder = Object.keys(GAME.players);
    GAME.turnIndex = -1;
    nextTurn();
  }
}

function nextTurn() {
  // reset per-round state
  GAME.strokes = [];
  GAME.word = null;
  GAME.difficulty = null;
  GAME.wordChoices = [];
  GAME.roundScores = {};
  GAME.typingGuessers.clear();
  GAME.pausedAt = null;
  GAME.pauseUsedMs = 0;
  for (const p of Object.values(GAME.players)) {
    p.guessedThisRound = false;
  }

  // pick next drawer from turn order, skipping dropped players
  const ids = Object.keys(GAME.players);
  if (ids.length < MIN_PLAYERS) {
    GAME.state = 'waiting';
    GAME.drawerId = null;
    io.emit('clearCanvas');
    broadcastState({ message: 'Waiting for more players…' });
    return;
  }
  // rebuild turn order if someone left or it's stale
  GAME.turnOrder = GAME.turnOrder.filter(id => GAME.players[id]);
  for (const id of ids) if (!GAME.turnOrder.includes(id)) GAME.turnOrder.push(id);

  GAME.turnIndex = (GAME.turnIndex + 1) % GAME.turnOrder.length;
  GAME.drawerId = GAME.turnOrder[GAME.turnIndex];
  GAME.roundNumber++;

  GAME.state = 'choosing';
  GAME.wordChoices = pickThreeWords();
  GAME.roundEndsAt = Date.now() + WORD_CHOICE_TIME * 1000;

  io.emit('clearCanvas');
  // only the drawer sees the choices
  io.to(GAME.drawerId).emit('chooseWord', { choices: GAME.wordChoices, msLeft: getTimeInfo().msLeft });
  broadcastState();

  // auto-pick if drawer doesn't choose in time (picks the easy option)
  setTimeout(() => {
    if (GAME.state === 'choosing' && GAME.drawerId && !GAME.word) {
      const def = GAME.wordChoices[0];
      startRound(def.word, def.difficulty);
    }
  }, WORD_CHOICE_TIME * 1000 + 200);
}

function startRound(word, difficulty) {
  GAME.word = word;
  GAME.difficulty = difficulty;
  GAME.state = 'drawing';
  GAME.roundEndsAt = Date.now() + ROUND_TIME * 1000;
  // only the drawer knows the real word
  io.to(GAME.drawerId).emit('yourWord', { word, difficulty });
  broadcastState();
  scheduleRoundEnd();
}

// Re-schedule round-end, accounting for pauses that extend roundEndsAt.
function scheduleRoundEnd() {
  const roundToken = GAME.roundNumber;
  const tick = () => {
    if (GAME.state !== 'drawing' || GAME.roundNumber !== roundToken) return;
    if (GAME.pausedAt) {
      setTimeout(tick, 500);
      return;
    }
    const msLeft = GAME.roundEndsAt - Date.now();
    if (msLeft <= 0) {
      endRound('time');
      return;
    }
    setTimeout(tick, msLeft + 50);
  };
  setTimeout(tick, ROUND_TIME * 1000 + 100);
}

function endRound(reason) {
  GAME.state = 'roundEnd';
  GAME.roundEndsAt = Date.now() + ROUND_END_TIME * 1000;
  GAME.typingGuessers.clear();
  GAME.pausedAt = null;

  const revealed = GAME.word;
  const scoresThisRound = { ...GAME.roundScores };

  io.emit('roundEnd', {
    word: revealed,
    difficulty: GAME.difficulty,
    reason,
    roundScores: scoresThisRound,
    totals: publicPlayerList().map(p => ({ id: p.id, name: p.name, score: p.score })),
  });
  broadcastState();

  setTimeout(() => {
    if (GAME.state === 'roundEnd') nextTurn();
  }, ROUND_END_TIME * 1000);
}

function normalize(s) {
  return (s || '').toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

function distance(a, b) {
  // simple Levenshtein for "close guess" hint
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

io.on('connection', (socket) => {
  const t = getTimeInfo();
  socket.emit('init', {
    id: socket.id,
    state: GAME.state,
    players: publicPlayerList(),
    drawerId: GAME.drawerId,
    wordMask: GAME.word ? maskWord(GAME.word) : null,
    difficulty: GAME.difficulty,
    msLeft: t.msLeft,
    paused: t.paused,
    strokes: GAME.strokes,
    roundNumber: GAME.roundNumber,
  });

  socket.on('join', (rawName) => {
    if (GAME.players[socket.id]) return;
    const name = (rawName || 'Player').toString().slice(0, 16).trim() || 'Player';
    const color = COLORS[colorIdx++ % COLORS.length];
    GAME.players[socket.id] = {
      id: socket.id,
      name,
      score: 0,
      color,
      guessedThisRound: false,
    };
    io.emit('chat', {
      system: true,
      text: `${name} joined the game.`,
    });
    broadcastState();
    startGameIfReady();
  });

  socket.on('chooseWord', (choice) => {
    if (socket.id !== GAME.drawerId || GAME.state !== 'choosing') return;
    // Accept either the raw word string (legacy) or {word, difficulty}.
    const picked = typeof choice === 'string'
      ? GAME.wordChoices.find(c => c.word === choice)
      : GAME.wordChoices.find(c => c.word === choice?.word);
    if (!picked) return;
    startRound(picked.word, picked.difficulty);
  });

  socket.on('stroke', (s) => {
    if (socket.id !== GAME.drawerId || GAME.state !== 'drawing') return;
    if (GAME.pausedAt) return; // drawing frozen while a guesser is typing
    // Basic sanity — coords are expected to be 0..1 floats
    if (typeof s !== 'object' || s === null) return;
    const stroke = {
      x0: +s.x0, y0: +s.y0, x1: +s.x1, y1: +s.y1,
      color: (typeof s.color === 'string') ? s.color.slice(0, 16) : '#111',
      size: Math.max(1, Math.min(40, +s.size || 4)),
    };
    if ([stroke.x0, stroke.y0, stroke.x1, stroke.y1].some(v => Number.isNaN(v))) return;
    GAME.strokes.push(stroke);
    socket.broadcast.emit('stroke', stroke);
  });

  socket.on('fill', (data) => {
    // undo-all / fill bucket — we only support clear for simplicity
  });

  socket.on('clearCanvas', () => {
    if (socket.id !== GAME.drawerId || GAME.state !== 'drawing') return;
    if (GAME.pausedAt) return;
    GAME.strokes = [];
    io.emit('clearCanvas');
  });

  socket.on('typingStart', () => {
    const p = GAME.players[socket.id];
    if (!p) return;
    if (socket.id === GAME.drawerId) return;
    if (p.guessedThisRound) return;
    if (GAME.state !== 'drawing') return;
    if (GAME.typingGuessers.has(socket.id)) return;
    GAME.typingGuessers.add(socket.id);
    maybePause();
  });

  socket.on('typingStop', () => {
    if (!GAME.typingGuessers.delete(socket.id)) return;
    maybeResume();
  });

  socket.on('guess', (rawText) => {
    const player = GAME.players[socket.id];
    if (!player) return;
    const text = (rawText || '').toString().slice(0, 80).trim();
    if (!text) return;

    // drawer can't guess or chat the answer
    if (socket.id === GAME.drawerId) {
      socket.emit('chat', { system: true, text: 'You are the drawer — no guessing!' });
      return;
    }
    // already guessed this round — just chat to other guessed players
    if (player.guessedThisRound) {
      io.emit('chat', {
        from: player.name,
        color: player.color,
        text,
        toGuessers: true,
      });
      return;
    }

    if (GAME.state === 'drawing' && GAME.word) {
      const guess = normalize(text);
      const answer = normalize(GAME.word);
      if (guess === answer) {
        // score: time-based for guesser, +50 per guesser for drawer, scaled by difficulty
        const multiplier = DIFFICULTY_MULTIPLIER[GAME.difficulty] || 1;
        const msLeft = Math.max(0, GAME.roundEndsAt - Date.now());
        const fraction = msLeft / (ROUND_TIME * 1000); // 0..1
        const points = Math.round((60 + fraction * 90) * multiplier);
        player.score += points;
        player.guessedThisRound = true;
        GAME.roundScores[socket.id] = (GAME.roundScores[socket.id] || 0) + points;

        const drawer = GAME.players[GAME.drawerId];
        if (drawer) {
          const drawerPts = Math.round(50 * multiplier);
          drawer.score += drawerPts;
          GAME.roundScores[drawer.id] = (GAME.roundScores[drawer.id] || 0) + drawerPts;
        }

        io.emit('chat', {
          system: true,
          good: true,
          text: `✓ ${player.name} guessed the word! +${points}`,
        });
        socket.emit('youGuessed', { word: GAME.word, points });
        // if this guesser was typing, release any pause they were holding
        if (GAME.typingGuessers.delete(socket.id)) maybeResume();
        broadcastState();

        // end early if everyone (except drawer) has guessed
        const guessers = Object.values(GAME.players).filter(p => p.id !== GAME.drawerId);
        if (guessers.length > 0 && guessers.every(p => p.guessedThisRound)) {
          endRound('allGuessed');
        }
        return;
      }

      // "close" hint (not the word, but within 1 edit)
      if (distance(guess, answer) === 1 && answer.length > 3) {
        socket.emit('chat', { system: true, text: `So close! "${text}" is almost it.` });
      }
    }

    // normal chat / guess for everyone
    io.emit('chat', {
      from: player.name,
      color: player.color,
      text,
    });
  });

  socket.on('disconnect', () => {
    const player = GAME.players[socket.id];
    if (!player) return;
    io.emit('chat', { system: true, text: `${player.name} left.` });
    delete GAME.players[socket.id];
    // clean up typing state (releases pause if they were the last typer)
    if (GAME.typingGuessers.delete(socket.id)) maybeResume();
    // if the drawer left, end the round immediately
    if (GAME.drawerId === socket.id) {
      if (GAME.state === 'drawing' || GAME.state === 'choosing') {
        endRound('drawerLeft');
      } else {
        GAME.drawerId = null;
      }
    } else {
      broadcastState();
    }
  });
});

// Periodic state ping so clients keep the timer in sync
setInterval(() => {
  // If guessers started typing above the threshold, re-check now that
  // time has ticked down into it.
  if (!GAME.pausedAt && GAME.state === 'drawing' && GAME.typingGuessers.size > 0) {
    maybePause();
  }
  const t = getTimeInfo();
  io.emit('tick', {
    msLeft: t.msLeft,
    paused: t.paused,
    state: GAME.state,
  });
}, 1000);

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3002;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('=================================');
  console.log('   DRAWING GAME SERVER RUNNING');
  console.log('=================================');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${ip}:${PORT}`);
  console.log('=================================');
  console.log('');
});
