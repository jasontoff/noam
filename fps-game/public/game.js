// ============================================
//  FPS ARENA - Game Client
// ============================================

// Connect to game server - use Cloud Run backend when hosted, localhost when local
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '192.168.1.158'
  ? undefined  // connect to same host (local dev)
  : 'https://fps-game-server-2d6x6hh7aq-uc.a.run.app';
const socket = BACKEND_URL ? io(BACKEND_URL) : io();

// Base path for assets (handles being served from /fps-game/ or /)
// Get the directory portion of the pathname, ensuring trailing slash
const _p = window.location.pathname;
const BASE_PATH = _p.endsWith('/') ? _p : _p.substring(0, _p.lastIndexOf('/') + 1) || '/';
function assetURL(path) { return BASE_PATH + path; }

// Three.js setup
let scene, camera, renderer;
let clock = new THREE.Clock();
const gltfLoader = new THREE.GLTFLoader();

// Kenney character models (a through r = 18 characters)
const CHARACTER_MODELS = [];
for (let i = 0; i < 18; i++) {
  CHARACTER_MODELS.push('abcdefghijklmnopqr'[i]);
}
const loadedModels = {}; // cache loaded models

// Kenney blaster model mapping: weapon type -> GLB file
const BLASTER_MODELS = {
  pistol: 'blaster-a',
  shotgun: 'blaster-n',
  sniper: 'blaster-e',
  minigun: 'blaster-j',
  rocket: 'blaster-h',
};
const loadedBlasters = {}; // cache loaded blaster models

function loadBlasterModel(weaponType, callback) {
  const modelName = BLASTER_MODELS[weaponType];
  if (!modelName) { callback(null); return; }
  if (loadedBlasters[modelName]) {
    callback(loadedBlasters[modelName]);
    return;
  }
  gltfLoader.load(assetURL(`models/blasters/${modelName}.glb`), (gltf) => {
    loadedBlasters[modelName] = gltf;
    callback(gltf);
  });
}

// Player state
let myId = null;
let players = {};
let playerMeshes = {};
let bulletMeshes = {};
let obstacles = [];
let obstacleMeshes = [];

// Cars (only populated on the road map)
const carMeshes = {};
let carsState = {};

// Round timer
let roundEndTime = 0;

// Controls
let moveForward = false, moveBackward = false;
let moveLeft = false, moveRight = false;
let canJump = false, isJumping = false;
let velocity = new THREE.Vector3();
let yaw = 0, pitch = 0;
let isLocked = false;

// Shooting & Weapons
let canShoot = true;
let shootCooldown = 200; // ms between shots
let weapons = {};
let selectedWeapon = 'pistol';
let selectedGun = 'pistol';
let holdingKnife = false;
let mouseDown = false;
let sniperZoomed = false;
const DEFAULT_FOV = 75;
const SNIPER_ZOOM_FOV = 12;
let abilities = {};
let selectedAbility = 'speed';
let abilityActive = false;
let abilityCooldownEnd = 0;
let abilityActiveEnd = 0;

// Character selection
let selectedCharIndex = 0;
const CHAR_LETTERS = 'abcdefghijklmnopqr'.split('');
const charAvatar = document.getElementById('char-avatar');
const charPrevBtn = document.getElementById('char-prev');
const charNextBtn = document.getElementById('char-next');

function updateCharPreview() {
  charAvatar.src = assetURL(`models/characters/previews/character-${CHAR_LETTERS[selectedCharIndex]}.png`);
}

// Load saved character
const savedChar = localStorage.getItem('fpsArenaChar');
if (savedChar) {
  const idx = CHAR_LETTERS.indexOf(savedChar);
  if (idx >= 0) selectedCharIndex = idx;
}
updateCharPreview(); // always set initial avatar

charAvatar.addEventListener('click', (e) => {
  e.stopPropagation();
  selectedCharIndex = (selectedCharIndex + 1) % CHAR_LETTERS.length;
  updateCharPreview();
});
charPrevBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  selectedCharIndex = (selectedCharIndex - 1 + CHAR_LETTERS.length) % CHAR_LETTERS.length;
  updateCharPreview();
});
charNextBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  selectedCharIndex = (selectedCharIndex + 1) % CHAR_LETTERS.length;
  updateCharPreview();
});

// First-person weapon model
let fpWeaponGroup = null;
let fpWeaponSwinging = false;
let fpWeaponSwingTime = 0;

// Player physics
const PLAYER_HEIGHT = 1.6;
const MOVE_SPEED = 15;
const JUMP_FORCE = 8;
const GRAVITY = 20;

// Audio
let audioCtx = null;
let lastFootstepTime = 0;
const FOOTSTEP_INTERVAL = 350; // ms between footsteps

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  switch (type) {
    case 'shoot': {
      // Punchy gunshot: noise burst + low thump
      const bufferSize = audioCtx.sampleRate * 0.1;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.08));
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(3000, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(300, now + 0.1);
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.6, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      noise.connect(noiseFilter).connect(noiseGain).connect(audioCtx.destination);
      noise.start(now);
      noise.stop(now + 0.15);

      // Low thump
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);
      const oscGain = audioCtx.createGain();
      oscGain.gain.setValueAtTime(0.5, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(oscGain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
      break;
    }

    case 'hit': {
      // Meaty impact thud
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
      break;
    }

    case 'kill': {
      // Satisfying kill confirm: rising tone
      [400, 600, 800].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = freq;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, now + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.12);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.12);
      });
      break;
    }

    case 'death': {
      // Low descending tone
      const osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.8);
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.8);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(filter).connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.8);
      break;
    }

    case 'footstep': {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80 + Math.random() * 40, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.06);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
      break;
    }

    case 'jump': {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.12);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
      break;
    }

    case 'explosion': {
      // Big boom: low noise + rumble
      const bufferSize = audioCtx.sampleRate * 0.4;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + 0.4);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      noise.connect(filter).connect(gain).connect(audioCtx.destination);
      noise.start(now);
      noise.stop(now + 0.5);
      break;
    }

    case 'sniper_shot': {
      // Sharp crack
      const bufferSize = audioCtx.sampleRate * 0.15;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.03));
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 2000;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      noise.connect(filter).connect(gain).connect(audioCtx.destination);
      noise.start(now);
      noise.stop(now + 0.2);
      // Echo
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(100, now + 0.05);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
      const g2 = audioCtx.createGain();
      g2.gain.setValueAtTime(0.3, now + 0.05);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(g2).connect(audioCtx.destination);
      osc.start(now + 0.05);
      osc.stop(now + 0.3);
      break;
    }

    case 'minigun': {
      // Quick rattle
      const osc = audioCtx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(80 + Math.random() * 40, now);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
      break;
    }

    case 'knife_slash': {
      // Quick whoosh
      const bufferSize = audioCtx.sampleRate * 0.15;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 3000;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      noise.connect(filter).connect(gain).connect(audioCtx.destination);
      noise.start(now);
      noise.stop(now + 0.15);
      break;
    }

    case 'shotgun_shot': {
      // Big blast
      const bufferSize = audioCtx.sampleRate * 0.2;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.05));
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      noise.connect(gain).connect(audioCtx.destination);
      noise.start(now);
      noise.stop(now + 0.25);
      break;
    }

    case 'respawn': {
      // Ascending power-up chime
      [300, 450, 600, 900].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, now + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.1 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.2);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.2);
      });
      break;
    }
  }
}

// UI elements
const blocker = document.getElementById('blocker');
const startBtn = document.getElementById('startBtn');
const nameInput = document.getElementById('nameInput');
const healthText = document.getElementById('health-text');
const healthFill = document.getElementById('health-fill');
const scoreList = document.getElementById('score-list');
const killfeed = document.getElementById('killfeed');
const deathScreen = document.getElementById('death-screen');
const damageOverlay = document.getElementById('damage-overlay');
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas.getContext('2d');
const pauseOverlay = document.getElementById('pause-overlay');
const weaponPopup = document.getElementById('weapon-popup');
const weaponPopupText = document.getElementById('weapon-popup-text');
let weaponPopupTimer = null;

function showWeaponPopup(name) {
  weaponPopupText.textContent = name;
  weaponPopup.style.display = 'block';
  weaponPopup.style.opacity = '1';
  if (weaponPopupTimer) clearTimeout(weaponPopupTimer);
  weaponPopupTimer = setTimeout(() => {
    weaponPopup.style.display = 'none';
  }, 1500);
}
const weaponHud = document.getElementById('weapon-hud');

const abilityHud = document.getElementById('ability-hud');

function updateAbilityHUD() {
  const now = Date.now();
  if (abilityActive) {
    const remaining = Math.max(0, Math.ceil((abilityActiveEnd - now) / 1000));
    const aName = (abilities[selectedAbility]?.name || selectedAbility).toUpperCase();
    abilityHud.innerHTML = `<span style="color:#0f0;font-weight:bold">[Q] ${aName} ACTIVE (${remaining}s)</span>`;
  } else if (now < abilityCooldownEnd) {
    const remaining = Math.max(0, Math.ceil((abilityCooldownEnd - now) / 1000));
    const aName = (abilities[selectedAbility]?.name || selectedAbility).toUpperCase();
    abilityHud.innerHTML = `<span style="color:#888">[Q] ${aName} (${remaining}s cooldown)</span>`;
  } else {
    const aName = (abilities[selectedAbility]?.name || selectedAbility).toUpperCase();
    abilityHud.innerHTML = `<span style="color:#0ff">[Q] ${aName} — READY</span>`;
  }
}

const GUN_NAMES = { pistol: 'PISTOL', shotgun: 'SHOTGUN', sniper: 'SNIPER', minigun: 'MINIGUN', rocket: 'ROCKET' };
const GUN_KEYS = { pistol: '1', shotgun: '2', sniper: '3', minigun: '4', rocket: '5' };

function switchToGun(gunId) {
  holdingKnife = false;
  selectedGun = gunId;
  selectedWeapon = gunId;
  if (gunId !== 'sniper') setSniperZoom(false);
  socket.emit('selectWeapon', gunId);
  updateWeaponHUD();
  updateFPWeapon();
  showWeaponPopup(`${GUN_KEYS[gunId]} - ${GUN_NAMES[gunId]}`);
}

function updateWeaponHUD() {
  const w = weapons[selectedWeapon];
  if (!w) {
    weaponHud.textContent = selectedWeapon.toUpperCase();
    return;
  }
  const rpmLabel = w.fireRate <= 100 ? 'V.FAST' : w.fireRate <= 250 ? 'FAST' : w.fireRate <= 900 ? 'SLOW' : 'V.SLOW';
  weaponHud.innerHTML = `<span style="color:#0f0;font-size:18px;font-weight:bold">${w.name.toUpperCase()}</span> <span style="color:#888">| DMG:${w.damage} | ${rpmLabel}</span>`;
}

// ============================================
//  INITIALIZATION
// ============================================

// Container for all map-specific meshes (ground, decorations, obstacles).
// Replaced wholesale on map change by applyMapTheme().
let mapRoot = null;
let mapInfo = null;
let hemiLight = null;

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, PLAYER_HEIGHT, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);

  // Lighting (constant across maps; hemi colours are tuned per-theme)
  const ambient = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambient);
  hemiLight = new THREE.HemisphereLight(0xb6e3ff, 0x6dc06b, 0.6);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff4c4, 1.0);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 120;
  dirLight.shadow.camera.left = -50;
  dirLight.shadow.camera.right = 50;
  dirLight.shadow.camera.top = 50;
  dirLight.shadow.camera.bottom = -50;
  scene.add(dirLight);

  // Default sky/fog before init data arrives — overwritten by applyMapTheme()
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0xc8e7ff, 60, 140);

  setupControls();
  createFPWeapon();
  window.addEventListener('resize', onResize);
}

// Recursively dispose geometries & materials on a Three.js subtree
function disposeTree(obj) {
  obj.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) m.dispose();
    }
  });
}

// Apply a map's theme: rebuild ground, sky, fog, hemi tint, decorations.
// `obstacleData` is the obstacle list from the server (added inside mapRoot).
function loadMap(info, obstacleData) {
  mapInfo = info;

  // Tear down previous map (ground + decorations + obstacles)
  if (mapRoot) {
    scene.remove(mapRoot);
    disposeTree(mapRoot);
  }
  mapRoot = new THREE.Group();
  scene.add(mapRoot);
  obstacleMeshes = [];

  // Sky + fog + hemisphere light
  scene.background = new THREE.Color(info.sky);
  scene.fog = new THREE.Fog(info.fog.color, info.fog.near, info.fog.far);
  if (hemiLight) {
    hemiLight.color.setHex(info.hemiSky);
    hemiLight.groundColor.setHex(info.hemiGround);
  }

  // Ground plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100, 1, 1),
    new THREE.MeshStandardMaterial({ color: info.ground.color, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  mapRoot.add(ground);

  // Theme-specific extras
  if (info.theme === 'playground') addPlaygroundExtras();
  else if (info.theme === 'boat')   addBoatExtras();
  else if (info.theme === 'road')   addRoadExtras();

  // Build obstacle meshes
  createObstacles(obstacleData);
}

function addPlaygroundExtras() {
  // Quadrant pastel tints
  const tints = [
    { x: -25, z: -25, color: 0xffd1dc },
    { x:  25, z: -25, color: 0xfff4a3 },
    { x: -25, z:  25, color: 0xb6e3ff },
    { x:  25, z:  25, color: 0xd9b6ff },
  ];
  for (const t of tints) {
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 48),
      new THREE.MeshStandardMaterial({ color: t.color, roughness: 1, transparent: true, opacity: 0.55 })
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(t.x, 0.02, t.z);
    patch.receiveShadow = true;
    mapRoot.add(patch);
  }
  // Bright grid overlay
  const grid = new THREE.GridHelper(100, 50, 0xffffff, 0xeeeeee);
  grid.position.y = 0.03;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  mapRoot.add(grid);
  // Clouds, balloons, flag, party hats — see addPlaygroundDecorations
  addPlaygroundDecorations(mapRoot);
}

function addBoatExtras() {
  // Wide ocean plane visible past the railings
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x1f5d8a, roughness: 0.4, metalness: 0.4 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.2;
  mapRoot.add(ocean);

  // Small wave ripple meshes for ambience (a few rings)
  for (let i = 0; i < 16; i++) {
    const r = 60 + i * 12;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r, r + 0.4, 64),
      new THREE.MeshBasicMaterial({ color: 0x6db8d8, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.18;
    mapRoot.add(ring);
  }

  // A faint distant sun ball low on the horizon
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(8, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xffe4a8 })
  );
  sun.position.set(140, 20, -180);
  mapRoot.add(sun);
}

function addRoadExtras() {
  // Sidewalks already exist as obstacles; add ambient props.
  // Distant city silhouette: a few large dark boxes far behind the walls.
  for (let i = -1; i <= 1; i++) {
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(20, 40 + Math.random() * 30, 8),
      new THREE.MeshStandardMaterial({ color: 0x1c1c2a, emissive: 0x442266, emissiveIntensity: 0.25 })
    );
    tower.position.set(i * 35, 15, -90);
    mapRoot.add(tower);
    const tower2 = new THREE.Mesh(
      new THREE.BoxGeometry(20, 35 + Math.random() * 25, 8),
      new THREE.MeshStandardMaterial({ color: 0x1c1c2a, emissive: 0x665533, emissiveIntensity: 0.2 })
    );
    tower2.position.set(i * 35, 15, 90);
    mapRoot.add(tower2);
  }

  // Twinkly emissive specks in the sky for a sunset feel
  const dustGeo = new THREE.SphereGeometry(0.5, 6, 6);
  const dustMat = new THREE.MeshBasicMaterial({ color: 0xfff5d0 });
  for (let i = 0; i < 30; i++) {
    const d = new THREE.Mesh(dustGeo, dustMat);
    d.position.set(
      (Math.random() - 0.5) * 180,
      30 + Math.random() * 40,
      (Math.random() - 0.5) * 180
    );
    mapRoot.add(d);
  }
}

// Purely decorative playground props (no collision). Adds to mapRoot.
function addPlaygroundDecorations() {
  const parent = mapRoot;
  // Fluffy clouds scattered above the map
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cloudSpots = [
    [-30,  35, -30], [ 30,  38,  30], [  0,  40,  20],
    [-35,  36,  10], [ 35,  37, -10], [-15,  42, -40],
    [ 20,  39,  40],
  ];
  cloudSpots.forEach(([cx, cy, cz]) => {
    const cloud = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = 2 + Math.random() * 1.5;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), cloudMat);
      puff.position.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 4);
      cloud.add(puff);
    }
    cloud.position.set(cx, cy, cz);
    parent.add(cloud);
  });

  // Balloon clusters tethered above each quadrant
  const balloonColors = [0xff5577, 0xffd244, 0x55c2ff, 0xb16bff, 0x77e07a, 0xff944d];
  const balloonAnchors = [
    { x: -25, z: -25, h: 32 }, // NW (above tall tower)
    { x:  25, z: -25, h: 12 }, // NE
    { x: -25, z:  25, h: 12 }, // SW
    { x:  25, z:  25, h: 14 }, // SE
  ];
  balloonAnchors.forEach((a) => {
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const r = 1.5;
      const bx = a.x + Math.cos(angle) * r;
      const bz = a.z + Math.sin(angle) * r;
      const by = a.h + Math.random() * 1.5;
      const balloonMat = new THREE.MeshStandardMaterial({
        color: balloonColors[(i + a.x + a.z) % balloonColors.length],
        roughness: 0.4,
        emissive: balloonColors[(i + a.x + a.z) % balloonColors.length],
        emissiveIntensity: 0.15,
      });
      const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), balloonMat);
      balloon.scale.y = 1.3;
      balloon.position.set(bx, by, bz);
      parent.add(balloon);
      // String down to anchor
      const stringMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
      const stringGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(bx, by - 0.7, bz),
        new THREE.Vector3(a.x, a.h - 1.5, a.z),
      ]);
      parent.add(new THREE.Line(stringGeo, stringMat));
    }
  });

  // Flag pole + flag on top of the tall NW tower
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4, metalness: 0.7 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 8), poleMat);
  pole.position.set(-25, 30.5, -25);
  parent.add(pole);
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xff3366, side: THREE.DoubleSide, roughness: 0.6 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), flagMat);
  flag.position.set(-23.9, 32.2, -25);
  parent.add(flag);

  // Party-hat cones on top of each NE short tower (purely decorative)
  const hatColors = [0xff5577, 0x55c2ff, 0xffd244, 0xb16bff, 0x77e07a, 0xff944d, 0xff5577, 0x55c2ff, 0xffd244];
  const neGrid = [-12, -25, -38];
  let hatIdx = 0;
  for (const tx of [12, 25, 38]) {
    for (const tz of neGrid) {
      const hatMat = new THREE.MeshStandardMaterial({ color: hatColors[hatIdx % hatColors.length], roughness: 0.6 });
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 12), hatMat);
      // Determine top of the tower (heights vary 1.0/1.2/1.4)
      const top = (Math.abs(tx) === 25 || Math.abs(tz) === 25)
        ? (tx === 25 && tz === -25 ? 1.2 : 1.4)
        : 1.0;
      hat.position.set(tx, top + 0.7, tz);
      parent.add(hat);
      hatIdx++;
    }
  }
}

// ============================================
//  FIRST-PERSON WEAPON MODEL
// ============================================

function createFPWeapon() {
  fpWeaponGroup = new THREE.Group();
  camera.add(fpWeaponGroup);
  scene.add(camera); // needed for camera children to render
  updateFPWeapon();
}

function updateFPWeapon() {
  if (!fpWeaponGroup) return;
  // Clear old model
  while (fpWeaponGroup.children.length) fpWeaponGroup.remove(fpWeaponGroup.children[0]);

  if (holdingKnife) {
    // Knife blade
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.25, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 })
    );
    blade.position.set(0, 0.05, 0);
    fpWeaponGroup.add(blade);

    // Handle
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.1, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x4a2a0a, roughness: 0.8 })
    );
    handle.position.set(0, -0.1, 0);
    fpWeaponGroup.add(handle);

    // Guard
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.015, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 })
    );
    guard.position.set(0, -0.05, 0);
    fpWeaponGroup.add(guard);

    fpWeaponGroup.position.set(0.3, -0.25, -0.4);
    fpWeaponGroup.rotation.set(0, 0, -0.3);
  } else if (selectedGun === 'pistol') {
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.8, roughness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.2 });
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.22), metalMat);
    slide.position.set(0, 0.01, -0.06); fpWeaponGroup.add(slide);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.03, 0.15), darkMat);
    frame.position.set(0, -0.015, -0.02); fpWeaponGroup.add(frame);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.1, 0.04), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 }));
    grip.position.set(0, -0.07, 0.04); grip.rotation.x = 0.15; fpWeaponGroup.add(grip);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.03, 8), darkMat);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.01, -0.18); fpWeaponGroup.add(muzzle);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.012, 0.005), new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.5 }));
    sight.position.set(0, 0.035, -0.14); fpWeaponGroup.add(sight);
    fpWeaponGroup.position.set(0.22, -0.18, -0.32);

  } else if (selectedGun === 'shotgun') {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3518, roughness: 0.85 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.85, roughness: 0.25 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.2 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.45, 8), metalMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.015, -0.15); fpWeaponGroup.add(barrel);
    const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.35, 8), darkMat);
    mag.rotation.x = Math.PI / 2; mag.position.set(0, -0.01, -0.1); fpWeaponGroup.add(mag);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.08), woodMat);
    pump.position.set(0, -0.005, -0.08); fpWeaponGroup.add(pump);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.1), metalMat);
    receiver.position.set(0, 0.005, 0.08); fpWeaponGroup.add(receiver);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, 0.18), woodMat);
    stock.position.set(0, -0.01, 0.2); fpWeaponGroup.add(stock);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.03), woodMat);
    grip.position.set(0, -0.045, 0.1); grip.rotation.x = 0.25; fpWeaponGroup.add(grip);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.02, 8), darkMat);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.015, -0.38); fpWeaponGroup.add(muzzle);
    fpWeaponGroup.position.set(0.2, -0.2, -0.3);

  } else if (selectedGun === 'sniper') {
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, metalness: 0.8, roughness: 0.25 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, metalness: 0.9, roughness: 0.2 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x3a3a5a, metalness: 0.7, roughness: 0.3 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.6, 8), gunMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.2); fpWeaponGroup.add(barrel);
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.04, 8), darkMat);
    muzzleBrake.rotation.x = Math.PI / 2; muzzleBrake.position.set(0, 0.01, -0.52); fpWeaponGroup.add(muzzleBrake);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, 0.18), gunMat);
    body.position.set(0, 0.005, 0.08); fpWeaponGroup.add(body);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 8), darkMat);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.055, 0); fpWeaponGroup.add(scope);
    const lensFront = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.008, 8),
      new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x1144aa, emissiveIntensity: 0.3, metalness: 0.9 }));
    lensFront.rotation.x = Math.PI / 2; lensFront.position.set(0, 0.055, -0.07); fpWeaponGroup.add(lensFront);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.04, 0.2), accentMat);
    stock.position.set(0, -0.005, 0.22); fpWeaponGroup.add(stock);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.04), gunMat);
    mag.position.set(0, -0.04, 0.06); fpWeaponGroup.add(mag);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.03), accentMat);
    grip.position.set(0, -0.04, 0.12); grip.rotation.x = 0.2; fpWeaponGroup.add(grip);
    fpWeaponGroup.position.set(0.2, -0.18, -0.3);

  } else if (selectedGun === 'minigun') {
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.85, roughness: 0.2 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.9, roughness: 0.15 });
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 6), metalMat);
      b.rotation.x = Math.PI / 2; b.position.set(Math.cos(angle) * 0.025, Math.sin(angle) * 0.025, -0.12); fpWeaponGroup.add(b);
    }
    const frontClamp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12), darkMat);
    frontClamp.rotation.x = Math.PI / 2; frontClamp.position.set(0, 0, -0.25); fpWeaponGroup.add(frontClamp);
    const rearClamp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12), darkMat);
    rearClamp.rotation.x = Math.PI / 2; rearClamp.position.set(0, 0, -0.05); fpWeaponGroup.add(rearClamp);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x5a5a5a, metalness: 0.8, roughness: 0.3 }));
    motor.rotation.x = Math.PI / 2; motor.position.set(0, 0, 0.06); fpWeaponGroup.add(motor);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.08), darkMat);
    rear.position.set(0, 0, 0.14); fpWeaponGroup.add(rear);
    const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.8 }));
    ammoBox.position.set(0.04, -0.04, 0.08); fpWeaponGroup.add(ammoBox);
    const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }));
    rearGrip.position.set(0, -0.04, 0.16); rearGrip.rotation.x = 0.3; fpWeaponGroup.add(rearGrip);
    fpWeaponGroup.position.set(0.18, -0.18, -0.28);

  } else if (selectedGun === 'rocket') {
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, metalness: 0.4, roughness: 0.6 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.8, roughness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.7, roughness: 0.4 });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 12), tubeMat);
    tube.rotation.x = Math.PI / 2; tube.position.set(0, 0, -0.08); fpWeaponGroup.add(tube);
    const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.03, 12), metalMat);
    flare.rotation.x = Math.PI / 2; flare.position.set(0, 0, -0.34); fpWeaponGroup.add(flare);
    const sightPost = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.04, 0.008), metalMat);
    sightPost.position.set(0, 0.055, -0.15); fpWeaponGroup.add(sightPost);
    const gripHousing = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.06), darkMat);
    gripHousing.position.set(0, -0.035, 0.02); fpWeaponGroup.add(gripHousing);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), darkMat);
    grip.position.set(0, -0.065, 0.03); grip.rotation.x = 0.2; fpWeaponGroup.add(grip);
    for (let i = 0; i < 2; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.008, 12),
        new THREE.MeshStandardMaterial({ color: 0xaa8800, roughness: 0.7 }));
      band.rotation.x = Math.PI / 2; band.position.set(0, 0, -0.2 + i * 0.25); fpWeaponGroup.add(band);
    }
    fpWeaponGroup.position.set(0.2, -0.15, -0.25);

  } else {
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 }));
    barrel.position.set(0, 0, -0.1); fpWeaponGroup.add(barrel);
    fpWeaponGroup.position.set(0.25, -0.2, -0.35);
  }
}


// ============================================
//  CONTROLS
// ============================================

function setupControls() {
  // Weapon selection buttons
  document.querySelectorAll('[data-weapon]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('[data-weapon]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedGun = btn.dataset.weapon;
      if (!holdingKnife) selectedWeapon = selectedGun;
      updateWeaponHUD();
      updateFPWeapon();
    });
  });

  // Load saved name
  const savedName = localStorage.getItem('fpsArenaName');
  if (savedName) nameInput.value = savedName;

  // Ability selection buttons
  document.querySelectorAll('[data-ability]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('[data-ability]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAbility = btn.dataset.ability;
      socket.emit('selectAbility', selectedAbility);
      updateAbilityHUD();
    });
  });

  startBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || 'Player';
    localStorage.setItem('fpsArenaName', name);
    localStorage.setItem('fpsArenaChar', CHAR_LETTERS[selectedCharIndex]);
    socket.emit('setName', name);
    socket.emit('selectCharacter', CHAR_LETTERS[selectedCharIndex]);
    socket.emit('selectWeapon', selectedGun);
    socket.emit('selectAbility', selectedAbility);
    selectedWeapon = selectedGun;
    holdingKnife = false;
    updateFPWeapon();
    if (!audioCtx) initAudio();
    document.body.requestPointerLock();
  });

  let hasJoined = false;

  document.addEventListener('pointerlockchange', () => {
    isLocked = document.pointerLockElement === document.body;
    if (isLocked) {
      hasJoined = true;
      blocker.style.display = 'none';
      socket.emit('setPaused', false);
    } else {
      blocker.style.display = 'flex';
      mouseDown = false;
      setSniperZoom(false);
      if (hasJoined) socket.emit('setPaused', true);
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isLocked) return;
    yaw -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
  });

  document.addEventListener('mousedown', (e) => {
    if (!isLocked) return;
    if (e.button === 0) {
      mouseDown = true;
      shoot();
    } else if (e.button === 2 && selectedWeapon === 'sniper' && !holdingKnife) {
      setSniperZoom(true);
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
    else if (e.button === 2) setSniperZoom(false);
  });

  document.addEventListener('contextmenu', (e) => {
    if (isLocked) e.preventDefault();
  });

  document.addEventListener('wheel', (e) => {
    if (!isLocked) return;
    holdingKnife = !holdingKnife;
    selectedWeapon = holdingKnife ? 'knife' : selectedGun;
    if (holdingKnife || selectedGun !== 'sniper') setSniperZoom(false);
    socket.emit('switchWeapon', holdingKnife ? 'knife' : 'gun');
    updateWeaponHUD();
    updateFPWeapon();
    showWeaponPopup(holdingKnife ? '6 - KNIFE' : `${GUN_KEYS[selectedGun]} - ${GUN_NAMES[selectedGun]}`);
  });

  document.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'KeyW': moveForward = true; break;
      case 'KeyS': moveBackward = true; break;
      case 'KeyA': moveLeft = true; break;
      case 'KeyD': moveRight = true; break;
      case 'Space':
        if (canJump) {
          velocity.y = JUMP_FORCE;
          canJump = false;
          isJumping = true;
          playSound('jump');
        }
        break;
      case 'KeyQ':
        if (Date.now() >= abilityCooldownEnd) {
          socket.emit('useAbility');
        }
        break;
      case 'Digit1': switchToGun('pistol'); break;
      case 'Digit2': switchToGun('shotgun'); break;
      case 'Digit3': switchToGun('sniper'); break;
      case 'Digit4': switchToGun('minigun'); break;
      case 'Digit5': switchToGun('rocket'); break;
      case 'Digit6':
        holdingKnife = true;
        selectedWeapon = 'knife';
        setSniperZoom(false);
        socket.emit('switchWeapon', 'knife');
        updateWeaponHUD();
        updateFPWeapon();
        showWeaponPopup('6 - KNIFE');
        break;
    }
  });

  document.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': moveForward = false; break;
      case 'KeyS': moveBackward = false; break;
      case 'KeyA': moveLeft = false; break;
      case 'KeyD': moveRight = false; break;
    }
  });
}

// ============================================
//  SHOOTING
// ============================================

function setSniperZoom(on) {
  if (on === sniperZoomed) return;
  sniperZoomed = on;
  camera.fov = on ? SNIPER_ZOOM_FOV : DEFAULT_FOV;
  camera.updateProjectionMatrix();
  if (fpWeaponGroup) fpWeaponGroup.visible = !on;
}

function shoot() {
  if (!canShoot) return;
  const me = players[myId];
  if (!me || !me.alive) return;

  const weapon = weapons[selectedWeapon] || weapons.pistol;
  const cooldown = weapon.fireRate || 400;
  canShoot = false;
  setTimeout(() => {
    canShoot = true;
    // Auto-fire for minigun while holding mouse button
    if (mouseDown && isLocked && selectedWeapon === 'minigun' && !holdingKnife) {
      shoot();
    }
  }, cooldown);

  // Get camera direction
  const dir = new THREE.Vector3(0, 0, -1);
  dir.applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  dir.normalize();

  if (holdingKnife) {
    // Melee attack — knife slash
    playSound('knife_slash');
    fpWeaponSwinging = true;
    fpWeaponSwingTime = 0;

    socket.emit('melee', {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      dx: -Math.sin(yaw),
      dz: -Math.cos(yaw),
    });
  } else {
    // Gun shooting
    const soundMap = { shotgun: 'shotgun_shot', sniper: 'sniper_shot', minigun: 'minigun', rocket: 'explosion' };
    playSound(soundMap[selectedWeapon] || 'shoot');

    // (No PointLight muzzle flash — changing scene light count forces
    //  Three.js to recompile every material every shot, which is brutal
    //  on minigun auto-fire. The bullet trails + sound cover the feel.)

    socket.emit('shoot', {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      dx: dir.x,
      dy: dir.y,
      dz: dir.z,
    });
  }
}

// ============================================
//  OBSTACLE CREATION
// ============================================

function createObstacles(obstacleData) {
  obstacles = obstacleData;

  // Bright playground-themed material per obstacle theme
  const themePalette = {
    'wall':         { color: 0xffe1c4, roughness: 0.85, metalness: 0.05 },
    'tower-tall':   { color: 0xff3d7f, roughness: 0.55, metalness: 0.1, emissive: 0x331020, emissiveIntensity: 0.6 },
    'tower-short': null, // colored by index below
    'spiral-step': null,
    'stair-climb': null,
    'platform':     { color: 0x4ec0ff, roughness: 0.4, metalness: 0.2 },
    'bridge':       { color: 0xffaf3a, roughness: 0.5, metalness: 0.2 },
    'wall-cover':   { color: 0x9a5cff, roughness: 0.6, metalness: 0.1 },
    'pillar-tall':  { color: 0xff5b4a, roughness: 0.5, metalness: 0.2 },
    'pillar-mid':   { color: 0x4ed16b, roughness: 0.5, metalness: 0.2 },
    'pillar-short': { color: 0xffe14d, roughness: 0.5, metalness: 0.2 },
    'arch':         { color: 0xff67e1, roughness: 0.4, metalness: 0.3, emissive: 0x440033, emissiveIntensity: 0.5 },
    'ladder-rung':  { color: 0xfff7d4, roughness: 0.6, metalness: 0.05 },
    'launch-pad':   { color: 0xff5b1a, roughness: 0.3, metalness: 0.4, emissive: 0xff3300, emissiveIntensity: 0.9 },
    'sky-platform': { color: 0xb6e3ff, roughness: 0.4, metalness: 0.3, emissive: 0x224466, emissiveIntensity: 0.4 },
    // Boat
    'railing':          { color: 0x6a3f1f, roughness: 0.85, metalness: 0.05 },
    'mast':             { color: 0x4a2a14, roughness: 0.9,  metalness: 0.05 },
    'crow-nest':        { color: 0x8a5530, roughness: 0.7,  metalness: 0.1  },
    'cabin':            { color: 0x7a4a25, roughness: 0.8,  metalness: 0.05 },
    'cabin-roof-edge':  { color: 0x5a341d, roughness: 0.85, metalness: 0.05 },
    'crate':            { color: 0xa8743b, roughness: 0.9,  metalness: 0.0  },
    'barrel':           { color: 0x6e3f1d, roughness: 0.7,  metalness: 0.2  },
    // Road
    'sidewalk':  { color: 0x9a9aa8, roughness: 0.95, metalness: 0.0 },
    'barrier':   { color: 0xc8c8d0, roughness: 0.85, metalness: 0.05 },
    'lane-mark': { color: 0xffffaa, roughness: 0.6,  metalness: 0.0, emissive: 0xffff66, emissiveIntensity: 0.4 },
    'building':  { color: 0x33334a, roughness: 0.9,  metalness: 0.1, emissive: 0x442266, emissiveIntensity: 0.3 },
    'lamp':      { color: 0x8a8a96, roughness: 0.4,  metalness: 0.6 },
    'wreck':     { color: 0x5a3a3a, roughness: 0.85, metalness: 0.4 },
    'pillar':    { color: 0x4a4a55, roughness: 0.85, metalness: 0.1 },
  };
  const cycleShortTower = [0xff5b4a, 0x4ed16b, 0xffe14d, 0x4ec0ff, 0xff67e1, 0x9a5cff, 0xffaf3a, 0x4ed16b, 0xff5b4a];
  const cycleStair      = [0xffe14d, 0x4ec0ff]; // alternating yellow / blue
  const cycleSpiral     = [0xff5b4a, 0xffe14d, 0x4ed16b, 0x4ec0ff, 0x9a5cff, 0xff67e1]; // rainbow

  let shortIdx = 0, stairIdx = 0, spiralIdx = 0;

  obstacleData.forEach((obs, i) => {
    const geo = new THREE.BoxGeometry(obs.w, obs.h, obs.d);

    let matSpec;
    const theme = obs.theme;
    if (theme === 'tower-short') {
      matSpec = { color: cycleShortTower[shortIdx++ % cycleShortTower.length], roughness: 0.5, metalness: 0.2 };
    } else if (theme === 'stair-climb') {
      matSpec = { color: cycleStair[stairIdx++ % cycleStair.length], roughness: 0.55, metalness: 0.15 };
    } else if (theme === 'spiral-step') {
      matSpec = { color: cycleSpiral[spiralIdx++ % cycleSpiral.length], roughness: 0.55, metalness: 0.15 };
    } else if (themePalette[theme]) {
      matSpec = themePalette[theme];
    } else {
      // Fallback for any untagged obstacles
      matSpec = { color: 0xb0b0c0, roughness: 0.7, metalness: 0.1 };
    }

    const mat = new THREE.MeshStandardMaterial(matSpec);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(obs.x, obs.y, obs.z);
    // Only big obstacles cast shadows — the spiral steps, stair-climbs, and
    // small cover would otherwise add ~50 shadow draws per frame for very
    // little visual gain.
    const big = obs.h >= 4 || obs.w >= 5 || obs.d >= 5;
    mesh.castShadow = big;
    mesh.receiveShadow = true;
    (mapRoot || scene).add(mesh);
    obstacleMeshes.push(mesh);
  });
}

// Build (or update) a car mesh from a server car snapshot.
// Cars are colourful boxes with a darker top "cabin" and 4 wheel boxes.
function ensureCarMesh(car) {
  let group = carMeshes[car.id];
  if (!group) {
    group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: car.color || 0xff4040, roughness: 0.5, metalness: 0.4,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(car.w, car.h, car.d), bodyMat);
    group.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(car.w * 0.85, car.h * 0.55, car.d * 0.55),
      new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.3, metalness: 0.6 })
    );
    cabin.position.set(0, car.h * 0.55, -car.d * 0.05);
    group.add(cabin);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    for (const wx of [-car.w / 2, car.w / 2]) {
      for (const wz of [-car.d / 2 + 0.6, car.d / 2 - 0.6]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12), wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, -car.h / 2, wz);
        group.add(wheel);
      }
    }
    // Headlights — emissive boxes on the front
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
    for (const dx of [-car.w / 2 + 0.3, car.w / 2 - 0.3]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), lightMat);
      lamp.position.set(dx, 0, -car.d / 2 - 0.05);
      group.add(lamp);
    }
    group.userData.dz = car.dz;
    if (mapRoot) mapRoot.add(group);
    carMeshes[car.id] = group;
  }
  group.position.set(car.x, car.y, car.z);
  // Cars driving the other way are flipped 180° around y
  group.rotation.y = car.dz < 0 ? Math.PI : 0;
  return group;
}

// ============================================
//  PLAYER MESHES
// ============================================

function updatePlayerWeaponModel(group, weaponType) {
  const holder = group.weaponHolder;
  if (!holder) return;
  while (holder.children.length) holder.remove(holder.children[0]);

  const metalMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.2 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3518, roughness: 0.85 });

  switch (weaponType) {
    case 'pistol': {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.25), metalMat);
      holder.add(slide);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), darkMat);
      grip.position.set(0, -0.08, 0.06); grip.rotation.x = 0.15; holder.add(grip);
      break;
    }
    case 'shotgun': {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), metalMat);
      barrel.rotation.x = Math.PI / 2; holder.add(barrel);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.1), woodMat);
      pump.position.set(0, -0.02, -0.08); holder.add(pump);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.2), woodMat);
      stock.position.set(0, -0.01, 0.25); holder.add(stock);
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.07, 0.12), metalMat);
      receiver.position.set(0, 0, 0.1); holder.add(receiver);
      break;
    }
    case 'sniper': {
      const sniperMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, metalness: 0.8, roughness: 0.25 });
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.7, 6), sniperMat);
      barrel.rotation.x = Math.PI / 2; holder.add(barrel);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), sniperMat);
      body.position.set(0, 0, 0.12); holder.add(body);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.15, 6), darkMat);
      scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.05, 0.05); holder.add(scope);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.01, 6),
        new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x1144aa, emissiveIntensity: 0.4 }));
      lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.05, -0.025); holder.add(lens);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.22), sniperMat);
      stock.position.set(0, -0.005, 0.28); holder.add(stock);
      break;
    }
    case 'minigun': {
      const mgMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.85, roughness: 0.2 });
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 4), mgMat);
        b.rotation.x = Math.PI / 2; b.position.set(Math.cos(angle) * 0.035, Math.sin(angle) * 0.035, 0); holder.add(b);
      }
      const frontClamp = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 8), darkMat);
      frontClamp.rotation.x = Math.PI / 2; frontClamp.position.set(0, 0, -0.18); holder.add(frontClamp);
      const rearClamp = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 8), darkMat);
      rearClamp.rotation.x = Math.PI / 2; rearClamp.position.set(0, 0, 0.05); holder.add(rearClamp);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), mgMat);
      motor.rotation.x = Math.PI / 2; motor.position.set(0, 0, 0.14); holder.add(motor);
      const ammo = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.07),
        new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.8 }));
      ammo.position.set(0.05, -0.05, 0.1); holder.add(ammo);
      break;
    }
    case 'rocket': {
      const tubeMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, metalness: 0.4, roughness: 0.6 });
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8), tubeMat);
      tube.rotation.x = Math.PI / 2; holder.add(tube);
      const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.03, 8), metalMat);
      flare.rotation.x = Math.PI / 2; flare.position.set(0, 0, -0.28); holder.add(flare);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.05, 0.01), metalMat);
      sight.position.set(0, 0.065, -0.1); holder.add(sight);
      const gripH = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.07), darkMat);
      gripH.position.set(0, -0.045, 0.05); holder.add(gripH);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.01, 8),
        new THREE.MeshStandardMaterial({ color: 0xaa8800, roughness: 0.7 }));
      band.rotation.x = Math.PI / 2; band.position.set(0, 0, -0.15); holder.add(band);
      break;
    }
    case 'knife': {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.15 }));
      holder.add(blade);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.035), woodMat);
      handle.position.set(0, -0.18, 0); holder.add(handle);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.04), metalMat);
      guard.position.set(0, -0.12, 0); holder.add(guard);
      break;
    }
    default: {
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), metalMat);
      holder.add(gun);
    }
  }
}

function createPlayerMesh(player) {
  const group = new THREE.Group();

  // Use player's chosen character, fall back to random based on id
  let charLetter = player.character;
  if (!charLetter || !CHARACTER_MODELS.includes(charLetter)) {
    let hash = 0;
    for (let i = 0; i < player.id.length; i++) hash = ((hash << 5) - hash + player.id.charCodeAt(i)) | 0;
    charLetter = CHARACTER_MODELS[Math.abs(hash) % CHARACTER_MODELS.length];
  }
  group.charLetter = charLetter;

  // Placeholder body (shown until GLB loads)
  const placeholderMat = new THREE.MeshStandardMaterial({
    color: player.color,
    roughness: 0.5,
    metalness: 0.5,
    emissive: new THREE.Color(player.color).multiplyScalar(0.2),
  });
  const placeholder = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.4), placeholderMat);
  placeholder.castShadow = true;
  group.add(placeholder);
  group.placeholder = placeholder;

  // Load Kenney character model
  const modelPath = assetURL(`models/characters/character-${charLetter}.glb`);

  function applyModel(gltf) {
    const model = gltf.scene.clone();
    // Scale and position the model to match our player size
    model.scale.set(0.9, 0.9, 0.9);
    model.position.y = -0.6;
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    group.add(model);
    group.characterModel = model;
    // Remove placeholder
    if (group.placeholder) {
      group.remove(group.placeholder);
      group.placeholder = null;
    }
  }

  if (loadedModels[charLetter]) {
    // Use cached model
    applyModel(loadedModels[charLetter]);
  } else {
    gltfLoader.load(modelPath, (gltf) => {
      loadedModels[charLetter] = gltf;
      applyModel(gltf);
    });
  }

  // Weapon holder group (swapped when weapon changes)
  const weaponHolder = new THREE.Group();
  weaponHolder.position.set(0.25, 0, 0.3);
  group.add(weaponHolder);
  group.weaponHolder = weaponHolder;
  updatePlayerWeaponModel(group, player.weapon || 'pistol');

  // Name tag
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // Dark background for readability
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.roundRect(56, 10, 400, 100, 12);
  ctx.fill();
  // Name text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(player.name || 'Player', 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.y = 2.0;
  sprite.scale.set(3, 0.75, 1);
  group.add(sprite);
  group.nameSprite = sprite;
  group.nameCanvas = canvas;

  // Health bar above head
  const hpCanvas = document.createElement('canvas');
  hpCanvas.width = 256;
  hpCanvas.height = 32;
  const hpTexture = new THREE.CanvasTexture(hpCanvas);
  const hpSpriteMat = new THREE.SpriteMaterial({ map: hpTexture, transparent: true, depthTest: false });
  const hpSprite = new THREE.Sprite(hpSpriteMat);
  hpSprite.position.y = 2.4;
  hpSprite.scale.set(1.8, 0.2, 1);
  group.add(hpSprite);
  group.hpSprite = hpSprite;
  group.hpCanvas = hpCanvas;
  group.hpTexture = hpTexture;

  group.position.set(player.x, player.y - PLAYER_HEIGHT + 0.6, player.z);
  scene.add(group);

  updateHealthBar(group, player.health);

  return group;
}

function updateHealthBar(group, health) {
  if (!group.hpCanvas) return;
  const ctx = group.hpCanvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 32);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, 256, 32);
  const pct = Math.max(0, health / 100);
  const r = Math.round(255 * (1 - pct));
  const g = Math.round(255 * pct);
  ctx.fillStyle = `rgb(${r},${g},0)`;
  ctx.fillRect(4, 4, 248 * pct, 24);
  if (group.hpTexture) group.hpTexture.needsUpdate = true;
}

function updateNameTag(group, name) {
  if (!group.nameCanvas) return;
  const ctx = group.nameCanvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.roundRect(56, 10, 400, 100, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name || 'Player', 256, 64);
  if (group.nameSprite && group.nameSprite.material.map) {
    group.nameSprite.material.map.needsUpdate = true;
  }
}

// ============================================
//  BULLET VISUALS
// ============================================

function createBulletMesh(bullet) {
  const size = bullet.size || 0.08;
  const geo = new THREE.SphereGeometry(size, 6, 6);
  const color = bullet.color || 0xffff00;
  // Unlit emissive look — no PointLight per bullet (changing light count
  // forces Three.js to recompile every material's shader, which causes big
  // stutters when many bullets are in flight, e.g. minigun auto-fire).
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(bullet.x, bullet.y, bullet.z);
  scene.add(mesh);
  return mesh;
}

// Explosion visual effect
function createExplosion(x, y, z, radius) {
  playSound('explosion');

  // Flash sphere
  const geo = new THREE.SphereGeometry(radius * 0.3, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 });
  const sphere = new THREE.Mesh(geo, mat);
  sphere.position.set(x, y, z);
  scene.add(sphere);

  const light = new THREE.PointLight(0xff4400, 3, radius * 3);
  light.position.set(x, y, z);
  scene.add(light);

  // Animate explosion
  let frame = 0;
  const maxFrames = 30;
  function animateExplosion() {
    frame++;
    const t = frame / maxFrames;
    sphere.scale.setScalar(1 + t * 3);
    mat.opacity = 0.8 * (1 - t);
    light.intensity = 3 * (1 - t);
    if (frame < maxFrames) {
      requestAnimationFrame(animateExplosion);
    } else {
      scene.remove(sphere);
      scene.remove(light);
    }
  }
  animateExplosion();
}

// ============================================
//  COLLISION DETECTION
// ============================================

// Check if a point (with radius) overlaps any obstacle horizontally at a given height range
function checkObstacleCollision(x, y, z, radius) {
  // y = eye height, feet = y - PLAYER_HEIGHT, head = y + 0.1
  const feetY = y - PLAYER_HEIGHT;
  const headY = y + 0.1;
  for (const obs of obstacles) {
    const halfW = obs.w / 2 + radius;
    const halfD = obs.d / 2 + radius;
    const obsTop = obs.y + obs.h / 2;
    const obsBottom = obs.y - obs.h / 2;

    if (
      x >= obs.x - halfW && x <= obs.x + halfW &&
      z >= obs.z - halfD && z <= obs.z + halfD &&
      headY > obsBottom && feetY < obsTop
    ) {
      return true;
    }
  }
  return false;
}

// Get the ground height at a position (top of any obstacle the player is above)
function getGroundHeight(x, z, radius) {
  let ground = 0; // default floor
  for (const obs of obstacles) {
    const halfW = obs.w / 2 + radius;
    const halfD = obs.d / 2 + radius;
    if (
      x >= obs.x - halfW && x <= obs.x + halfW &&
      z >= obs.z - halfD && z <= obs.z + halfD
    ) {
      const obsTop = obs.y + obs.h / 2;
      if (obsTop > ground) {
        ground = obsTop;
      }
    }
  }
  return ground;
}

// Get the obstacle whose top the player is standing on (or null if just floor)
function getGroundObstacle(x, z, radius) {
  let bestTop = 0, bestObs = null;
  for (const obs of obstacles) {
    const halfW = obs.w / 2 + radius;
    const halfD = obs.d / 2 + radius;
    if (
      x >= obs.x - halfW && x <= obs.x + halfW &&
      z >= obs.z - halfD && z <= obs.z + halfD
    ) {
      const obsTop = obs.y + obs.h / 2;
      if (obsTop > bestTop) {
        bestTop = obsTop;
        bestObs = obs;
      }
    }
  }
  return bestObs;
}

// Check if there's a ceiling above the player
function getCeilingHeight(x, z, feetY, radius) {
  let ceiling = 100; // default no ceiling
  for (const obs of obstacles) {
    const halfW = obs.w / 2 + radius;
    const halfD = obs.d / 2 + radius;
    const obsBottom = obs.y - obs.h / 2;
    if (
      x >= obs.x - halfW && x <= obs.x + halfW &&
      z >= obs.z - halfD && z <= obs.z + halfD &&
      obsBottom > feetY
    ) {
      if (obsBottom < ceiling) {
        ceiling = obsBottom;
      }
    }
  }
  return ceiling;
}

function resolveCollision(oldX, oldZ, newX, newZ, y) {
  const radius = 0.3;

  // Try full movement
  if (!checkObstacleCollision(newX, y, newZ, radius)) {
    return { x: newX, z: newZ };
  }

  // Try sliding along X
  if (!checkObstacleCollision(newX, y, oldZ, radius)) {
    return { x: newX, z: oldZ };
  }

  // Try sliding along Z
  if (!checkObstacleCollision(oldX, y, newZ, radius)) {
    return { x: oldX, z: newZ };
  }

  // Can't move
  return { x: oldX, z: oldZ };
}

// ============================================
//  MINIMAP
// ============================================

function drawMinimap() {
  const w = 150, h = 150;
  const scale = w / 100; // 100 unit map -> 150px

  minimapCtx.clearRect(0, 0, w, h);
  minimapCtx.fillStyle = 'rgba(0,0,0,0.7)';
  minimapCtx.fillRect(0, 0, w, h);

  // Draw obstacles
  minimapCtx.fillStyle = 'rgba(100,100,150,0.6)';
  for (const obs of obstacles) {
    const ox = (obs.x + 50) * scale;
    const oz = (obs.z + 50) * scale;
    const ow = obs.w * scale;
    const od = obs.d * scale;
    minimapCtx.fillRect(ox - ow / 2, oz - od / 2, ow, od);
  }

  // Draw other players
  for (const id in players) {
    if (id === myId) continue;
    const p = players[id];
    if (!p.alive) continue;
    const px = (p.x + 50) * scale;
    const pz = (p.z + 50) * scale;
    minimapCtx.fillStyle = '#' + p.color.toString(16).padStart(6, '0');
    minimapCtx.beginPath();
    minimapCtx.arc(px, pz, 3, 0, Math.PI * 2);
    minimapCtx.fill();
  }

  // Draw self
  const me = players[myId];
  if (me) {
    const mx = (me.x + 50) * scale;
    const mz = (me.z + 50) * scale;
    minimapCtx.fillStyle = '#0f0';
    minimapCtx.beginPath();
    minimapCtx.arc(mx, mz, 4, 0, Math.PI * 2);
    minimapCtx.fill();

    // Direction indicator
    minimapCtx.strokeStyle = '#0f0';
    minimapCtx.lineWidth = 2;
    minimapCtx.beginPath();
    minimapCtx.moveTo(mx, mz);
    minimapCtx.lineTo(mx + Math.sin(-yaw) * 10, mz + Math.cos(-yaw) * -10);
    minimapCtx.stroke();
  }
}

// ============================================
//  SCOREBOARD
// ============================================

function updateScoreboard() {
  const sorted = Object.values(players).sort((a, b) => b.kills - a.kills);
  scoreList.innerHTML = sorted.map(p => {
    const colorHex = '#' + p.color.toString(16).padStart(6, '0');
    const isMe = p.id === myId ? ' *' : '';
    return `<div class="score-entry">
      <span class="score-name" style="color:${colorHex}">${p.name || 'Player'}${isMe}</span>
      <span>${p.kills}/${p.deaths}</span>
    </div>`;
  }).join('');
}

// ============================================
//  ROUND HUD + WINNER BANNER
// ============================================

const roundMapEl   = document.getElementById('round-map');
const roundTimeEl  = document.getElementById('round-time');
const roundBanner  = document.getElementById('round-banner');
const roundBannerWinner = document.getElementById('round-banner-winner');
const roundBannerNext   = document.getElementById('round-banner-next');

function updateRoundHUD() {
  if (!roundMapEl) return;
  if (mapInfo) roundMapEl.textContent = mapInfo.name || '';
  if (roundEndTime) {
    const ms = Math.max(0, roundEndTime - Date.now());
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    roundTimeEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  } else {
    roundTimeEl.textContent = '';
  }
}

function showRoundBanner(winnerName, topKills, nextMapName) {
  if (!roundBanner) return;
  roundBannerWinner.textContent = winnerName
    ? `Winner: ${winnerName} (${topKills} kills)`
    : 'No kills this round';
  roundBannerNext.textContent = `Next map: ${nextMapName || ''}`;
  roundBanner.style.display = 'block';
  setTimeout(() => { roundBanner.style.display = 'none'; }, 6000);
}

// ============================================
//  KILL FEED
// ============================================

function showKillMessage(killerName, victimName) {
  const div = document.createElement('div');
  div.className = 'kill-msg';
  div.textContent = `${killerName} eliminated ${victimName}`;
  killfeed.appendChild(div);
  setTimeout(() => div.remove(), 3500);
}

// ============================================
//  GAME LOOP
// ============================================

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);
  const me = players[myId];

  if (isLocked && me && me.alive) {
    // Calculate movement direction
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    const moveDir = new THREE.Vector3(0, 0, 0);
    if (moveForward) moveDir.add(forward);
    if (moveBackward) moveDir.sub(forward);
    if (moveRight) moveDir.add(right);
    if (moveLeft) moveDir.sub(right);

    if (moveDir.length() > 0) moveDir.normalize();

    // Footstep sounds when moving on ground
    if (moveDir.length() > 0 && !isJumping) {
      const now = performance.now();
      if (now - lastFootstepTime > FOOTSTEP_INTERVAL) {
        playSound('footstep');
        lastFootstepTime = now;
      }
    }

    // Speed boost from ability
    const speedMult = (abilityActive && selectedAbility === 'speed') ? 2.0 : 1.0;
    const newX = camera.position.x + moveDir.x * MOVE_SPEED * speedMult * delta;
    const newZ = camera.position.z + moveDir.z * MOVE_SPEED * speedMult * delta;

    // Wings: fly instead of falling
    if (abilityActive && selectedAbility === 'wings') {
      // Fly upward gently, no gravity
      if (moveForward || moveBackward || moveLeft || moveRight) {
        // Fly in look direction including vertical
        const flyDir = new THREE.Vector3(0, 0, -1);
        flyDir.applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        camera.position.y += flyDir.y * MOVE_SPEED * delta;
      }
      velocity.y = 0;
      canJump = true;
      // Clamp height
      camera.position.y = Math.max(PLAYER_HEIGHT, Math.min(9, camera.position.y));
    } else {
      // Normal gravity
      velocity.y -= GRAVITY * delta;
      let newY = camera.position.y + velocity.y * delta;

      // Ground/obstacle top collision
      const groundAtNew = getGroundHeight(camera.position.x, camera.position.z, 0.3);
      const floorY = groundAtNew + PLAYER_HEIGHT;

      if (newY <= floorY) {
        newY = floorY;
        const grndObs = getGroundObstacle(camera.position.x, camera.position.z, 0.3);
        if (grndObs && grndObs.theme === 'launch-pad') {
          velocity.y = grndObs.boost || 22;
          canJump = false;
          isJumping = true;
          playSound('jump');
        } else {
          velocity.y = 0;
          canJump = true;
          isJumping = false;
        }
      }

      // Ceiling collision (head bump)
      const feetY = newY - PLAYER_HEIGHT;
      const ceiling = getCeilingHeight(camera.position.x, camera.position.z, feetY, 0.3);
      if (newY + 0.1 > ceiling) {
        newY = ceiling - 0.1;
        if (velocity.y > 0) velocity.y = 0;
      }

      camera.position.y = newY;
    }

    // Resolve obstacle collisions (horizontal)
    const resolved = resolveCollision(camera.position.x, camera.position.z, newX, newZ, camera.position.y);
    camera.position.x = resolved.x;
    camera.position.z = resolved.z;

    // Clamp to map bounds
    camera.position.x = Math.max(-49, Math.min(49, camera.position.x));
    camera.position.z = Math.max(-49, Math.min(49, camera.position.z));

    // Apply camera rotation
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    // Send position to server
    socket.emit('move', {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      rx: pitch,
      ry: yaw,
    });
  }

  // Smoothly interpolate other player positions
  for (const id in playerMeshes) {
    const mesh = playerMeshes[id];
    const player = players[id];
    if (!player || id === myId) continue;

    if (!player.alive) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;

    // Make paused players semi-transparent
    const targetOpacity = player.paused ? 0.3 : 1.0;
    mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        if (player.paused) {
          child.material.transparent = true;
          child.material.opacity = targetOpacity;
        } else if (child.material.opacity < 1.0 && !child.material._wasTransparent) {
          child.material.transparent = false;
          child.material.opacity = 1.0;
        }
      }
    });

    const targetX = player.x;
    const targetY = player.y - PLAYER_HEIGHT + 0.6;
    const targetZ = player.z;

    mesh.position.x += (targetX - mesh.position.x) * 0.3;
    mesh.position.y += (targetY - mesh.position.y) * 0.3;
    mesh.position.z += (targetZ - mesh.position.z) * 0.3;

    // Rotate body to face direction
    mesh.rotation.y = -player.ry;
  }

  // Animate active ability effects (shield pulse, wings flap, etc.)
  const _abilityT = performance.now() * 0.001;
  for (const id in playerMeshes) {
    const fx = playerMeshes[id] && playerMeshes[id].abilityEffect;
    if (!fx) continue;
    const k = fx.userData && fx.userData.kind;
    if (k === 'shield') {
      fx.rotation.y += delta * 0.6;
      const s = 1 + Math.sin(_abilityT * 5) * 0.04;
      fx.scale.set(s, s, s);
    } else if (k === 'wings') {
      const flap = Math.sin(_abilityT * 12) * 0.4;
      if (fx.userData.left)  fx.userData.left.rotation.y  = -Math.PI / 8 - flap;
      if (fx.userData.right) fx.userData.right.rotation.y =  Math.PI / 8 + flap;
    } else if (k === 'heal') {
      fx.rotation.y += delta * 1.2;
      fx.position.y = Math.sin(_abilityT * 3) * 0.05;
    } else if (k === 'speed') {
      fx.position.y = Math.sin(_abilityT * 8) * 0.04;
    }
  }

  // Update bullet positions (client-side prediction)
  for (const id in bulletMeshes) {
    const mesh = bulletMeshes[id];
    if (mesh.vel) {
      const spd = mesh.bulletSpeed || 80;
      mesh.position.x += mesh.vel.x * spd * delta;
      mesh.position.y += mesh.vel.y * spd * delta;
      mesh.position.z += mesh.vel.z * spd * delta;
    }
  }

  // Check if ability expired client-side
  if (abilityActive && Date.now() >= abilityActiveEnd) {
    abilityActive = false;
  }
  updateAbilityHUD();
  drawMinimap();
  updateScoreboard();
  updateRoundHUD();

  // Animate first-person weapon
  if (fpWeaponGroup) {
    if (fpWeaponSwinging) {
      fpWeaponSwingTime += delta * 8;
      if (fpWeaponSwingTime < 1) {
        // Swing forward
        fpWeaponGroup.rotation.x = -fpWeaponSwingTime * 1.5;
        fpWeaponGroup.position.z = -0.4 - fpWeaponSwingTime * 0.15;
      } else {
        // Return
        fpWeaponSwinging = false;
        fpWeaponSwingTime = 0;
        updateFPWeapon(); // reset position
      }
    } else if (!holdingKnife) {
      // Gentle weapon bob while moving
      const isMoving = moveForward || moveBackward || moveLeft || moveRight;
      if (isMoving) {
        const bobTime = performance.now() * 0.005;
        fpWeaponGroup.position.x = 0.25 + Math.sin(bobTime) * 0.008;
        fpWeaponGroup.position.y = -0.2 + Math.cos(bobTime * 2) * 0.005;
      }
    }
  }

  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
//  SOCKET EVENTS
// ============================================

socket.on('init', (data) => {
  myId = data.id;
  players = data.players;
  weapons = data.weapons || {};
  abilities = data.abilities || {};

  // Version check
  const CLIENT_VERSION = '1.0.1';
  const versionDisplay = document.getElementById('version-display');
  const updateBanner = document.getElementById('update-banner');
  versionDisplay.textContent = 'v' + CLIENT_VERSION;
  if (data.version && data.version !== CLIENT_VERSION) {
    updateBanner.style.display = 'block';
    updateBanner.addEventListener('click', () => window.location.reload());
  }

  init();
  if (data.map) {
    loadMap(data.map, data.obstacles);
  } else {
    // Server didn't send map info — fall back to playground theme
    loadMap({
      id: 'playground', name: 'Playground', theme: 'playground',
      sky: 0x87ceeb, fog: { color: 0xc8e7ff, near: 60, far: 140 },
      ground: { color: 0x6dc06b }, hemiSky: 0xb6e3ff, hemiGround: 0x6dc06b,
    }, data.obstacles);
  }
  if (typeof data.roundEndTime === 'number') {
    roundEndTime = data.roundEndTime;
  }
  // Seed any cars sent at init time
  if (Array.isArray(data.cars)) {
    for (const c of data.cars) ensureCarMesh(c);
  }
  updateWeaponHUD();
  updateAbilityHUD();

  // Create meshes for existing players
  for (const id in players) {
    if (id !== myId) {
      playerMeshes[id] = createPlayerMesh(players[id]);
    }
  }

  // Set camera to our spawn
  const me = players[myId];
  if (me) {
    camera.position.set(me.x, me.y, me.z);
  }

  animate();
});

socket.on('mapChanged', (data) => {
  // Tear down any car meshes from the previous round
  for (const id in carMeshes) {
    mapRoot && mapRoot.remove(carMeshes[id]);
    delete carMeshes[id];
  }

  loadMap(data.map, data.obstacles);
  if (typeof data.roundEndTime === 'number') roundEndTime = data.roundEndTime;
  // Refresh player snapshots from the server (positions reset to spawns)
  if (data.players) players = data.players;

  // Seed cars for the new map (if any)
  if (Array.isArray(data.cars)) {
    for (const c of data.cars) ensureCarMesh(c);
  }

  // Snap our local camera to the server-side spawn and zero velocity
  const me = players[myId];
  if (me) {
    camera.position.set(me.x, me.y, me.z);
    velocity.set(0, 0, 0);
  }

  // Show round-over banner
  showRoundBanner(data.winnerName, data.topKills, data.map.name);
});

socket.on('yourPlayer', (player) => {
  players[player.id] = player;
  camera.position.set(player.x, player.y, player.z);
});

socket.on('playerJoined', (player) => {
  players[player.id] = player;
  if (player.id !== myId) {
    playerMeshes[player.id] = createPlayerMesh(player);
  }
});

socket.on('playerLeft', (id) => {
  delete players[id];
  if (playerMeshes[id]) {
    scene.remove(playerMeshes[id]);
    delete playerMeshes[id];
  }
});

socket.on('playerUpdated', (player) => {
  if (players[player.id]) {
    const oldWeapon = players[player.id].weapon;
    const oldChar = players[player.id].character;
    players[player.id].name = player.name;
    players[player.id].weapon = player.weapon;
    players[player.id].character = player.character;

    if (playerMeshes[player.id]) {
      // If character changed, rebuild the whole mesh
      if (player.character !== oldChar && player.id !== myId) {
        const pos = playerMeshes[player.id].position.clone();
        const rot = playerMeshes[player.id].rotation.y;
        scene.remove(playerMeshes[player.id]);
        playerMeshes[player.id] = createPlayerMesh(players[player.id]);
        playerMeshes[player.id].position.copy(pos);
        playerMeshes[player.id].rotation.y = rot;
      } else {
        updateNameTag(playerMeshes[player.id], player.name);
        if (player.weapon !== oldWeapon) {
          updatePlayerWeaponModel(playerMeshes[player.id], player.weapon);
        }
      }
    }
  }
});

socket.on('gameState', (state) => {
  for (const id in state.players) {
    if (players[id]) {
      if (id !== myId) {
        players[id].x = state.players[id].x;
        players[id].y = state.players[id].y;
        players[id].z = state.players[id].z;
        players[id].rx = state.players[id].rx;
        players[id].ry = state.players[id].ry;
      }
      players[id].health = state.players[id].health;
      players[id].kills = state.players[id].kills;
      players[id].deaths = state.players[id].deaths;
      players[id].alive = state.players[id].alive;
      players[id].paused = state.players[id].paused;
      // Update 3rd person weapon model if weapon changed
      const newWeapon = state.players[id].weapon;
      if (newWeapon !== players[id].weapon && playerMeshes[id]) {
        updatePlayerWeaponModel(playerMeshes[id], newWeapon);
      }
      players[id].weapon = newWeapon;
    }
  }

  // Sync cars from server snapshot (road map only)
  if (Array.isArray(state.cars)) {
    const seen = new Set();
    for (const car of state.cars) {
      seen.add(car.id);
      ensureCarMesh(car);
    }
    // Despawn locally any car the server no longer reports
    for (const id in carMeshes) {
      if (!seen.has(id)) {
        if (mapRoot) mapRoot.remove(carMeshes[id]);
        disposeTree(carMeshes[id]);
        delete carMeshes[id];
      }
    }
  }

  // Update own health display
  const me = players[myId];
  if (me) {
    const hp = Math.max(0, me.health);
    healthText.textContent = `HP: ${hp}`;
    healthFill.style.width = `${hp}%`;
    if (hp > 60) healthFill.style.backgroundColor = '#0f0';
    else if (hp > 30) healthFill.style.backgroundColor = '#ff0';
    else healthFill.style.backgroundColor = '#f00';
  }
});

socket.on('carSpawned', (car) => { ensureCarMesh(car); });
socket.on('carRemoved', (id) => {
  if (carMeshes[id]) {
    if (mapRoot) mapRoot.remove(carMeshes[id]);
    disposeTree(carMeshes[id]);
    delete carMeshes[id];
  }
});

socket.on('bulletCreated', (bullet) => {
  const mesh = createBulletMesh(bullet);
  mesh.vel = { x: bullet.dx, y: bullet.dy, z: bullet.dz };
  mesh.bulletSpeed = bullet.speed || 80;
  bulletMeshes[bullet.id] = mesh;
});

socket.on('explosion', (data) => {
  createExplosion(data.x, data.y, data.z, data.radius);
});

// (Healing potions intentionally removed — damage is permanent unless
//  you use the Heal special ability.)

// Build a per-ability decorative effect (returned as a THREE.Group) that
// lives in the player mesh's local space. Player group origin sits ~0.6m
// above the feet, so y=0 ≈ chest, y=-0.6 ≈ feet, y=+1.0 ≈ top of head.
function createAbilityEffect(abilityId) {
  const group = new THREE.Group();
  group.userData.startTime = performance.now();

  if (abilityId === 'shield') {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 18, 12),
      new THREE.MeshStandardMaterial({
        color: 0x66aaff, transparent: true, opacity: 0.28,
        emissive: 0x2244aa, emissiveIntensity: 0.7,
        side: THREE.DoubleSide,
      })
    );
    dome.position.y = 0;
    group.add(dome);
    const hex = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.1, 1),
      new THREE.MeshBasicMaterial({ color: 0xaaddff, wireframe: true, transparent: true, opacity: 0.55 })
    );
    group.add(hex);
    group.userData.kind = 'shield';
  } else if (abilityId === 'heal') {
    // Bandage wraps + green plus floating above
    const wrapMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    for (let i = 0; i < 3; i++) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.09, 8, 18), wrapMat);
      wrap.rotation.set(Math.PI / 2.1, 0, (i - 1) * 0.35);
      wrap.position.y = 0.1 - i * 0.25;
      group.add(wrap);
    }
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x44ff66 });
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.1), crossMat);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.1), crossMat);
    crossH.position.y = 1.4; crossV.position.y = 1.4;
    group.add(crossH); group.add(crossV);
    group.userData.kind = 'heal';
  } else if (abilityId === 'wings') {
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xfff8d6, side: THREE.DoubleSide,
      roughness: 0.5, emissive: 0xffaa44, emissiveIntensity: 0.35,
    });
    function wingShape(mirror) {
      const s = new THREE.Shape();
      const m = mirror ? -1 : 1;
      s.moveTo(0, 0);
      s.bezierCurveTo(m * 0.4, 0.5, m * 1.1, 0.5, m * 1.3, 0.1);
      s.bezierCurveTo(m * 1.2, -0.1, m * 0.9, -0.45, m * 0.6, -0.55);
      s.bezierCurveTo(m * 0.3, -0.4, m * 0.1, -0.2, 0, 0);
      return s;
    }
    const left = new THREE.Mesh(new THREE.ShapeGeometry(wingShape(true)), wingMat);
    left.position.set(-0.1, 0.35, 0.15);
    left.rotation.y = -Math.PI / 8;
    group.add(left);
    const right = new THREE.Mesh(new THREE.ShapeGeometry(wingShape(false)), wingMat);
    right.position.set(0.1, 0.35, 0.15);
    right.rotation.y = Math.PI / 8;
    group.add(right);
    group.userData.kind = 'wings';
    group.userData.left = left;
    group.userData.right = right;
  } else if (abilityId === 'speed') {
    const bootMat = new THREE.MeshStandardMaterial({
      color: 0x3a7bff, roughness: 0.4, metalness: 0.4,
      emissive: 0x1133aa, emissiveIntensity: 0.55,
    });
    const wingMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    });
    for (const dx of [-0.18, 0.18]) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.34), bootMat);
      boot.position.set(dx, -0.55, 0);
      group.add(boot);
      // Tiny winglet on the side of each boot
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.lineTo(0.28, 0.06);
      wingShape.lineTo(0.32, -0.08);
      wingShape.lineTo(0, -0.04);
      wingShape.lineTo(0, 0);
      const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), wingMat);
      wing.position.set(dx + (dx > 0 ? 0.05 : -0.05), -0.5, 0);
      wing.rotation.y = dx > 0 ? 0 : Math.PI;
      group.add(wing);
    }
    group.userData.kind = 'speed';
  }
  return group;
}

socket.on('abilityActivated', (data) => {
  if (data.playerId === myId) {
    abilityActive = true;
    abilityActiveEnd = Date.now() + data.duration;
    const ab = abilities[data.ability];
    abilityCooldownEnd = Date.now() + (ab ? ab.cooldown : 10000);
    playSound('respawn'); // power-up sound
  }
  const mesh = playerMeshes[data.playerId];
  if (mesh) {
    // Drop any previous effect that's still attached
    if (mesh.abilityEffect) {
      mesh.remove(mesh.abilityEffect);
      mesh.abilityEffect = null;
    }
    const fx = createAbilityEffect(data.ability);
    mesh.add(fx);
    mesh.abilityEffect = fx;
    setTimeout(() => {
      if (mesh.abilityEffect === fx) {
        mesh.remove(fx);
        mesh.abilityEffect = null;
      }
    }, data.duration);
  }
});

socket.on('abilityEnded', (data) => {
  if (data.playerId === myId) {
    abilityActive = false;
  }
  const mesh = playerMeshes[data.playerId];
  if (mesh && mesh.abilityEffect) {
    mesh.remove(mesh.abilityEffect);
    mesh.abilityEffect = null;
  }
});

socket.on('bulletRemoved', (bulletId) => {
  if (bulletMeshes[bulletId]) {
    scene.remove(bulletMeshes[bulletId]);
    delete bulletMeshes[bulletId];
  }
});

socket.on('playerHit', (data) => {
  if (data.playerId === myId) {
    // Show damage effect
    damageOverlay.style.opacity = '0.6';
    setTimeout(() => damageOverlay.style.opacity = '0', 200);
    playSound('hit');
  } else if (data.shooterId === myId) {
    playSound('hit');
  }
  // Update health bar on other player's mesh
  if (playerMeshes[data.playerId]) {
    updateHealthBar(playerMeshes[data.playerId], data.health);
  }
});

socket.on('playerKilled', (data) => {
  showKillMessage(data.killerName, data.victimName);

  if (data.playerId === myId) {
    deathScreen.style.display = 'block';
    playSound('death');
  } else if (data.killerId === myId) {
    playSound('kill');
  }
});

socket.on('playerRespawned', (player) => {
  if (players[player.id]) {
    Object.assign(players[player.id], player);
  }

  if (player.id === myId) {
    deathScreen.style.display = 'none';
    camera.position.set(player.x, player.y, player.z);
    velocity.y = 0;
    playSound('respawn');
  }

  if (playerMeshes[player.id]) {
    playerMeshes[player.id].visible = true;
    updateHealthBar(playerMeshes[player.id], player.health);
  }
});
