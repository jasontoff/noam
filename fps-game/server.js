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

const GAME_VERSION = '1.0.0';

// Game state
const players = {};
const bullets = [];
const TICK_RATE = 60;
const PLAYER_SPEED = 15;
const PLAYER_HEALTH = 100;
const PLAYER_RADIUS = 0.5;
const PLAYER_HEIGHT = 1.6;
const RESPAWN_TIME = 3000;

// Weapon definitions
const WEAPONS = {
  pistol: {
    name: 'Pistol',
    damage: 20,
    fireRate: 200,      // ms between shots
    bulletSpeed: 80,
    bulletLifetime: 2000,
    spread: 0,
    bulletsPerShot: 1,
    bulletSize: 0.08,
    bulletColor: 0xffff00,
  },
  shotgun: {
    name: 'Shotgun',
    damage: 12,
    fireRate: 800,
    bulletSpeed: 70,
    bulletLifetime: 1000,
    spread: 0.08,
    bulletsPerShot: 6,
    bulletSize: 0.06,
    bulletColor: 0xff8800,
  },
  sniper: {
    name: 'Sniper',
    damage: 75,
    fireRate: 1500,
    bulletSpeed: 150,
    bulletLifetime: 3000,
    spread: 0,
    bulletsPerShot: 1,
    bulletSize: 0.04,
    bulletColor: 0x00ffff,
  },
  minigun: {
    name: 'Minigun',
    damage: 8,
    fireRate: 80,
    bulletSpeed: 90,
    bulletLifetime: 1500,
    spread: 0.04,
    bulletsPerShot: 1,
    bulletSize: 0.05,
    bulletColor: 0xff4444,
  },
  rocket: {
    name: 'Rocket Launcher',
    damage: 40,
    fireRate: 1200,
    bulletSpeed: 40,
    bulletLifetime: 4000,
    spread: 0,
    bulletsPerShot: 1,
    bulletSize: 0.15,
    bulletColor: 0xff2200,
    explosive: true,
    explosionRadius: 4,
  },
  knife: {
    name: 'Knife',
    damage: 50,
    fireRate: 400,
    bulletSpeed: 0,
    bulletLifetime: 0,
    spread: 0,
    bulletsPerShot: 0,
    bulletSize: 0,
    bulletColor: 0xffffff,
    melee: true,
    meleeRange: 3,
  },
};

// Special abilities
const ABILITIES = {
  speed: {
    name: 'Speed Boots',
    description: 'Double speed for 5s',
    duration: 5000,
    cooldown: 20000,
  },
  shield: {
    name: 'Shield',
    description: 'Block damage for 4s',
    duration: 4000,
    cooldown: 25000,
  },
  wings: {
    name: 'Wings',
    description: 'Fly for 6s',
    duration: 6000,
    cooldown: 20000,
  },
  heal: {
    name: 'Heal',
    description: 'Restore full health',
    duration: 500,
    cooldown: 30000,
  },
};

// Map obstacles (boxes) - {x, y, z, w, h, d}  y = center height
const obstacles = [
  // Outer walls (tall)
  { x: 0, y: 3, z: -25, w: 50, h: 6, d: 1 },
  { x: 0, y: 3, z: 25, w: 50, h: 6, d: 1 },
  { x: -25, y: 3, z: 0, w: 1, h: 6, d: 50 },
  { x: 25, y: 3, z: 0, w: 1, h: 6, d: 50 },

  // === CENTER TOWER (multi-level) ===
  { x: 0, y: 1, z: 0, w: 5, h: 2, d: 5 },        // base platform (jumpable)
  { x: 0, y: 3, z: 0, w: 3, h: 2, d: 3 },          // upper platform

  // === CORNER FORTS (4 corners, each with cover + platform) ===
  // NW corner
  { x: -18, y: 0.5, z: -18, w: 5, h: 1, d: 5 },   // low platform
  { x: -18, y: 1.5, z: -20, w: 3, h: 1, d: 1 },   // step up
  { x: -20, y: 1.5, z: -18, w: 1, h: 3, d: 3 },   // wall cover
  // NE corner
  { x: 18, y: 0.5, z: -18, w: 5, h: 1, d: 5 },
  { x: 18, y: 1.5, z: -20, w: 3, h: 1, d: 1 },
  { x: 20, y: 1.5, z: -18, w: 1, h: 3, d: 3 },
  // SW corner
  { x: -18, y: 0.5, z: 18, w: 5, h: 1, d: 5 },
  { x: -18, y: 1.5, z: 20, w: 3, h: 1, d: 1 },
  { x: -20, y: 1.5, z: 18, w: 1, h: 3, d: 3 },
  // SE corner
  { x: 18, y: 0.5, z: 18, w: 5, h: 1, d: 5 },
  { x: 18, y: 1.5, z: 20, w: 3, h: 1, d: 1 },
  { x: 20, y: 1.5, z: 18, w: 1, h: 3, d: 3 },

  // === MID-LANE COVER (between center and corners) ===
  // North lane
  { x: -8, y: 0.75, z: -12, w: 2, h: 1.5, d: 4 },
  { x: 8, y: 0.75, z: -12, w: 2, h: 1.5, d: 4 },
  // South lane
  { x: -8, y: 0.75, z: 12, w: 2, h: 1.5, d: 4 },
  { x: 8, y: 0.75, z: 12, w: 2, h: 1.5, d: 4 },
  // East lane
  { x: 12, y: 0.75, z: -8, w: 4, h: 1.5, d: 2 },
  { x: 12, y: 0.75, z: 8, w: 4, h: 1.5, d: 2 },
  // West lane
  { x: -12, y: 0.75, z: -8, w: 4, h: 1.5, d: 2 },
  { x: -12, y: 0.75, z: 8, w: 4, h: 1.5, d: 2 },

  // === ELEVATED BRIDGES (connecting areas) ===
  { x: 0, y: 1.5, z: -8, w: 2, h: 0.3, d: 6 },   // north bridge
  { x: 0, y: 1.5, z: 8, w: 2, h: 0.3, d: 6 },     // south bridge
  { x: -8, y: 1.5, z: 0, w: 6, h: 0.3, d: 2 },    // west bridge
  { x: 8, y: 1.5, z: 0, w: 6, h: 0.3, d: 2 },     // east bridge

  // === SCATTERED SMALL COVER ===
  { x: -5, y: 0.5, z: -5, w: 1.5, h: 1, d: 1.5 },
  { x: 5, y: 0.5, z: -5, w: 1.5, h: 1, d: 1.5 },
  { x: -5, y: 0.5, z: 5, w: 1.5, h: 1, d: 1.5 },
  { x: 5, y: 0.5, z: 5, w: 1.5, h: 1, d: 1.5 },

  // === SNIPER PERCHES (tall thin pillars) ===
  { x: -15, y: 1.5, z: 0, w: 2, h: 3, d: 2 },
  { x: 15, y: 1.5, z: 0, w: 2, h: 3, d: 2 },
  { x: 0, y: 1.5, z: -15, w: 2, h: 3, d: 2 },
  { x: 0, y: 1.5, z: 15, w: 2, h: 3, d: 2 },

  // === STAIRCASE BLOCKS (step up to higher areas) ===
  // Steps leading to center from north
  { x: 0, y: 0.25, z: -5, w: 2, h: 0.5, d: 1 },
  { x: 0, y: 0.5, z: -4, w: 2, h: 1, d: 1 },
  // Steps from south
  { x: 0, y: 0.25, z: 5, w: 2, h: 0.5, d: 1 },
  { x: 0, y: 0.5, z: 4, w: 2, h: 1, d: 1 },

  // === LOW WALLS (crouch-height, can jump over) ===
  { x: -10, y: 0.4, z: -4, w: 6, h: 0.8, d: 0.5 },
  { x: 10, y: 0.4, z: 4, w: 6, h: 0.8, d: 0.5 },
  { x: -4, y: 0.4, z: 10, w: 0.5, h: 0.8, d: 6 },
  { x: 4, y: 0.4, z: -10, w: 0.5, h: 0.8, d: 6 },
];

const spawnPoints = [
  { x: -20, z: -20 },
  { x: 20, z: -20 },
  { x: -20, z: 20 },
  { x: 20, z: 20 },
  { x: 0, z: -20 },
  { x: 0, z: 20 },
];

function getSpawnPoint() {
  return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

// Healing potions
let activePotion = null;
const POTION_RESPAWN_TIME = 15000; // 15 seconds after pickup
const POTION_PICKUP_RADIUS = 1.5;
const potionLocations = [
  { x: 0, z: 0 }, { x: -10, z: -10 }, { x: 10, z: 10 },
  { x: -10, z: 10 }, { x: 10, z: -10 }, { x: 0, z: -12 },
  { x: 0, z: 12 }, { x: -15, z: 0 }, { x: 15, z: 0 },
];

function spawnPotion() {
  const loc = potionLocations[Math.floor(Math.random() * potionLocations.length)];
  activePotion = { x: loc.x, y: 0.5, z: loc.z, id: Date.now() };
  io.emit('potionSpawned', activePotion);
}

// Spawn first potion after 10 seconds
setTimeout(spawnPotion, 10000);

// Assign colors to players
const playerColors = [
  0xff4444, 0x44ff44, 0x4444ff, 0xffff44,
  0xff44ff, 0x44ffff, 0xff8844, 0x88ff44,
];
let colorIndex = 0;

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Send init data immediately so client can render the scene,
  // but don't create a player until they click play (setName).
  socket.emit('init', {
    id: socket.id,
    players: players,
    obstacles: obstacles,
    weapons: WEAPONS,
    abilities: ABILITIES,
    version: GAME_VERSION,
  });

  // Handle player joining the game (click play)
  socket.on('setName', (name) => {
    if (!players[socket.id]) {
      // First time joining — create player
      const spawn = getSpawnPoint();
      const color = playerColors[colorIndex % playerColors.length];
      colorIndex++;

      players[socket.id] = {
        id: socket.id,
        x: spawn.x,
        y: 1.6,
        z: spawn.z,
        rx: 0,
        ry: 0,
        health: PLAYER_HEALTH,
        color: color,
        kills: 0,
        deaths: 0,
        alive: true,
        name: (name || 'Player').substring(0, 20),
        weapon: 'pistol',
        gun: 'pistol',
        ability: 'speed',
        abilityActive: false,
        abilityLastUsed: 0,
        character: 'a',
      };
      socket.emit('yourPlayer', players[socket.id]);
      if (activePotion) socket.emit('potionSpawned', activePotion);
      socket.broadcast.emit('playerJoined', players[socket.id]);
    } else {
      // Returning from pause menu — just update name
      players[socket.id].name = (name || 'Player').substring(0, 20);
      io.emit('playerUpdated', players[socket.id]);
    }
  });

  // Handle character selection
  socket.on('selectCharacter', (charLetter) => {
    const valid = 'abcdefghijklmnopqr';
    if (players[socket.id] && valid.includes(charLetter)) {
      players[socket.id].character = charLetter;
      io.emit('playerUpdated', players[socket.id]);
    }
  });

  // Handle pause state
  socket.on('setPaused', (paused) => {
    if (players[socket.id]) {
      players[socket.id].paused = !!paused;
    }
  });

  // Handle player movement
  socket.on('move', (data) => {
    const player = players[socket.id];
    if (!player || !player.alive) return;

    player.x = data.x;
    player.y = data.y;
    player.z = data.z;
    player.rx = data.rx;
    player.ry = data.ry;
  });

  // Handle shooting
  socket.on('shoot', (data) => {
    const player = players[socket.id];
    if (!player || !player.alive) return;

    const weapon = WEAPONS[player.weapon] || WEAPONS.pistol;

    for (let s = 0; s < weapon.bulletsPerShot; s++) {
      // Apply spread
      const spreadX = (Math.random() - 0.5) * 2 * weapon.spread;
      const spreadY = (Math.random() - 0.5) * 2 * weapon.spread;
      const spreadZ = (Math.random() - 0.5) * 2 * weapon.spread;

      const bullet = {
        id: `${socket.id}-${Date.now()}-${Math.random()}`,
        ownerId: socket.id,
        x: data.x,
        y: data.y,
        z: data.z,
        dx: data.dx + spreadX,
        dy: data.dy + spreadY,
        dz: data.dz + spreadZ,
        createdAt: Date.now(),
        color: weapon.bulletColor,
        damage: weapon.damage,
        speed: weapon.bulletSpeed,
        lifetime: weapon.bulletLifetime,
        size: weapon.bulletSize,
        weaponType: player.weapon,
        explosive: weapon.explosive || false,
        explosionRadius: weapon.explosionRadius || 0,
      };
      bullets.push(bullet);
      io.emit('bulletCreated', bullet);
    }
  });

  // Handle weapon selection
  socket.on('selectWeapon', (weaponId) => {
    if (players[socket.id] && WEAPONS[weaponId]) {
      players[socket.id].weapon = weaponId;
      players[socket.id].gun = weaponId; // remember their gun choice
      io.emit('playerUpdated', players[socket.id]);
    }
  });

  // Switch between gun and knife
  socket.on('switchWeapon', (type) => {
    const p = players[socket.id];
    if (!p) return;
    if (type === 'knife') {
      p.weapon = 'knife';
    } else {
      p.weapon = p.gun || 'pistol';
    }
    io.emit('playerUpdated', p);
  });

  // Melee attack
  socket.on('melee', (data) => {
    const player = players[socket.id];
    if (!player || !player.alive) return;

    const weapon = WEAPONS.knife;
    // Check all players in front within melee range
    for (const id in players) {
      if (id === socket.id) continue;
      const p = players[id];
      if (!p.alive) continue;

      const dx = p.x - data.x;
      const dy = p.y - data.y;
      const dz = p.z - data.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist > weapon.meleeRange) continue;

      // Check if target is roughly in front (dot product with look direction)
      const toDist = Math.sqrt(dx * dx + dz * dz) || 1;
      const toX = dx / toDist;
      const toZ = dz / toDist;
      const dot = toX * data.dx + toZ * data.dz;

      if (dot > 0.3) { // roughly in front
        const dealt = applyDamage(p, weapon.damage);
        io.emit('playerHit', { playerId: id, health: p.health, shooterId: socket.id, blocked: dealt === 0, melee: true });
        if (p.health <= 0) {
          handleKill(id, socket.id);
        }
        break; // only hit one player per swing
      }
    }
  });

  socket.on('selectAbility', (abilityId) => {
    if (players[socket.id] && ABILITIES[abilityId]) {
      players[socket.id].ability = abilityId;
      io.emit('playerUpdated', players[socket.id]);
    }
  });

  socket.on('useAbility', () => {
    const player = players[socket.id];
    if (!player || !player.alive) return;

    const ability = ABILITIES[player.ability];
    if (!ability) return;

    const now = Date.now();
    if (now - player.abilityLastUsed < ability.cooldown) return; // still on cooldown

    player.abilityActive = true;
    player.abilityLastUsed = now;

    // Heal: restore full health immediately
    if (player.ability === 'heal') {
      player.health = PLAYER_HEALTH;
      io.emit('playerHit', { playerId: socket.id, health: player.health, shooterId: null, healed: true });
    }

    io.emit('abilityActivated', { playerId: socket.id, ability: player.ability, duration: ability.duration });

    setTimeout(() => {
      if (players[socket.id]) {
        players[socket.id].abilityActive = false;
        io.emit('abilityEnded', { playerId: socket.id });
      }
    }, ability.duration);
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// Handle a kill
// Apply damage with shield check. Returns actual damage dealt.
function applyDamage(player, dmg) {
  if (player.paused) return 0; // invincible while paused
  if (player.abilityActive && player.ability === 'shield') {
    return 0; // shield blocks all damage
  }
  player.health -= dmg;
  player.lastHitTime = Date.now();
  return dmg;
}

function handleKill(victimId, killerId) {
  const victim = players[victimId];
  if (!victim) return;
  victim.alive = false;
  victim.deaths++;
  if (players[killerId]) {
    players[killerId].kills++;
  }
  io.emit('playerKilled', {
    playerId: victimId,
    killerId: killerId,
    killerName: players[killerId]?.name || 'Unknown',
    victimName: victim.name,
  });

  // Respawn after delay
  setTimeout(() => {
    if (players[victimId]) {
      const sp = getSpawnPoint();
      players[victimId].x = sp.x;
      players[victimId].y = 1.6;
      players[victimId].z = sp.z;
      players[victimId].health = PLAYER_HEALTH;
      players[victimId].alive = true;
      players[victimId].weapon = players[victimId].weapon; // keep weapon
      io.emit('playerRespawned', players[victimId]);
    }
  }, RESPAWN_TIME);
}

// Game loop
setInterval(() => {
  const now = Date.now();

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const dt = 1 / TICK_RATE;
    const speed = b.speed || 80;

    b.x += b.dx * speed * dt;
    b.y += b.dy * speed * dt;
    b.z += b.dz * speed * dt;

    // Remove old bullets
    if (now - b.createdAt > (b.lifetime || 2000)) {
      // Rockets explode on expiry too
      if (b.explosive) {
        io.emit('explosion', { x: b.x, y: b.y, z: b.z, radius: b.explosionRadius });
        for (const eid in players) {
          const ep = players[eid];
          if (!ep.alive) continue;
          const edx = b.x - ep.x;
          const edy = b.y - ep.y;
          const edz = b.z - ep.z;
          const eDist = Math.sqrt(edx*edx + edy*edy + edz*edz);
          if (eDist < b.explosionRadius) {
            const falloff = 1 - (eDist / b.explosionRadius);
            const dmg = Math.round((b.damage || 40) * falloff);
            const dealt = applyDamage(ep, dmg);
            io.emit('playerHit', { playerId: eid, health: ep.health, shooterId: b.ownerId, blocked: dealt === 0 });
            if (ep.health <= 0) {
              handleKill(eid, b.ownerId);
            }
          }
        }
      }
      bullets.splice(i, 1);
      io.emit('bulletRemoved', b.id);
      continue;
    }

    // Check collision with obstacles
    let hitObstacle = false;
    for (const obs of obstacles) {
      if (
        b.x >= obs.x - obs.w / 2 && b.x <= obs.x + obs.w / 2 &&
        b.y >= obs.y - obs.h / 2 && b.y <= obs.y + obs.h / 2 &&
        b.z >= obs.z - obs.d / 2 && b.z <= obs.z + obs.d / 2
      ) {
        hitObstacle = true;
        break;
      }
    }
    if (hitObstacle) {
      // Rockets explode on obstacle hit
      if (b.explosive) {
        io.emit('explosion', { x: b.x, y: b.y, z: b.z, radius: b.explosionRadius });
        for (const eid in players) {
          const ep = players[eid];
          if (!ep.alive) continue;
          const edx = b.x - ep.x;
          const edy = b.y - ep.y;
          const edz = b.z - ep.z;
          const eDist = Math.sqrt(edx*edx + edy*edy + edz*edz);
          if (eDist < b.explosionRadius) {
            const falloff = 1 - (eDist / b.explosionRadius);
            const dmg = Math.round((b.damage || 50) * falloff);
            const dealt = applyDamage(ep, dmg);
            io.emit('playerHit', { playerId: eid, health: ep.health, shooterId: b.ownerId, blocked: dealt === 0 });
            if (ep.health <= 0) {
              handleKill(eid, b.ownerId);
            }
          }
        }
      }
      bullets.splice(i, 1);
      io.emit('bulletRemoved', b.id);
      continue;
    }

    // Check collision with players (cylinder hitbox: feet to head)
    for (const id in players) {
      if (id === b.ownerId) continue;
      const p = players[id];
      if (!p.alive) continue;

      // Horizontal distance (XZ plane)
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const horizDist = Math.sqrt(dx * dx + dz * dz);

      // Vertical check: player body from feet (y=0) to top of head (y=1.9)
      const playerFeetY = p.y - PLAYER_HEIGHT;
      const playerHeadY = p.y + 0.3;
      const inVerticalRange = b.y >= playerFeetY && b.y <= playerHeadY;

      if (horizDist < 0.6 && inVerticalRange) {
        const bulletDamage = b.damage || 20;
        bullets.splice(i, 1);
        io.emit('bulletRemoved', b.id);

        if (b.explosive) {
          // Explosion damages all nearby players
          io.emit('explosion', { x: b.x, y: b.y, z: b.z, radius: b.explosionRadius });
          for (const eid in players) {
            const ep = players[eid];
            if (!ep.alive) continue;
            const edx = b.x - ep.x;
            const edy = b.y - ep.y;
            const edz = b.z - ep.z;
            const eDist = Math.sqrt(edx*edx + edy*edy + edz*edz);
            if (eDist < b.explosionRadius) {
              const falloff = 1 - (eDist / b.explosionRadius);
              const dmg = Math.round(bulletDamage * falloff);
              ep.health -= dmg;
              io.emit('playerHit', { playerId: eid, health: ep.health, shooterId: b.ownerId });
              if (ep.health <= 0) {
                handleKill(eid, b.ownerId);
              }
            }
          }
        } else {
          const dealt = applyDamage(p, bulletDamage);
          io.emit('playerHit', { playerId: id, health: p.health, shooterId: b.ownerId, blocked: dealt === 0 });
          if (p.health <= 0) {
            handleKill(id, b.ownerId);
          }
        }
        break;
      }
    }
  }

  // Check potion pickup
  if (activePotion) {
    for (const id in players) {
      const p = players[id];
      if (!p.alive || p.paused) continue;
      const dx = p.x - activePotion.x;
      const dz = p.z - activePotion.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < POTION_PICKUP_RADIUS) {
        p.health = PLAYER_HEALTH;
        io.emit('potionPickedUp', { playerId: id, potionId: activePotion.id });
        io.emit('playerHit', { playerId: id, health: p.health, shooterId: null, healed: true });
        activePotion = null;
        // Respawn after delay
        setTimeout(spawnPotion, POTION_RESPAWN_TIME);
        break;
      }
    }
  }

  // Passive health regen: heal 2 HP per tick if not hit for 5 seconds
  const REGEN_DELAY = 5000;
  const REGEN_AMOUNT = 2;
  for (const id in players) {
    const p = players[id];
    if (!p.alive || p.paused) continue;
    if (p.health < PLAYER_HEALTH && (!p.lastHitTime || now - p.lastHitTime > REGEN_DELAY)) {
      p.health = Math.min(PLAYER_HEALTH, p.health + REGEN_AMOUNT);
    }
  }

  // Broadcast game state
  io.emit('gameState', { players });
}, 1000 / TICK_RATE);

// Get local IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('');
  console.log('=================================');
  console.log('   FPS GAME SERVER RUNNING');
  console.log('=================================');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${localIP}:${PORT}`);
  console.log('');
  console.log('  Share the Network URL with');
  console.log('  the other player on your LAN!');
  console.log('=================================');
  console.log('');
});
