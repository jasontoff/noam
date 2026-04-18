// Doodle Duel — client
// Connect to Cloud Run backend when hosted on noam.bot, same-host for local dev.
const BACKEND_URL = window.location.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)
  ? undefined
  : 'https://drawing-game-server-2d6x6hh7aq-uc.a.run.app';
const socket = BACKEND_URL ? io(BACKEND_URL) : io();

let me = { id: null, name: null };
let gameState = 'waiting';
let drawerId = null;
// Timer is driven by {msLeft, paused} from the server (clock-independent).
// When not paused we set deadlineAt = Date.now() + msLeft on each update and
// the display just counts down locally. When paused we hold pausedMsLeft.
let deadlineAt = 0;
let pausedMsLeft = null;
let paused = false;
let isTyping = false;
let myGuessedThisRound = false;
let isDrawer = () => drawerId === me.id;
const TYPING_PAUSE_THRESHOLD_MS = 15 * 1000;

function applyTimeInfo(data) {
  if (!data) return;
  paused = !!data.paused;
  if (typeof data.msLeft !== 'number') return;
  if (paused) {
    pausedMsLeft = data.msLeft;
  } else {
    pausedMsLeft = null;
  }
  deadlineAt = Date.now() + data.msLeft;
}

function currentMsLeft() {
  if (paused) return pausedMsLeft || 0;
  return Math.max(0, deadlineAt - Date.now());
}

// === DOM ===
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const choicesEl = document.getElementById('choices');
const playersEl = document.getElementById('players');
const messagesEl = document.getElementById('messages');
const timerEl = document.getElementById('timer');
const wordDisplay = document.getElementById('word-display');
const roundLabel = document.getElementById('round-label');
const toolbar = document.getElementById('toolbar');
const guessForm = document.getElementById('guess-form');
const guessInput = document.getElementById('guess-input');
const loginModal = document.getElementById('login');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const clearBtn = document.getElementById('clear-btn');
const pauseBanner = document.getElementById('pause-banner');
const difficultyBadge = document.getElementById('difficulty-badge');

// === Login ===
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
function doJoin() {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  me.name = name;
  socket.emit('join', name);
  loginModal.classList.add('hidden');
  guessInput.focus();
}

// === Canvas ===
// We use a 1600x1000 backing canvas and map mouse coords to 0..1 normalized
// so every client renders at its own resolution consistently.
let drawing = false;
let lastPos = null;
let currentColor = '#111';
let currentSize = 6;

function canvasToNorm(evt) {
  const rect = canvas.getBoundingClientRect();
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

function drawSegment(stroke) {
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size * (canvas.width / 400);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.x0 * canvas.width, stroke.y0 * canvas.height);
  ctx.lineTo(stroke.x1 * canvas.width, stroke.y1 * canvas.height);
  ctx.stroke();
}

function clearCanvas() {
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
clearCanvas();

function startStroke(evt) {
  if (!isDrawer() || gameState !== 'drawing' || paused) return;
  evt.preventDefault();
  drawing = true;
  lastPos = canvasToNorm(evt);
}
function moveStroke(evt) {
  if (!drawing) return;
  if (paused) { endStroke(); return; }
  evt.preventDefault();
  const p = canvasToNorm(evt);
  const stroke = {
    x0: lastPos.x, y0: lastPos.y, x1: p.x, y1: p.y,
    color: currentColor, size: currentSize,
  };
  drawSegment(stroke);
  socket.emit('stroke', stroke);
  lastPos = p;
}
function endStroke() { drawing = false; lastPos = null; }

canvas.addEventListener('mousedown', startStroke);
canvas.addEventListener('mousemove', moveStroke);
window.addEventListener('mouseup', endStroke);
canvas.addEventListener('mouseleave', endStroke);
canvas.addEventListener('touchstart', startStroke, { passive: false });
canvas.addEventListener('touchmove', moveStroke, { passive: false });
canvas.addEventListener('touchend', endStroke);

// === Toolbar ===
document.querySelectorAll('.swatch').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    currentColor = el.dataset.color;
  });
});
document.querySelector('.swatch[data-color="#111"]').classList.add('active');

document.querySelectorAll('.size-btn').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    currentSize = +el.dataset.size;
  });
});

clearBtn.addEventListener('click', () => {
  if (!isDrawer()) return;
  socket.emit('clearCanvas');
});

function updateToolbar() {
  if (isDrawer() && gameState === 'drawing' && !paused) {
    toolbar.classList.remove('disabled');
  } else {
    toolbar.classList.add('disabled');
  }
  if (paused && gameState === 'drawing') {
    pauseBanner.classList.remove('hidden');
  } else {
    pauseBanner.classList.add('hidden');
  }
}

// === Guess form ===
guessForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = guessInput.value.trim();
  if (!text) return;
  socket.emit('guess', text);
  guessInput.value = '';
  stopTypingIfNeeded();
});

// Track "is the guesser actively typing a guess" so the server can
// pause the timer (only while time is low) and freeze the drawer.
function shouldBeTyping() {
  if (isDrawer()) return false;
  if (gameState !== 'drawing') return false;
  if (myGuessedThisRound) return false;
  if (!guessInput.value.trim()) return false;
  const msLeft = currentMsLeft();
  return msLeft > 0 && msLeft <= TYPING_PAUSE_THRESHOLD_MS;
}
function startTypingIfNeeded() {
  if (isTyping || !shouldBeTyping()) return;
  isTyping = true;
  socket.emit('typingStart');
}
function stopTypingIfNeeded() {
  if (!isTyping) return;
  isTyping = false;
  socket.emit('typingStop');
}
guessInput.addEventListener('input', () => {
  if (shouldBeTyping()) startTypingIfNeeded();
  else stopTypingIfNeeded();
});
guessInput.addEventListener('blur', stopTypingIfNeeded);

// === Socket events ===
socket.on('init', (data) => {
  me.id = data.id;
  drawerId = data.drawerId;
  gameState = data.state;
  applyTimeInfo(data);
  setDifficultyBadge(data.difficulty);
  clearCanvas();
  if (data.strokes) data.strokes.forEach(drawSegment);
  renderPlayers(data.players || []);
  updateOverlay();
  updateToolbar();
});

socket.on('state', (s) => {
  gameState = s.state;
  drawerId = s.drawerId;
  applyTimeInfo(s);
  setDifficultyBadge(s.state === 'drawing' ? s.difficulty : null);
  // New round? reset local flags.
  if (s.state === 'choosing' || s.state === 'drawing') {
    const mine = (s.players || []).find(p => p.id === me.id);
    myGuessedThisRound = !!(mine && mine.guessed);
  }
  if (s.state !== 'drawing') { isTyping = false; }
  renderPlayers(s.players || []);
  if (s.wordMask) {
    wordDisplay.textContent = isDrawer() && window.__myWord ? window.__myWord : s.wordMask;
  } else {
    wordDisplay.textContent = '— — —';
  }
  if (s.roundNumber) {
    roundLabel.textContent = `Round ${s.roundNumber}`;
  }
  updateOverlay();
  updateToolbar();
});

socket.on('chooseWord', (data) => {
  if (!isDrawer()) return;
  overlay.classList.remove('hidden');
  overlayTitle.textContent = "You're drawing! Pick a word:";
  overlayText.textContent = 'Harder words = more points.';
  choicesEl.innerHTML = '';
  data.choices.forEach(choice => {
    // Back-compat: older servers sent raw strings.
    const word = typeof choice === 'string' ? choice : choice.word;
    const difficulty = typeof choice === 'string' ? 'medium' : choice.difficulty;
    const btn = document.createElement('button');
    btn.className = `choice-btn difficulty-${difficulty}`;
    btn.innerHTML = `
      <div class="choice-label">${difficultyLabel(difficulty)}</div>
      <div class="choice-word">${escapeHtml(word)}</div>
    `;
    btn.addEventListener('click', () => {
      socket.emit('chooseWord', { word, difficulty });
      overlay.classList.add('hidden');
      choicesEl.innerHTML = '';
    });
    choicesEl.appendChild(btn);
  });
});

socket.on('yourWord', (data) => {
  // Server sends {word, difficulty}.
  const word = typeof data === 'string' ? data : data.word;
  window.__myWord = word;
  wordDisplay.textContent = word;
  overlay.classList.add('hidden');
});

function difficultyLabel(d) {
  if (d === 'easy') return 'EASY · 1×';
  if (d === 'medium') return 'MEDIUM · 1.3×';
  if (d === 'hard') return 'HARD · 1.7×';
  return '';
}

function setDifficultyBadge(difficulty) {
  difficultyBadge.className = 'difficulty-badge';
  if (!difficulty) {
    difficultyBadge.classList.add('hidden');
    difficultyBadge.textContent = '';
    return;
  }
  difficultyBadge.classList.add(difficulty);
  difficultyBadge.textContent = difficultyLabel(difficulty);
}

socket.on('stroke', drawSegment);
socket.on('clearCanvas', clearCanvas);

socket.on('chat', (msg) => {
  const div = document.createElement('div');
  if (msg.system) {
    div.className = 'sys' + (msg.good ? ' good' : '');
    div.textContent = msg.text;
  } else if (msg.toGuessers) {
    div.className = 'guessers-only';
    div.innerHTML = `<span class="from" style="color:${msg.color || '#fff'}">${escapeHtml(msg.from)}:</span> ${escapeHtml(msg.text)} <span style="color:#93c5fd;font-size:10px;">(guessers only)</span>`;
  } else {
    div.innerHTML = `<span class="from" style="color:${msg.color || '#fff'}">${escapeHtml(msg.from)}:</span> ${escapeHtml(msg.text)}`;
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

socket.on('youGuessed', (data) => {
  window.__myWord = data.word;
  wordDisplay.textContent = data.word;
  myGuessedThisRound = true;
  // Don't hold a pause on behalf of a player who's already solved it.
  isTyping = false;
  guessInput.value = '';
});

socket.on('roundEnd', (data) => {
  window.__myWord = null;
  paused = false;
  pausedMsLeft = null;
  isTyping = false;
  myGuessedThisRound = false;
  setDifficultyBadge(null);
  overlay.classList.remove('hidden');
  const diffTag = data.difficulty ? ` (${difficultyLabel(data.difficulty)})` : '';
  overlayTitle.textContent = `The word was: "${data.word}"${diffTag}`;
  const reasonText = {
    time: 'Time ran out!',
    allGuessed: 'Everyone got it! 🎉',
    drawerLeft: 'The drawer left.',
  }[data.reason] || '';
  overlayText.textContent = reasonText;
  choicesEl.innerHTML = '';
  // show round scoreboard
  const scoreList = document.createElement('div');
  scoreList.style.marginTop = '14px';
  const entries = Object.entries(data.roundScores || {});
  if (entries.length === 0) {
    scoreList.innerHTML = '<p style="color:#f87171">Nobody scored this round.</p>';
  } else {
    entries.sort((a, b) => b[1] - a[1]);
    entries.forEach(([id, pts]) => {
      const t = data.totals.find(p => p.id === id);
      const name = t ? t.name : 'someone';
      const p = document.createElement('p');
      p.innerHTML = `<b>${escapeHtml(name)}</b> +${pts}`;
      scoreList.appendChild(p);
    });
  }
  choicesEl.appendChild(scoreList);
});

socket.on('tick', (t) => {
  applyTimeInfo(t);
  if (typeof t.state === 'string') gameState = t.state;
  // If time dropped into the pause-threshold while we already had text
  // typed, fire typingStart now.
  if (shouldBeTyping()) startTypingIfNeeded();
  else stopTypingIfNeeded();
  updateToolbar();
});

// === Rendering ===
function renderPlayers(players) {
  playersEl.innerHTML = '';
  players.sort((a, b) => b.score - a.score);
  players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'player' + (p.isDrawer ? ' drawer' : '') + (p.guessed ? ' guessed' : '');
    div.innerHTML = `
      <div class="dot" style="background:${p.color}"></div>
      <div class="name">${escapeHtml(p.name)}${p.id === me.id ? ' (you)' : ''}</div>
      ${p.isDrawer ? '<span class="badge">DRAW</span>' : ''}
      <div class="score">${p.score}</div>
    `;
    playersEl.appendChild(div);
  });
}

function updateOverlay() {
  if (gameState === 'waiting') {
    overlay.classList.remove('hidden');
    overlayTitle.textContent = 'Waiting for players…';
    overlayText.textContent = 'Need at least 2 players to start. Open this page on another device or in another tab!';
    choicesEl.innerHTML = '';
  } else if (gameState === 'choosing') {
    if (isDrawer()) {
      // handled by chooseWord event
    } else {
      overlay.classList.remove('hidden');
      const drawerName = getDrawerName();
      overlayTitle.textContent = `${drawerName} is choosing a word…`;
      overlayText.textContent = 'Get ready to guess!';
      choicesEl.innerHTML = '';
    }
  } else if (gameState === 'drawing') {
    overlay.classList.add('hidden');
  } else if (gameState === 'roundEnd') {
    // roundEnd event handles the overlay content; keep it visible
  }
}

function getDrawerName() {
  const els = playersEl.querySelectorAll('.player.drawer .name');
  if (els.length) return els[0].textContent.replace(' (you)', '');
  return 'Someone';
}

function escapeHtml(s) {
  return (s + '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Local timer tick — driven by {msLeft, paused} from the server so the
// displayed time doesn't depend on the client's wall clock matching the
// server's (clock skew used to produce huge bogus countdowns).
setInterval(() => {
  if (!deadlineAt && !paused) { timerEl.textContent = '--'; timerEl.style.color = ''; return; }
  const left = Math.round(currentMsLeft() / 1000);
  // Sanity cap — anything over ~3 minutes means something's gone wrong.
  if (left > 180) { timerEl.textContent = '--'; timerEl.style.color = ''; return; }
  if (paused) {
    timerEl.textContent = `⏸ ${left}s`;
    timerEl.style.color = '#fde047';
  } else {
    timerEl.textContent = left + 's';
    timerEl.style.color = left <= 10 ? '#fca5a5' : '';
  }
}, 200);
