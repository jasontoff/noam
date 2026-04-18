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

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 30, 60);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, PLAYER_HEIGHT, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  // Lighting
  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 80;
  dirLight.shadow.camera.left = -30;
  dirLight.shadow.camera.right = 30;
  dirLight.shadow.camera.top = 30;
  dirLight.shadow.camera.bottom = -30;
  scene.add(dirLight);

  // Point lights for atmosphere
  const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44];
  const positions = [[-15, 5, -15], [15, 5, -15], [-15, 5, 15], [15, 5, 15]];
  positions.forEach((pos, i) => {
    const light = new THREE.PointLight(colors[i], 0.5, 25);
    light.position.set(...pos);
    scene.add(light);
  });

  // Ground
  const groundGeo = new THREE.PlaneGeometry(50, 50, 50, 50);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a3a,
    roughness: 0.8,
    metalness: 0.2,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid overlay on ground
  const gridHelper = new THREE.GridHelper(50, 50, 0x3a3a5a, 0x2a2a4a);
  scene.add(gridHelper);

  // Skybox-ish ceiling glow
  const ceilGeo = new THREE.PlaneGeometry(50, 50);
  const ceilMat = new THREE.MeshBasicMaterial({ color: 0x0a0a1e, side: THREE.DoubleSide });
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.position.y = 10;
  ceil.rotation.x = Math.PI / 2;
  scene.add(ceil);

  setupControls();
  createFPWeapon();
  window.addEventListener('resize', onResize);
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
    if (e.button === 0) shoot();
  });

  document.addEventListener('wheel', (e) => {
    if (!isLocked) return;
    holdingKnife = !holdingKnife;
    selectedWeapon = holdingKnife ? 'knife' : selectedGun;
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

function shoot() {
  if (!canShoot) return;
  const me = players[myId];
  if (!me || !me.alive) return;

  const weapon = weapons[selectedWeapon] || weapons.pistol;
  canShoot = false;
  setTimeout(() => canShoot = true, weapon.fireRate || 400);

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

    // Muzzle flash effect
    const flash = new THREE.PointLight(0xffaa00, 3, 5);
    flash.position.copy(camera.position);
    scene.add(flash);
    setTimeout(() => scene.remove(flash), 50);

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
  obstacleData.forEach((obs, i) => {
    const geo = new THREE.BoxGeometry(obs.w, obs.h, obs.d);

    // Different styles for walls vs cover
    let mat;
    if (obs.w >= 50 || obs.d >= 50) {
      // Walls
      mat = new THREE.MeshStandardMaterial({
        color: 0x3a3a5a,
        roughness: 0.9,
        metalness: 0.1,
      });
    } else if (obs.w >= 4 && obs.h >= 4) {
      // Center block
      mat = new THREE.MeshStandardMaterial({
        color: 0x5a2a2a,
        roughness: 0.7,
        metalness: 0.3,
        emissive: 0x1a0a0a,
      });
    } else {
      // Cover
      mat = new THREE.MeshStandardMaterial({
        color: 0x4a4a6a,
        roughness: 0.6,
        metalness: 0.4,
      });
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(obs.x, obs.y, obs.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacleMeshes.push(mesh);

    // Add edge wireframe for style
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x6a6a8a, transparent: true, opacity: 0.3 }));
    line.position.copy(mesh.position);
    scene.add(line);
  });
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
  const mat = new THREE.MeshBasicMaterial({ color, emissive: color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(bullet.x, bullet.y, bullet.z);

  // Bullet trail light - bigger for rockets
  const lightIntensity = bullet.weaponType === 'rocket' ? 1.5 : 0.5;
  const lightDist = bullet.weaponType === 'rocket' ? 6 : 3;
  const light = new THREE.PointLight(color, lightIntensity, lightDist);
  mesh.add(light);

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
  const scale = w / 50; // 50 unit map -> 150px

  minimapCtx.clearRect(0, 0, w, h);
  minimapCtx.fillStyle = 'rgba(0,0,0,0.7)';
  minimapCtx.fillRect(0, 0, w, h);

  // Draw obstacles
  minimapCtx.fillStyle = 'rgba(100,100,150,0.6)';
  for (const obs of obstacles) {
    const ox = (obs.x + 25) * scale;
    const oz = (obs.z + 25) * scale;
    const ow = obs.w * scale;
    const od = obs.d * scale;
    minimapCtx.fillRect(ox - ow / 2, oz - od / 2, ow, od);
  }

  // Draw other players
  for (const id in players) {
    if (id === myId) continue;
    const p = players[id];
    if (!p.alive) continue;
    const px = (p.x + 25) * scale;
    const pz = (p.z + 25) * scale;
    minimapCtx.fillStyle = '#' + p.color.toString(16).padStart(6, '0');
    minimapCtx.beginPath();
    minimapCtx.arc(px, pz, 3, 0, Math.PI * 2);
    minimapCtx.fill();
  }

  // Draw self
  const me = players[myId];
  if (me) {
    const mx = (me.x + 25) * scale;
    const mz = (me.z + 25) * scale;
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
        velocity.y = 0;
        canJump = true;
        isJumping = false;
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
    camera.position.x = Math.max(-24, Math.min(24, camera.position.x));
    camera.position.z = Math.max(-24, Math.min(24, camera.position.z));

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
  // Animate healing potion (float and spin)
  if (potionMesh) {
    const t = performance.now() * 0.001;
    potionMesh.position.y = 0.5 + Math.sin(t * 2) * 0.15;
    potionMesh.rotation.y = t * 1.5;
  }

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
  const CLIENT_VERSION = '1.0.0';
  const versionDisplay = document.getElementById('version-display');
  const updateBanner = document.getElementById('update-banner');
  versionDisplay.textContent = 'v' + CLIENT_VERSION;
  if (data.version && data.version !== CLIENT_VERSION) {
    updateBanner.style.display = 'block';
    updateBanner.addEventListener('click', () => window.location.reload());
  }

  init();
  createObstacles(data.obstacles);
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

socket.on('bulletCreated', (bullet) => {
  const mesh = createBulletMesh(bullet);
  mesh.vel = { x: bullet.dx, y: bullet.dy, z: bullet.dz };
  mesh.bulletSpeed = bullet.speed || 80;
  bulletMeshes[bullet.id] = mesh;
});

socket.on('explosion', (data) => {
  createExplosion(data.x, data.y, data.z, data.radius);
});

// Healing potion
let potionMesh = null;

socket.on('potionSpawned', (potion) => {
  // Remove old potion mesh if any
  if (potionMesh) { scene.remove(potionMesh); potionMesh = null; }

  const group = new THREE.Group();

  // Bottle body
  const bottleGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.4, 8);
  const bottleMat = new THREE.MeshStandardMaterial({
    color: 0x44ff44, emissive: 0x00ff00, emissiveIntensity: 0.4,
    transparent: true, opacity: 0.7, metalness: 0.3, roughness: 0.2,
  });
  const bottle = new THREE.Mesh(bottleGeo, bottleMat);
  group.add(bottle);

  // Bottle neck
  const neckGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.15, 8);
  const neck = new THREE.Mesh(neckGeo, bottleMat);
  neck.position.y = 0.25;
  group.add(neck);

  // Cork
  const corkGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.06, 8);
  const corkMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });
  const cork = new THREE.Mesh(corkGeo, corkMat);
  cork.position.y = 0.35;
  group.add(cork);

  // Cross symbol
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }));
  crossH.position.set(0, 0, 0.21);
  group.add(crossH);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }));
  crossV.position.set(0, 0, 0.21);
  group.add(crossV);

  // Glow light
  const light = new THREE.PointLight(0x44ff44, 1, 5);
  light.position.y = 0.2;
  group.add(light);

  group.position.set(potion.x, potion.y, potion.z);
  group.potionId = potion.id;
  scene.add(group);
  potionMesh = group;
});

socket.on('potionPickedUp', (data) => {
  if (potionMesh) {
    scene.remove(potionMesh);
    potionMesh = null;
  }
  if (data.playerId === myId) {
    playSound('respawn'); // power-up sound for healing
  }
});

socket.on('abilityActivated', (data) => {
  if (data.playerId === myId) {
    abilityActive = true;
    abilityActiveEnd = Date.now() + data.duration;
    const ab = abilities[data.ability];
    abilityCooldownEnd = Date.now() + (ab ? ab.cooldown : 10000);
    playSound('respawn'); // power-up sound
  }
  // Visual effect on other players
  if (playerMeshes[data.playerId]) {
    const mesh = playerMeshes[data.playerId];
    const colors = { speed: 0x00ff00, shield: 0x4444ff, wings: 0xffff00, heal: 0xff44ff };
    const effectColor = colors[data.ability] || 0xffffff;
    const light = new THREE.PointLight(effectColor, 2, 8);
    light.position.y = 1;
    mesh.add(light);
    setTimeout(() => mesh.remove(light), data.duration);
  }
});

socket.on('abilityEnded', (data) => {
  if (data.playerId === myId) {
    abilityActive = false;
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
