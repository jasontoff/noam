// Doodle Duel — client
// Connect to Cloud Run backend when hosted on noam.bot, same-host for local dev.
const BACKEND_URL = window.location.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)
  ? undefined
  : 'https://drawing-game-server-2d6x6hh7aq-uc.a.run.app';
const socket = BACKEND_URL ? io(BACKEND_URL) : io();

let me = { id: null, name: null };
let gameState = 'waiting';
let drawerId = null;
let roundEndsAt = 0;
let pausedAt = null;           // timestamp when server paused the timer, or null
let isTyping = false;          // have we told the server we're currently typing?
let myGuessedThisRound = false;
let isDrawer = () => drawerId === me.id;
const TYPING_PAUSE_THRESHOLD_MS = 15 * 1000;

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
  if (!isDrawer() || gameState !== 'drawing' || pausedAt) return;
  evt.preventDefault();
  drawing = true;
  lastPos = canvasToNorm(evt);
}
function moveStroke(evt) {
  if (!drawing) return;
  if (pausedAt) { endStroke(); return; }
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
  if (isDrawer() && gameState === 'drawing' && !pausedAt) {
    toolbar.classList.remove('disabled');
  } else {
    toolbar.classList.add('disabled');
  }
  if (pausedAt && gameState === 'drawing') {
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
  const msLeft = roundEndsAt - (pausedAt || Date.now());
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
  roundEndsAt = data.roundEndsAt || 0;
  pausedAt = data.pausedAt || null;
  clearCanvas();
  if (data.strokes) data.strokes.forEach(drawSegment);
  renderPlayers(data.players || []);
  updateOverlay();
  updateToolbar();
});

socket.on('state', (s) => {
  gameState = s.state;
  drawerId = s.drawerId;
  pausedAt = s.pausedAt || null;
  // New round? reset local flags.
  if (s.state === 'choosing' || s.state === 'drawing') {
    const mine = (s.players || []).find(p => p.id === me.id);
    myGuessedThisRound = !!(mine && mine.guessed);
  }
  if (s.state !== 'drawing') { isTyping = false; }
  roundEndsAt = s.roundEndsAt || 0;
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
  overlayText.textContent = 'Choose one of these to draw.';
  choicesEl.innerHTML = '';
  data.choices.forEach(word => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = word;
    btn.addEventListener('click', () => {
      socket.emit('chooseWord', word);
      overlay.classList.add('hidden');
      choicesEl.innerHTML = '';
    });
    choicesEl.appendChild(btn);
  });
});

socket.on('yourWord', (word) => {
  window.__myWord = word;
  wordDisplay.textContent = word;
  overlay.classList.add('hidden');
});

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
  pausedAt = null;
  isTyping = false;
  myGuessedThisRound = false;
  overlay.classList.remove('hidden');
  overlayTitle.textContent = `The word was: "${data.word}"`;
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
  roundEndsAt = t.roundEndsAt || roundEndsAt;
  pausedAt = t.pausedAt || null;
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

// Local timer tick — when paused, show the value at the moment the pause
// began (frozen) with a ⏸ prefix.
setInterval(() => {
  if (!roundEndsAt) { timerEl.textContent = '--'; return; }
  const referenceTime = pausedAt || Date.now();
  const left = Math.max(0, Math.round((roundEndsAt - referenceTime) / 1000));
  if (pausedAt) {
    timerEl.textContent = `⏸ ${left}s`;
    timerEl.style.color = '#fde047';
  } else {
    timerEl.textContent = left + 's';
    timerEl.style.color = left <= 10 ? '#fca5a5' : '';
  }
}, 200);
