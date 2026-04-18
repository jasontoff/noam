(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const TILE = 40;
  const COLS = W / TILE;
  const ROWS = H / TILE;

  // Path defined as waypoints (center of tiles). Enemies travel through these.
  // Winding path from left to right.
  const PATH = [
    { x: -20, y: 100 },
    { x: 180, y: 100 },
    { x: 180, y: 300 },
    { x: 380, y: 300 },
    { x: 380, y: 140 },
    { x: 580, y: 140 },
    { x: 580, y: 460 },
    { x: 300, y: 460 },
    { x: 300, y: 560 },
    { x: 780, y: 560 },
    { x: 780, y: 260 },
    { x: 920, y: 260 },
  ];

  // Precompute blocked tiles from path segments (so towers cannot be placed on the path)
  const pathTiles = new Set();
  const PATH_RADIUS = 28; // radius around path considered "blocked"
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const steps = Math.ceil(len / 4);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      // Block tiles within radius
      const cx = Math.floor(px / TILE);
      const cy = Math.floor(py / TILE);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const tx = cx + ox, ty = cy + oy;
          // Check if tile center close enough
          const tcx = tx * TILE + TILE / 2;
          const tcy = ty * TILE + TILE / 2;
          if (Math.hypot(tcx - px, tcy - py) < PATH_RADIUS + TILE / 2) {
            pathTiles.add(tx + ',' + ty);
          }
        }
      }
    }
  }

  // ---------- Tower Types ----------
  const TOWER_TYPES = {
    arrow: {
      name: 'Arrow Tower',
      cost: 50,
      range: 130,
      damage: 12,
      fireRate: 0.6, // seconds per shot
      color: '#8bc34a',
      outline: '#4a6b1f',
      bulletColor: '#fff',
      bulletSpeed: 520,
      desc: 'Fast, single target',
      aoe: 0,
    },
    cannon: {
      name: 'Cannon',
      cost: 120,
      range: 140,
      damage: 40,
      fireRate: 1.4,
      color: '#ff9800',
      outline: '#7a4000',
      bulletColor: '#ffcc80',
      bulletSpeed: 340,
      desc: 'Splash damage',
      aoe: 55,
    },
    frost: {
      name: 'Frost Tower',
      cost: 80,
      range: 120,
      damage: 4,
      fireRate: 0.5,
      color: '#4fc3f7',
      outline: '#014a6e',
      bulletColor: '#b3e5fc',
      bulletSpeed: 420,
      desc: 'Slows enemies',
      aoe: 0,
      slow: 0.45, // reduce speed to 45%
      slowDuration: 1.4,
    },
    laser: {
      name: 'Laser Tower',
      cost: 180,
      range: 160,
      damage: 50, // damage per second (continuous)
      fireRate: 0, // continuous
      color: '#e040fb',
      outline: '#4a148c',
      bulletColor: '#ff80ff',
      bulletSpeed: 0,
      desc: 'Continuous beam',
      aoe: 0,
      continuous: true,
    },
    sniper: {
      name: 'Sniper',
      cost: 200,
      range: 320,
      damage: 90,
      fireRate: 1.8,
      color: '#ef5350',
      outline: '#4a0000',
      bulletColor: '#fff',
      bulletSpeed: 900,
      desc: 'Huge range, high damage',
      aoe: 0,
    },
  };

  // ---------- Enemy Types ----------
  const ENEMY_TYPES = {
    grunt: { hp: 40, speed: 60, reward: 8, damage: 1, color: '#c0392b', radius: 11, name: 'Grunt' },
    fast:  { hp: 22, speed: 120, reward: 10, damage: 1, color: '#f1c40f', radius: 9, name: 'Fast' },
    tank:  { hp: 180, speed: 35, reward: 22, damage: 3, color: '#34495e', radius: 15, name: 'Tank' },
    swarm: { hp: 15, speed: 90, reward: 4, damage: 1, color: '#9b59b6', radius: 7, name: 'Swarm' },
    boss:  { hp: 900, speed: 28, reward: 120, damage: 10, color: '#111', radius: 20, name: 'Boss' },
  };

  // ---------- Wave Generator ----------
  function buildWave(n) {
    // n is 1-indexed wave number.
    const wave = [];
    const push = (type, count, delay) => {
      for (let i = 0; i < count; i++) {
        wave.push({ type, delay: delay * i });
      }
      return wave.length ? wave[wave.length - 1].delay : 0;
    };

    let t = 0;
    const schedule = (type, count, interval) => {
      for (let i = 0; i < count; i++) {
        wave.push({ type, delay: t + interval * i });
      }
      t += interval * count;
    };

    const hpScale = 1 + (n - 1) * 0.15;

    if (n === 1) { schedule('grunt', 6, 0.9); }
    else if (n === 2) { schedule('grunt', 10, 0.7); }
    else if (n === 3) { schedule('grunt', 6, 0.8); schedule('fast', 4, 0.5); }
    else if (n === 4) { schedule('swarm', 12, 0.35); }
    else if (n === 5) { schedule('grunt', 8, 0.7); schedule('tank', 2, 2.5); }
    else if (n === 6) { schedule('fast', 10, 0.45); schedule('grunt', 6, 0.6); }
    else if (n === 7) { schedule('tank', 4, 2.0); schedule('swarm', 10, 0.3); }
    else if (n === 8) { schedule('grunt', 10, 0.55); schedule('fast', 6, 0.4); schedule('tank', 2, 1.8); }
    else if (n === 9) { schedule('swarm', 20, 0.3); schedule('fast', 6, 0.5); }
    else if (n === 10) { schedule('boss', 1, 0); schedule('grunt', 10, 0.8); }
    else {
      // Procedural for later waves, scaling up.
      const budget = 50 + n * 12;
      let remaining = budget;
      while (remaining > 0) {
        const r = Math.random();
        if (r < 0.35) { schedule('grunt', 1, 0.45); remaining -= 3; }
        else if (r < 0.6) { schedule('fast', 1, 0.35); remaining -= 3; }
        else if (r < 0.8) { schedule('swarm', 1, 0.3); remaining -= 2; }
        else if (r < 0.95) { schedule('tank', 1, 1.4); remaining -= 8; }
        else { schedule('boss', 1, 2.5); remaining -= 25; }
      }
    }

    return wave.map(e => ({ type: e.type, delay: e.delay, hpMul: hpScale }));
  }

  // ---------- Game State ----------
  const state = {
    lives: 20,
    gold: 150,
    wave: 0,
    score: 0,
    towers: [],
    enemies: [],
    projectiles: [],
    effects: [],
    spawnQueue: [],
    waveActive: false,
    gameOver: false,
    selectedType: null,
    selectedTower: null,
    mouse: { x: 0, y: 0, on: false },
    time: 0,
  };

  // ---------- UI: tower buttons ----------
  const towerList = document.getElementById('tower-list');
  const btnElems = {};
  for (const [key, t] of Object.entries(TOWER_TYPES)) {
    const btn = document.createElement('div');
    btn.className = 'tower-btn';
    btn.innerHTML = `
      <div class="tower-icon" style="background:${t.color};border:2px solid ${t.outline}"></div>
      <div class="tower-info">
        <div class="tower-name">${t.name}</div>
        <div class="tower-desc">${t.desc}</div>
        <div class="tower-cost">${t.cost} gold</div>
      </div>
    `;
    btn.addEventListener('click', () => selectType(key));
    towerList.appendChild(btn);
    btnElems[key] = btn;
  }

  function selectType(key) {
    if (state.selectedType === key) {
      state.selectedType = null;
    } else {
      state.selectedType = key;
      state.selectedTower = null;
    }
    updateUI();
  }

  const livesEl = document.getElementById('lives');
  const goldEl = document.getElementById('gold');
  const waveEl = document.getElementById('wave');
  const scoreEl = document.getElementById('score');
  const waveBtn = document.getElementById('wave-btn');
  const messageEl = document.getElementById('message');

  function updateUI() {
    livesEl.textContent = state.lives;
    goldEl.textContent = state.gold;
    waveEl.textContent = state.wave;
    scoreEl.textContent = state.score;
    for (const [key, btn] of Object.entries(btnElems)) {
      btn.classList.toggle('selected', state.selectedType === key);
      btn.classList.toggle('disabled', state.gold < TOWER_TYPES[key].cost);
    }
    waveBtn.disabled = state.waveActive || state.gameOver;
    waveBtn.textContent = state.waveActive ? 'WAVE IN PROGRESS' : `START WAVE ${state.wave + 1}`;
  }

  function showMessage(text, ms = 1600) {
    messageEl.textContent = text;
    messageEl.classList.add('show');
    clearTimeout(showMessage._t);
    showMessage._t = setTimeout(() => messageEl.classList.remove('show'), ms);
  }

  waveBtn.addEventListener('click', startNextWave);

  function startNextWave() {
    if (state.waveActive || state.gameOver) return;
    state.wave += 1;
    const w = buildWave(state.wave);
    state.spawnQueue = w.map(e => ({ ...e, absTime: state.time + e.delay }));
    state.waveActive = true;
    showMessage(`Wave ${state.wave} incoming!`);
    updateUI();
  }

  // ---------- Input ----------
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    state.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    state.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    state.mouse.on = true;
  });
  canvas.addEventListener('mouseleave', () => { state.mouse.on = false; });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // Sell tower under cursor
    const t = findTowerAt(state.mouse.x, state.mouse.y);
    if (t) {
      const refund = Math.floor(TOWER_TYPES[t.type].cost * 0.5);
      state.gold += refund;
      state.towers = state.towers.filter(x => x !== t);
      if (state.selectedTower === t) state.selectedTower = null;
      showMessage(`Sold for ${refund} gold`);
      updateUI();
    }
  });

  canvas.addEventListener('click', (e) => {
    if (state.gameOver) return;
    const mx = state.mouse.x, my = state.mouse.y;

    // Priority: if a type is selected, try to place
    if (state.selectedType) {
      tryPlaceTower(mx, my);
      return;
    }

    // Otherwise try to select an existing tower
    const t = findTowerAt(mx, my);
    state.selectedTower = t || null;
    state.selectedType = null;
    updateUI();
  });

  function findTowerAt(x, y) {
    for (const t of state.towers) {
      if (Math.hypot(t.x - x, t.y - y) < 20) return t;
    }
    return null;
  }

  function tryPlaceTower(x, y) {
    const type = state.selectedType;
    if (!type) return;
    const def = TOWER_TYPES[type];
    if (state.gold < def.cost) {
      showMessage('Not enough gold!');
      return;
    }
    // Snap to tile
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const tileKey = tx + ',' + ty;
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return;
    if (pathTiles.has(tileKey)) {
      showMessage("Can't build on the path!");
      return;
    }
    // Check if another tower already on that tile
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    for (const t of state.towers) {
      if (t.tileX === tx && t.tileY === ty) {
        showMessage('Tower already here');
        return;
      }
    }
    state.gold -= def.cost;
    state.towers.push({
      type,
      x: cx,
      y: cy,
      tileX: tx,
      tileY: ty,
      cooldown: 0,
      angle: 0,
      beamTarget: null,
    });
    updateUI();
  }

  // ---------- Spawning enemies ----------
  function spawnEnemy(type, hpMul) {
    const def = ENEMY_TYPES[type];
    state.enemies.push({
      type,
      x: PATH[0].x,
      y: PATH[0].y,
      hp: def.hp * hpMul,
      maxHp: def.hp * hpMul,
      speed: def.speed,
      baseSpeed: def.speed,
      damage: def.damage,
      reward: def.reward,
      radius: def.radius,
      color: def.color,
      pathIdx: 1,
      slowTimer: 0,
      slowFactor: 1,
      alive: true,
    });
  }

  // ---------- Update ----------
  function update(dt) {
    if (state.gameOver) return;
    state.time += dt;

    // Spawn from queue
    while (state.spawnQueue.length && state.spawnQueue[0].absTime <= state.time) {
      const s = state.spawnQueue.shift();
      spawnEnemy(s.type, s.hpMul);
    }

    // Update enemies
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) {
          e.slowFactor = 1;
        }
      }
      const target = PATH[e.pathIdx];
      if (!target) {
        // Reached end
        e.alive = false;
        state.lives -= e.damage;
        if (state.lives <= 0) {
          state.lives = 0;
          triggerGameOver();
        }
        updateUI();
        continue;
      }
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy);
      const step = e.baseSpeed * e.slowFactor * dt;
      if (d <= step) {
        e.x = target.x;
        e.y = target.y;
        e.pathIdx++;
      } else {
        e.x += (dx / d) * step;
        e.y += (dy / d) * step;
      }
    }

    // Update towers (targeting & firing)
    for (const t of state.towers) {
      const def = TOWER_TYPES[t.type];
      t.cooldown = Math.max(0, t.cooldown - dt);

      // Find target: enemy furthest along the path within range
      let target = null;
      let bestProgress = -1;
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - t.x, e.y - t.y);
        if (d <= def.range) {
          // "Progress" = path index + (1 - remaining distance to next waypoint)
          const tgt = PATH[e.pathIdx] || PATH[PATH.length - 1];
          const rem = Math.hypot(tgt.x - e.x, tgt.y - e.y);
          const prog = e.pathIdx * 1000 - rem;
          if (prog > bestProgress) {
            bestProgress = prog;
            target = e;
          }
        }
      }

      if (target) {
        t.angle = Math.atan2(target.y - t.y, target.x - t.x);
        if (def.continuous) {
          // Laser: instant damage per frame
          target.hp -= def.damage * dt;
          t.beamTarget = target;
          if (target.hp <= 0) killEnemy(target);
        } else if (t.cooldown <= 0) {
          fireProjectile(t, def, target);
          t.cooldown = def.fireRate;
        } else {
          t.beamTarget = null;
        }
      } else {
        t.beamTarget = null;
      }
    }

    // Update projectiles
    for (const p of state.projectiles) {
      if (!p.alive) continue;
      if (p.target && p.target.alive) {
        // Homing
        const dx = p.target.x - p.x, dy = p.target.y - p.y;
        const d = Math.hypot(dx, dy);
        const step = p.speed * dt;
        if (d <= step) {
          // Hit
          hitEnemy(p, p.target);
          p.alive = false;
        } else {
          p.x += (dx / d) * step;
          p.y += (dy / d) * step;
        }
      } else {
        // Target dead; continue in last direction briefly
        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt;
        p.ttl -= dt;
        if (p.ttl <= 0) p.alive = false;
        // Check if we hit any enemy along the way
        for (const e of state.enemies) {
          if (!e.alive) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) < e.radius) {
            hitEnemy(p, e);
            p.alive = false;
            break;
          }
        }
      }
    }
    state.projectiles = state.projectiles.filter(p => p.alive);

    // Update effects
    for (const ef of state.effects) ef.t -= dt;
    state.effects = state.effects.filter(ef => ef.t > 0);

    // Clean up enemies
    state.enemies = state.enemies.filter(e => e.alive);

    // Wave over?
    if (state.waveActive && state.spawnQueue.length === 0 && state.enemies.length === 0) {
      state.waveActive = false;
      const bonus = 20 + state.wave * 5;
      state.gold += bonus;
      state.score += 100 * state.wave;
      showMessage(`Wave ${state.wave} cleared! +${bonus} gold`);
      updateUI();
    }
  }

  function fireProjectile(tower, def, target) {
    const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    state.projectiles.push({
      x: tower.x,
      y: tower.y,
      angle,
      speed: def.bulletSpeed,
      color: def.bulletColor,
      damage: def.damage,
      aoe: def.aoe,
      slow: def.slow,
      slowDuration: def.slowDuration,
      target,
      type: tower.type,
      ttl: 1.5,
      alive: true,
    });
  }

  function hitEnemy(proj, enemy) {
    if (proj.aoe > 0) {
      // AoE: damage all within radius
      state.effects.push({
        kind: 'explosion',
        x: proj.x,
        y: proj.y,
        r: proj.aoe,
        t: 0.3,
        max: 0.3,
      });
      for (const e of state.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - proj.x, e.y - proj.y) <= proj.aoe) {
          e.hp -= proj.damage;
          if (e.hp <= 0) killEnemy(e);
        }
      }
    } else {
      enemy.hp -= proj.damage;
      if (proj.slow) {
        enemy.slowFactor = proj.slow;
        enemy.slowTimer = proj.slowDuration;
      }
      if (enemy.hp <= 0) killEnemy(enemy);
    }
  }

  function killEnemy(enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    state.gold += enemy.reward;
    state.score += enemy.reward * 2;
    state.effects.push({
      kind: 'pop',
      x: enemy.x,
      y: enemy.y,
      r: enemy.radius + 4,
      t: 0.25,
      max: 0.25,
      color: enemy.color,
    });
    updateUI();
  }

  function triggerGameOver() {
    state.gameOver = true;
    document.getElementById('gameover-text').textContent =
      `You survived ${state.wave - (state.waveActive ? 1 : 0)} waves. Final score: ${state.score}`;
    document.getElementById('gameover').style.display = 'block';
  }

  // ---------- Rendering ----------
  function drawMap() {
    // Grid background (grassy with tile variation)
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const key = x + ',' + y;
        if (pathTiles.has(key)) continue;
        const shade = ((x * 13 + y * 7) % 5);
        ctx.fillStyle = ['#3a4d1e','#42551f','#3e5020','#4a5b22','#455722'][shade];
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Draw path
    ctx.strokeStyle = '#a07a3e';
    ctx.lineWidth = 44;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    ctx.strokeStyle = '#c19a5e';
    ctx.lineWidth = 38;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    // Dashed center line
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Spawn and base markers
    const start = PATH[0], end = PATH[PATH.length - 1];
    // Spawn portal
    ctx.fillStyle = '#4a148c';
    ctx.beginPath();
    ctx.arc(20, start.y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ce93d8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Base / tower to defend
    ctx.fillStyle = '#37474f';
    ctx.fillRect(end.x - 30, end.y - 30, 60, 60);
    ctx.fillStyle = '#607d8b';
    ctx.fillRect(end.x - 24, end.y - 24, 48, 48);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(end.x - 10, end.y - 30, 8, 14);
    // Flag
    ctx.beginPath();
    ctx.moveTo(end.x - 10, end.y - 30);
    ctx.lineTo(end.x + 8, end.y - 26);
    ctx.lineTo(end.x - 10, end.y - 22);
    ctx.closePath();
    ctx.fill();
  }

  function drawTower(t, preview = false) {
    const def = TOWER_TYPES[t.type];
    // Base
    ctx.fillStyle = preview ? 'rgba(255,255,255,0.3)' : '#263043';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = def.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Top
    ctx.fillStyle = def.color;
    if (preview) ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Barrel
    if (!preview) {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle);
      ctx.fillStyle = def.outline;
      ctx.fillRect(0, -3, 20, 6);
      ctx.restore();
    }
  }

  function drawRange(t, def) {
    ctx.strokeStyle = 'rgba(255,224,130,0.5)';
    ctx.fillStyle = 'rgba(255,224,130,0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, def.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawEnemy(e) {
    const def = ENEMY_TYPES[e.type];
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Slow indicator
    if (e.slowFactor < 1) {
      ctx.strokeStyle = '#4fc3f7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // HP bar
    const hpPct = e.hp / e.maxHp;
    const bw = e.radius * 2 + 6;
    ctx.fillStyle = '#000';
    ctx.fillRect(e.x - bw / 2, e.y - e.radius - 8, bw, 4);
    ctx.fillStyle = hpPct > 0.5 ? '#4caf50' : hpPct > 0.25 ? '#ffeb3b' : '#f44336';
    ctx.fillRect(e.x - bw / 2, e.y - e.radius - 8, bw * hpPct, 4);

    // Boss crown
    if (e.type === 'boss') {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(e.x - 10, e.y - e.radius - 12);
      ctx.lineTo(e.x - 5, e.y - e.radius - 20);
      ctx.lineTo(e.x, e.y - e.radius - 14);
      ctx.lineTo(e.x + 5, e.y - e.radius - 20);
      ctx.lineTo(e.x + 10, e.y - e.radius - 12);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawProjectile(p) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEffects() {
    for (const ef of state.effects) {
      const a = ef.t / ef.max;
      if (ef.kind === 'explosion') {
        ctx.fillStyle = `rgba(255,150,50,${a * 0.6})`;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, ef.r * (1 - a * 0.3), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,200,100,${a})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (ef.kind === 'pop') {
        ctx.fillStyle = ef.color;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, ef.r * (1 - a) + ef.r * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawBeams() {
    for (const t of state.towers) {
      if (t.beamTarget && t.beamTarget.alive) {
        const def = TOWER_TYPES[t.type];
        ctx.strokeStyle = def.bulletColor;
        ctx.lineWidth = 3;
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.beamTarget.x, t.beamTarget.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  }

  function drawPreview() {
    if (!state.mouse.on) return;
    if (!state.selectedType) return;
    const def = TOWER_TYPES[state.selectedType];
    const tx = Math.floor(state.mouse.x / TILE);
    const ty = Math.floor(state.mouse.y / TILE);
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const key = tx + ',' + ty;
    const blocked = pathTiles.has(key) ||
                    tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ||
                    state.towers.some(t => t.tileX === tx && t.tileY === ty);
    const canAfford = state.gold >= def.cost;
    const valid = !blocked && canAfford;

    // Tile highlight
    ctx.fillStyle = valid ? 'rgba(129,199,132,0.4)' : 'rgba(244,67,54,0.4)';
    ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);

    // Range circle
    ctx.strokeStyle = valid ? 'rgba(255,224,130,0.7)' : 'rgba(244,67,54,0.7)';
    ctx.fillStyle = valid ? 'rgba(255,224,130,0.08)' : 'rgba(244,67,54,0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, def.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tower preview
    drawTower({ x: cx, y: cy, type: state.selectedType, angle: 0 }, true);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawMap();

    // Draw range for selected tower
    if (state.selectedTower) {
      drawRange(state.selectedTower, TOWER_TYPES[state.selectedTower.type]);
    }

    for (const t of state.towers) drawTower(t);
    for (const e of state.enemies) drawEnemy(e);
    drawBeams();
    for (const p of state.projectiles) drawProjectile(p);
    drawEffects();
    drawPreview();
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  updateUI();
  requestAnimationFrame(loop);
})();
