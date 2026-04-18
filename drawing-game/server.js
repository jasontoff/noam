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
// Tiers roughly sorted by difficulty, but the drawer picks from a mixed trio.
const WORDS = [
  // easy / classic
  'pizza', 'taco', 'burger', 'donut', 'banana', 'hot dog', 'waffle', 'cupcake',
  'dog', 'cat', 'shark', 'snake', 'monkey', 'elephant', 'penguin', 'tiger',
  'car', 'truck', 'rocket', 'airplane', 'submarine', 'skateboard', 'bike',
  'sun', 'moon', 'rainbow', 'tornado', 'volcano', 'lightning', 'snowman',
  'tree', 'cactus', 'mountain', 'beach', 'cloud', 'fire',

  // silly animals & creatures
  'sloth', 'platypus', 'narwhal', 'capybara', 'llama', 'pufferfish',
  'chameleon', 'axolotl', 'hedgehog', 'flamingo', 'octopus', 'crab',
  'bigfoot', 'yeti', 'loch ness monster', 'dragon', 'unicorn',
  'werewolf', 'zombie', 'mummy', 'skeleton', 'vampire', 'alien', 'ufo',
  't-rex', 'raptor', 'triceratops',

  // heroes, ninjas, cool stuff
  'ninja', 'pirate', 'wizard', 'knight', 'robot', 'cyborg', 'astronaut',
  'superhero', 'supervillain', 'secret agent', 'spy', 'detective',
  'lightsaber', 'magic wand', 'treasure chest', 'pirate ship',

  // sports & playground
  'dodgeball', 'basketball', 'soccer ball', 'trampoline', 'slip n slide',
  'water balloon', 'paintball', 'nerf gun', 'bouncy castle',
  'tetherball', 'four square', 'tag',

  // school stuff
  'cafeteria tray', 'chalkboard', 'lunchbox', 'homework', 'pop quiz',
  'school bus', 'backpack', 'recess', 'field trip',

  // video games / memes they know
  'minecraft creeper', 'pac-man', 'mario mustache', 'pokeball',
  'among us crewmate', 'fortnite dance', 'controller',

  // mildly gross — the good kind of funny
  'stinky sock', 'sweaty gym shirt', 'rubber chicken', 'whoopee cushion',
  'fart cloud', 'burp bubble', 'slime', 'mystery meat', 'moldy sandwich',
  'booger', 'armpit fart', 'dog drool', 'wet willie',
  'stepping in gum', 'slipping on a banana peel', 'brain freeze',

  // funny scenarios (great ones)
  'cat in sunglasses', 'shark wearing a top hat', 'dog on a skateboard',
  'dinosaur eating pizza', 'alien at school', 'robot dancing',
  'monkey driving a car', 'chicken on a motorcycle', 'cow jumping over the moon',
  'dragon with a birthday cake', 'penguin surfing', 'octopus juggling',
  'ninja eating a taco', 'bigfoot taking a selfie', 'trex tying shoes',
  'wizard playing video games', 'astronaut eating spaghetti',

  // actions / moves
  'dabbing', 'backflip', 'cannonball', 'belly flop', 'high five',
  'moonwalk', 'breakdance', 'slam dunk', 'home run', 'touchdown',

  // food fun
  'pizza slice', 'ice cream sundae', 'giant taco', 'cereal bowl',
  'hot sauce', 'gumball machine', 'popcorn', 'cotton candy',

  // random fun objects
  'fidget spinner', 'lava lamp', 'disco ball', 'boombox', 'yo-yo',
  'slingshot', 'magnifying glass', 'remote control', 'treasure map',
  'crystal ball', 'spy camera', 'pogo stick',

  // landmarks / places
  'pyramid', 'eiffel tower', 'statue of liberty', 'mount rushmore',
  'haunted house', 'treehouse', 'castle', 'secret lair',

  // weather / nature goofy
  'tornado of cats', 'pizza rain', 'snowball fight',
];

const ROUND_TIME = 75;        // seconds to draw
const WORD_CHOICE_TIME = 12;  // seconds to pick
const ROUND_END_TIME = 6;     // seconds between rounds
const MIN_PLAYERS = 2;

const GAME = {
  players: {},          // id -> { id, name, score, color, guessedThisRound, isDrawer }
  turnOrder: [],        // ids in draw order
  turnIndex: 0,
  drawerId: null,
  word: null,
  wordChoices: [],
  state: 'waiting',     // 'waiting' | 'choosing' | 'drawing' | 'roundEnd'
  roundEndsAt: 0,
  strokes: [],          // for late joiners this round
  roundScores: {},      // id -> points earned this round
  roundNumber: 0,
};

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#a855f7', '#ec4899',
];
let colorIdx = 0;

function pickThreeWords() {
  const pool = [...WORDS];
  const picks = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picks.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picks;
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

function broadcastState(extra = {}) {
  io.emit('state', {
    state: GAME.state,
    drawerId: GAME.drawerId,
    drawerName: GAME.players[GAME.drawerId]?.name || null,
    wordMask: GAME.word ? maskWord(GAME.word) : null,
    wordLength: GAME.word ? GAME.word.length : null,
    roundEndsAt: GAME.roundEndsAt,
    players: publicPlayerList(),
    roundNumber: GAME.roundNumber,
    ...extra,
  });
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
  GAME.wordChoices = [];
  GAME.roundScores = {};
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
  io.to(GAME.drawerId).emit('chooseWord', { choices: GAME.wordChoices, endsAt: GAME.roundEndsAt });
  broadcastState();

  // auto-pick if drawer doesn't choose in time
  setTimeout(() => {
    if (GAME.state === 'choosing' && GAME.drawerId && !GAME.word) {
      startRound(GAME.wordChoices[0]);
    }
  }, WORD_CHOICE_TIME * 1000 + 200);
}

function startRound(word) {
  GAME.word = word;
  GAME.state = 'drawing';
  GAME.roundEndsAt = Date.now() + ROUND_TIME * 1000;
  // only the drawer knows the real word
  io.to(GAME.drawerId).emit('yourWord', word);
  broadcastState();

  // end the round when timer expires
  const roundToken = GAME.roundNumber;
  setTimeout(() => {
    if (GAME.state === 'drawing' && GAME.roundNumber === roundToken) {
      endRound('time');
    }
  }, ROUND_TIME * 1000 + 200);
}

function endRound(reason) {
  GAME.state = 'roundEnd';
  GAME.roundEndsAt = Date.now() + ROUND_END_TIME * 1000;

  const revealed = GAME.word;
  const scoresThisRound = { ...GAME.roundScores };

  io.emit('roundEnd', {
    word: revealed,
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
  socket.emit('init', {
    id: socket.id,
    state: GAME.state,
    players: publicPlayerList(),
    drawerId: GAME.drawerId,
    wordMask: GAME.word ? maskWord(GAME.word) : null,
    roundEndsAt: GAME.roundEndsAt,
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

  socket.on('chooseWord', (word) => {
    if (socket.id !== GAME.drawerId || GAME.state !== 'choosing') return;
    if (!GAME.wordChoices.includes(word)) return;
    startRound(word);
  });

  socket.on('stroke', (s) => {
    if (socket.id !== GAME.drawerId || GAME.state !== 'drawing') return;
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
    GAME.strokes = [];
    io.emit('clearCanvas');
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
        // score: time-based for guesser, +50 per guesser for drawer
        const msLeft = Math.max(0, GAME.roundEndsAt - Date.now());
        const fraction = msLeft / (ROUND_TIME * 1000); // 0..1
        const points = Math.round(60 + fraction * 90); // 60..150
        player.score += points;
        player.guessedThisRound = true;
        GAME.roundScores[socket.id] = (GAME.roundScores[socket.id] || 0) + points;

        const drawer = GAME.players[GAME.drawerId];
        if (drawer) {
          drawer.score += 50;
          GAME.roundScores[drawer.id] = (GAME.roundScores[drawer.id] || 0) + 50;
        }

        io.emit('chat', {
          system: true,
          good: true,
          text: `✓ ${player.name} guessed the word! +${points}`,
        });
        socket.emit('youGuessed', { word: GAME.word, points });
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
  io.emit('tick', { now: Date.now(), roundEndsAt: GAME.roundEndsAt, state: GAME.state });
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
