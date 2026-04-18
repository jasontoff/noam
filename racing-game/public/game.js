import * as THREE from 'three';

window.startGame = function (mode) {
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  document.getElementById('positions').style.display = 'block';
  document.getElementById('speedometer').style.display = 'block';
  document.getElementById('controls').style.display = 'block';
  init(mode);
};

const LAPS = 3;
const TRACK_WIDTH = 14;
const SAMPLES = 300;

let scene, camera, renderer, clock;
let trackCurve, trackLength;
const sampled = [];
let player = null;
const npcs = [];
const allCars = [];
let countdown = 3;
let countdownTimer = 0;
let raceStarted = false;
let gameOver = false;
let startTime = 0;
const keys = {};

function init(mode) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 200, 700);

  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 2000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(120, 200, 80);
  sun.castShadow = true;
  sun.shadow.camera.left = -200;
  sun.shadow.camera.right = 200;
  sun.shadow.camera.top = 200;
  sun.shadow.camera.bottom = -200;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshLambertMaterial({ color: 0x4a9c3e })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  buildTrack();
  addScenery();

  const numNPCs = mode === 'multi' ? 7 : 3;
  spawnCars(numNPCs);

  setupInput();

  clock = new THREE.Clock();
  countdownTimer = 0;
  countdown = 3;

  addEventListener('resize', onResize);
  animate();
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function setupInput() {
  addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
  addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));
}

function buildTrack() {
  const waypoints = [
    new THREE.Vector3(   0, 0,  160),  // start/finish straight
    new THREE.Vector3(  70, 0,  170),
    new THREE.Vector3( 150, 0,  140),  // T1 right
    new THREE.Vector3( 190, 0,   70),
    new THREE.Vector3( 180, 0,  -10),  // long right sweeper
    new THREE.Vector3( 200, 0,  -80),
    new THREE.Vector3( 150, 0, -140),  // T4
    new THREE.Vector3(  80, 0, -170),
    new THREE.Vector3(   0, 0, -190),  // back straight
    new THREE.Vector3( -80, 0, -175),
    new THREE.Vector3(-140, 0, -130),
    new THREE.Vector3(-100, 0,  -70),  // chicane pinch inward
    new THREE.Vector3(-170, 0,  -40),  // chicane back out
    new THREE.Vector3(-195, 0,   40),
    new THREE.Vector3(-155, 0,  110),  // final curve
    new THREE.Vector3( -80, 0,  140),
    new THREE.Vector3( -30, 0,  150),
  ];
  trackCurve = new THREE.CatmullRomCurve3(waypoints, true, 'catmullrom', 0.5);
  trackLength = trackCurve.getLength();

  for (let i = 0; i < SAMPLES; i++) {
    const t = i / SAMPLES;
    sampled.push({ t, p: trackCurve.getPoint(t) });
  }

  const segs = 500;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = trackCurve.getPoint(t);
    const tan = trackCurve.getTangent(t).normalize();
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const left = p.clone().addScaledVector(side, TRACK_WIDTH);
    const right = p.clone().addScaledVector(side, -TRACK_WIDTH);
    positions.push(left.x, 0.02, left.z);
    positions.push(right.x, 0.02, right.z);
    uvs.push(0, t * 80);
    uvs.push(1, t * 80);
    if (i < segs) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const trackMesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  trackMesh.receiveShadow = true;
  scene.add(trackMesh);

  // gravel run-off apron
  addApron(TRACK_WIDTH + 1.5, 5.5, 0x8a7a5a);
  addApron(-TRACK_WIDTH - 1.5, 5.5, 0x8a7a5a);

  // rumble strips
  addRumbleStrip(TRACK_WIDTH + 0.2, 1.2);
  addRumbleStrip(-TRACK_WIDTH - 0.2, 1.2);

  // tire barriers at selected sharp corners
  addTireBarriers();

  // finish line (checkered)
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 === 0 ? '#fff' : '#000';
      ctx.fillRect(i * 8, j * 8, 8, 8);
    }
  const finishTex = new THREE.CanvasTexture(c);
  const fp = trackCurve.getPoint(0);
  const ftan = trackCurve.getTangent(0);
  const finish = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_WIDTH * 2, 4),
    new THREE.MeshBasicMaterial({ map: finishTex })
  );
  finish.position.set(fp.x, 0.08, fp.z);
  finish.rotation.x = -Math.PI / 2;
  finish.rotation.z = -Math.atan2(ftan.x, ftan.z);
  scene.add(finish);
}

function addRumbleStrip(offset, width) {
  const segs = 500;
  const positions = [];
  const indices = [];
  const colors = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = trackCurve.getPoint(t);
    const tan = trackCurve.getTangent(t).normalize();
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const inner = p.clone().addScaledVector(side, offset);
    const outer = p.clone().addScaledVector(side, offset + Math.sign(offset) * width);
    positions.push(inner.x, 0.03, inner.z);
    positions.push(outer.x, 0.03, outer.z);
    const red = Math.floor(i / 4) % 2 === 0;
    const col = red ? [1, 0.1, 0.1] : [1, 1, 1];
    colors.push(...col, ...col);
    if (i < segs) {
      const a = i * 2, b = i * 2 + 1, cI = i * 2 + 2, d = i * 2 + 3;
      indices.push(a, b, cI, b, d, cI);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  scene.add(new THREE.Mesh(geom, mat));
}

function addApron(offset, width, color) {
  const segs = 400;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = trackCurve.getPoint(t);
    const tan = trackCurve.getTangent(t).normalize();
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const inner = p.clone().addScaledVector(side, offset);
    const outer = p.clone().addScaledVector(side, offset + Math.sign(offset) * width);
    positions.push(inner.x, 0.01, inner.z);
    positions.push(outer.x, 0.01, outer.z);
    if (i < segs) {
      const a = i * 2, b = i * 2 + 1, cI = i * 2 + 2, d = i * 2 + 3;
      indices.push(a, b, cI, b, d, cI);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function addTireBarriers() {
  // Place tire stacks at sharp corners (by curve parameter t)
  const tStops = [0.08, 0.22, 0.35, 0.48, 0.58, 0.68, 0.78, 0.92];
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
  const tireGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12);
  for (const t of tStops) {
    const p = trackCurve.getPoint(t);
    const tan = trackCurve.getTangent(t).normalize();
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    // both sides
    for (const dir of [1, -1]) {
      const base = p.clone().addScaledVector(side, dir * (TRACK_WIDTH + 8));
      // stack of 4 tires horizontally, 2 high
      for (let row = 0; row < 2; row++) {
        for (let i = -2; i <= 2; i++) {
          const pos = base.clone().addScaledVector(tan, i * 1.2);
          const tire = new THREE.Mesh(tireGeo, tireMat);
          tire.position.set(pos.x, 0.25 + row * 0.45, pos.z);
          tire.castShadow = true;
          scene.add(tire);
        }
      }
    }
  }
}

function addScenery() {
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
  for (let i = 0; i < 80; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 180 + Math.random() * 300;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 4), trunkMat);
    trunk.position.set(x, 2, z);
    const top = new THREE.Mesh(new THREE.ConeGeometry(3, 7, 8), treeMat);
    top.position.set(x, 7, z);
    top.castShadow = true;
    scene.add(trunk); scene.add(top);
  }
}

function createCar(color, isPlayer) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.7, 4),
    new THREE.MeshLambertMaterial({ color })
  );
  body.position.y = 0.85;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 1.8),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
  );
  cabin.position.set(0, 1.45, -0.15);
  cabin.castShadow = true;
  g.add(cabin);
  const spoiler = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.1, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x111111 })
  );
  spoiler.position.set(0, 1.35, -1.9);
  g.add(spoiler);
  for (const [x, z] of [[-1.05, 1.3], [1.05, 1.3], [-1.05, -1.3], [1.05, -1.3]]) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16),
      new THREE.MeshLambertMaterial({ color: 0x0a0a0a })
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.5, z);
    g.add(wheel);
  }
  if (isPlayer) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.72, 4.02),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    stripe.position.set(0, 0.85, 0);
    g.add(stripe);
  }
  return g;
}

function spawnCars(numNPCs) {
  const total = numNPCs + 1;
  const colors = [0xff3b3b, 0x2979ff, 0xff6d00, 0x9c27b0, 0x00bcd4, 0xff4081, 0x8bc34a, 0xffc107];

  const startT = 0.98; // slightly before finish line
  const startPos = trackCurve.getPoint(startT);
  const startTan = trackCurve.getTangent(startT).normalize();
  const side = new THREE.Vector3(-startTan.z, 0, startTan.x).normalize();
  const heading = Math.atan2(startTan.x, startTan.z);

  // player at back of grid
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const isPlayer = i === total - 1;
    const lateralOffset = col === 0 ? 4 : -4;
    const backOffset = -row * 7 - 2;
    const pos = startPos.clone()
      .addScaledVector(startTan, backOffset)
      .addScaledVector(side, lateralOffset);

    const color = isPlayer ? 0xffeb3b : colors[i % colors.length];
    const mesh = createCar(color, isPlayer);
    mesh.position.copy(pos);
    mesh.rotation.y = heading;
    scene.add(mesh);

    const car = {
      mesh,
      position: pos.clone(),
      heading,
      speed: 0,
      isPlayer,
      lap: 0,
      progress: startT,
      lastT: startT,
      hasLeftStart: false,
      finished: false,
      finishTime: 0,
      name: isPlayer ? 'You' : `CPU ${i + 1}`,
      color,
      // Per-NPC skill variance (0..1). Actual speed scales with player speed.
      skillRoll: Math.random(),
      lookahead: 10 + Math.random() * 4,
      jitter: Math.random() * Math.PI * 2,
      refSpeed: 0,
      onTrack: true,
      mistakeActive: false,
      mistakeCooldown: 4 + Math.random() * 10,
      mistakeRemaining: 0,
      mistakeOffset: 0,
    };

    if (isPlayer) player = car;
    else npcs.push(car);
    allCars.push(car);
  }
}

function findClosestT(pos, hint) {
  let bestT = hint;
  let bestD = Infinity;
  const center = Math.round(hint * SAMPLES);
  for (let k = -12; k <= 12; k++) {
    const idx = ((center + k) % SAMPLES + SAMPLES) % SAMPLES;
    const s = sampled[idx];
    const dx = pos.x - s.p.x;
    const dz = pos.z - s.p.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; bestT = s.t; }
  }
  return bestT;
}

function updatePlayer(dt) {
  if (player.finished || !raceStarted) {
    player.mesh.position.copy(player.position);
    player.mesh.rotation.y = player.heading;
    return;
  }
  const MAX_SPEED = 58;
  const MAX_REV = -14;
  const ACCEL = 32;
  const BRAKE = 70;
  const DRAG = 7;
  const STEER = 2.4;

  const fwd = keys['w'] || keys['arrowup'];
  const back = keys['s'] || keys['arrowdown'];
  const left = keys['a'] || keys['arrowleft'];
  const right = keys['d'] || keys['arrowright'];
  const hand = keys[' '];

  if (fwd) player.speed += ACCEL * dt;
  if (back) {
    if (player.speed > 0) player.speed -= BRAKE * dt;
    else player.speed -= ACCEL * 0.6 * dt;
  }
  if (!fwd && !back) {
    const s = Math.sign(player.speed);
    player.speed -= s * DRAG * dt;
    if (Math.abs(player.speed) < DRAG * dt) player.speed = 0;
  }
  if (hand) {
    const s = Math.sign(player.speed);
    player.speed -= s * 55 * dt;
    if (Math.abs(player.speed) < 2) player.speed = 0;
  }
  player.speed = Math.max(MAX_REV, Math.min(MAX_SPEED, player.speed));

  const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
  const dir = player.speed >= 0 ? 1 : -1;
  const speedFactor = Math.min(1, Math.abs(player.speed) / 15);
  player.heading += steerInput * STEER * dt * speedFactor * dir;

  // off-track slow
  const tNear = findClosestT(player.position, player.lastT);
  const nearP = trackCurve.getPoint(tNear);
  const dist = Math.hypot(player.position.x - nearP.x, player.position.z - nearP.z);
  const onTrack = dist < TRACK_WIDTH;
  const mult = onTrack ? 1 : 0.45;
  player.onTrack = onTrack;

  // Reference speed: upper envelope of recent player speed. NPCs scale off this.
  const absSpd = Math.abs(player.speed);
  if (absSpd > player.refSpeed) player.refSpeed = absSpd;
  else player.refSpeed = Math.max(0, player.refSpeed - 5 * dt);

  player.position.x += Math.sin(player.heading) * player.speed * dt * mult;
  player.position.z += Math.cos(player.heading) * player.speed * dt * mult;

  player.mesh.position.copy(player.position);
  player.mesh.rotation.y = player.heading;
}

function updateNPC(npc, dt) {
  if (npc.finished || !raceStarted) {
    npc.mesh.position.copy(npc.position);
    npc.mesh.rotation.y = npc.heading;
    return;
  }

  // Mistake timer: occasional wide lines / off-track drifts
  if (npc.mistakeActive) {
    npc.mistakeRemaining -= dt;
    if (npc.mistakeRemaining <= 0) {
      npc.mistakeActive = false;
      npc.mistakeCooldown = 6 + Math.random() * 18;  // 6..24s until next
    }
  } else {
    npc.mistakeCooldown -= dt;
    if (npc.mistakeCooldown <= 0) {
      npc.mistakeActive = true;
      npc.mistakeRemaining = 0.6 + Math.random() * 1.6;  // 0.6..2.2s
      // Push aim off the racing line; sometimes fully off track
      const severity = Math.random();
      const magnitude = severity < 0.3
        ? TRACK_WIDTH * 1.2 + Math.random() * 6   // full off-track
        : TRACK_WIDTH * 0.6 * severity;           // wide line
      npc.mistakeOffset = (Math.random() < 0.5 ? 1 : -1) * magnitude;
    }
  }

  const currentT = findClosestT(npc.position, npc.lastT);
  const lookT = (currentT + npc.lookahead / trackLength) % 1;
  let target = trackCurve.getPoint(lookT);

  if (npc.mistakeActive) {
    const ltan = trackCurve.getTangent(lookT).normalize();
    const lside = new THREE.Vector3(-ltan.z, 0, ltan.x).normalize();
    target = target.clone().addScaledVector(lside, npc.mistakeOffset);
  }

  const dx = target.x - npc.position.x;
  const dz = target.z - npc.position.z;
  let desired = Math.atan2(dx, dz);
  let diff = desired - npc.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const STEER = 2.6;
  npc.heading += Math.max(-STEER * dt, Math.min(STEER * dt, diff));

  // slow for corners
  const tA = trackCurve.getTangent(currentT).normalize();
  const tB = trackCurve.getTangent((currentT + 0.03) % 1).normalize();
  const turn = Math.acos(Math.max(-1, Math.min(1, tA.dot(tB))));

  const PLAYER_MAX = 58;
  const NPC_MAX_ABS = PLAYER_MAX * 1.18;
  // Intrinsic top speed: 1.00..1.12 of player max. Some NPCs are faster than you.
  const baseMax = PLAYER_MAX * (1.00 + npc.skillRoll * 0.12);

  let targetSpeed = baseMax;

  // Rubber-band only to prevent runaway leads or unrecoverable gaps
  const rankDiff = carRank(npc) - carRank(player);
  if (rankDiff > 0.20) targetSpeed *= 0.90;
  else if (rankDiff > 0.08) targetSpeed *= 0.96;
  else if (rankDiff < -0.25) targetSpeed *= 1.08;
  else if (rankDiff < -0.10) targetSpeed *= 1.03;

  // If player is off-track, NPCs push harder
  if (!player.onTrack) targetSpeed *= 1.05;

  // During a mistake, NPC scrubs speed
  if (npc.mistakeActive) targetSpeed *= 0.82;

  if (turn > 0.12) targetSpeed *= 0.78;
  if (turn > 0.22) targetSpeed *= 0.7;

  npc.jitter += dt * 0.8;
  targetSpeed *= 0.97 + 0.03 * Math.sin(npc.jitter);
  targetSpeed = Math.min(targetSpeed, NPC_MAX_ABS);

  if (npc.speed < targetSpeed) npc.speed += 28 * dt;
  else npc.speed -= 32 * dt;
  npc.speed = Math.max(0, Math.min(NPC_MAX_ABS, npc.speed));

  // Off-track slowdown (same as player)
  const nearP = trackCurve.getPoint(currentT);
  const distFromTrack = Math.hypot(npc.position.x - nearP.x, npc.position.z - nearP.z);
  const onTrack = distFromTrack < TRACK_WIDTH;
  const mult = onTrack ? 1 : 0.55;

  npc.position.x += Math.sin(npc.heading) * npc.speed * dt * mult;
  npc.position.z += Math.cos(npc.heading) * npc.speed * dt * mult;

  npc.mesh.position.copy(npc.position);
  npc.mesh.rotation.y = npc.heading;
}

function updateCarCollisions() {
  for (let i = 0; i < allCars.length; i++) {
    for (let j = i + 1; j < allCars.length; j++) {
      const a = allCars[i], b = allCars[j];
      const dx = a.position.x - b.position.x;
      const dz = a.position.z - b.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 3 && d > 0.001) {
        const push = (3 - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.position.x += nx * push;
        a.position.z += nz * push;
        b.position.x -= nx * push;
        b.position.z -= nz * push;
        a.speed *= 0.92;
        b.speed *= 0.92;
      }
    }
  }
}

function updateLaps() {
  for (const car of allCars) {
    if (car.finished) continue;
    const t = findClosestT(car.position, car.lastT);
    if (t > 0.3 && t < 0.7) car.hasLeftStart = true;
    if (car.hasLeftStart && car.lastT > 0.85 && t < 0.15) {
      car.lap++;
      car.hasLeftStart = false;
      if (car.lap >= LAPS) {
        car.finished = true;
        car.finishTime = performance.now() - startTime;
        if (car.isPlayer) endGame();
      }
    }
    car.lastT = t;
    car.progress = t;
  }
}

function carRank(car) {
  return car.lap + car.progress;
}

function sortedCars() {
  return [...allCars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return carRank(b) - carRank(a);
  });
}

function updateHUD() {
  const sorted = sortedCars();
  const pos = sorted.indexOf(player) + 1;
  document.getElementById('lap').textContent = Math.min(player.lap + 1, LAPS);
  document.getElementById('position').textContent = `${pos}/${allCars.length}`;
  document.getElementById('speed').textContent = Math.round(Math.abs(player.speed) * 3.6);

  const panel = document.getElementById('positions');
  panel.innerHTML = sorted
    .map((c, i) => `<div class="pos ${c.isPlayer ? 'me' : ''}">${i + 1}. ${c.name} ${c.finished ? '✓' : ''}</div>`)
    .join('');
}

function updateCamera(dt) {
  const behindDist = 11;
  const camHeight = 5.5;
  const wantX = player.position.x - Math.sin(player.heading) * behindDist;
  const wantZ = player.position.z - Math.cos(player.heading) * behindDist;
  const alpha = 1 - Math.exp(-5 * dt);
  camera.position.x += (wantX - camera.position.x) * alpha;
  camera.position.z += (wantZ - camera.position.z) * alpha;
  camera.position.y += (camHeight - camera.position.y) * alpha;
  camera.lookAt(
    player.position.x + Math.sin(player.heading) * 6,
    1.5,
    player.position.z + Math.cos(player.heading) * 6
  );
}

function drawCountdown() {
  let ov = document.getElementById('countdownOv');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'countdownOv';
    ov.style.cssText = `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      font-size:220px;font-weight:bold;color:#ffbe0b;text-shadow:6px 6px 20px #000;z-index:15;pointer-events:none;`;
    document.body.appendChild(ov);
  }
  if (countdown > 0) ov.textContent = countdown;
  else if (countdown === 0) ov.textContent = 'GO!';
  else ov.remove();
}

function endGame() {
  gameOver = true;
  const sorted = sortedCars();
  const pos = sorted.indexOf(player) + 1;
  const el = document.getElementById('finish');
  const title = document.getElementById('finishTitle');
  const result = document.getElementById('finishResult');
  el.style.display = 'flex';
  if (pos === 1) {
    title.textContent = 'VICTORY!';
    title.className = 'win';
    result.innerHTML = `You finished <b>1st</b> out of ${allCars.length}!`;
  } else {
    title.textContent = 'FINISHED';
    title.className = 'lose';
    result.innerHTML = `You finished <b>${pos}${ordinal(pos)}</b> out of ${allCars.length}`;
  }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());

  if (!raceStarted) {
    countdownTimer += dt;
    const prev = countdown;
    countdown = 3 - Math.floor(countdownTimer);
    if (countdown !== prev) drawCountdown();
    if (countdownTimer >= 4) {
      raceStarted = true;
      startTime = performance.now();
      drawCountdown(); // remove
    } else {
      drawCountdown();
    }
  }

  updatePlayer(dt);
  for (const n of npcs) updateNPC(n, dt);
  updateCarCollisions();
  updateLaps();
  updateCamera(dt);
  updateHUD();
  renderer.render(scene, camera);
}
