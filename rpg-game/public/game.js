// === Crypts & Loot — a tiny single-player RPG ===

const ZONES = [
  { id: 'forest',  name: 'Whispering Forest',  sub: 'Lv 1–3',  minLvl: 1,  enemyLvl: [1, 3],  unlock: 1 },
  { id: 'caves',   name: 'Moss Caves',         sub: 'Lv 3–6',  minLvl: 3,  enemyLvl: [3, 6],  unlock: 3 },
  { id: 'ruins',   name: 'Sunken Ruins',       sub: 'Lv 6–10', minLvl: 6,  enemyLvl: [6, 10], unlock: 6 },
  { id: 'keep',    name: 'Iron Keep',          sub: 'Lv 10–15',minLvl: 10, enemyLvl: [10,15], unlock: 10 },
  { id: 'abyss',   name: 'The Abyss',          sub: 'Lv 15+',  minLvl: 15, enemyLvl: [15,25], unlock: 15 },
];

const ENEMY_POOL = {
  forest: [
    { name: 'Goblin',      sprite: '👹', hpMult: 1.0, atkMult: 1.0 },
    { name: 'Forest Wolf', sprite: '🐺', hpMult: 0.8, atkMult: 1.2 },
    { name: 'Giant Spider',sprite: '🕷', hpMult: 0.9, atkMult: 1.1 },
    { name: 'Bandit',      sprite: '🗡', hpMult: 1.1, atkMult: 1.0 },
  ],
  caves: [
    { name: 'Cave Troll',  sprite: '👺', hpMult: 1.4, atkMult: 1.1 },
    { name: 'Bat Swarm',   sprite: '🦇', hpMult: 0.7, atkMult: 1.4 },
    { name: 'Kobold',      sprite: '🦎', hpMult: 1.0, atkMult: 1.1 },
    { name: 'Slime',       sprite: '🟢', hpMult: 1.6, atkMult: 0.8 },
  ],
  ruins: [
    { name: 'Skeleton',    sprite: '💀', hpMult: 1.0, atkMult: 1.2 },
    { name: 'Ghost',       sprite: '👻', hpMult: 0.9, atkMult: 1.3 },
    { name: 'Mummy',       sprite: '🧟', hpMult: 1.3, atkMult: 1.1 },
    { name: 'Cultist',     sprite: '🧙‍♂️', hpMult: 1.1, atkMult: 1.2 },
  ],
  keep: [
    { name: 'Dark Knight', sprite: '🗡️', hpMult: 1.5, atkMult: 1.3 },
    { name: 'Warlock',     sprite: '🧛', hpMult: 1.2, atkMult: 1.4 },
    { name: 'Ogre',        sprite: '👿', hpMult: 1.7, atkMult: 1.2 },
    { name: 'Gargoyle',    sprite: '🦇', hpMult: 1.3, atkMult: 1.3 },
  ],
  abyss: [
    { name: 'Dragon',      sprite: '🐉', hpMult: 2.2, atkMult: 1.5 },
    { name: 'Lich',        sprite: '💀', hpMult: 1.6, atkMult: 1.8 },
    { name: 'Abyssal Horror', sprite: '👁', hpMult: 2.0, atkMult: 1.6 },
    { name: 'Demon Lord',  sprite: '😈', hpMult: 2.4, atkMult: 1.7 },
  ],
};

const WEAPON_NAMES = {
  common:    ['Rusty Sword', 'Wooden Club', 'Iron Dagger'],
  uncommon:  ['Steel Sword', 'War Axe', 'Bronze Mace'],
  rare:      ['Runed Blade', 'Silver Rapier', 'Warhammer'],
  epic:      ['Flameforged Greatsword', 'Soulreaver', 'Frostfang'],
  legendary: ['Dragonslayer', 'Worldender', 'Oblivion'],
};
const ARMOR_NAMES = {
  common:    ['Leather Vest', 'Padded Robes', 'Hide Cloak'],
  uncommon:  ['Chainmail', 'Scale Vest', 'Studded Leather'],
  rare:      ['Plate Cuirass', 'Runed Mail', 'Mithril Vest'],
  epic:      ['Dragonscale', 'Shadowplate', 'Aegis of Dawn'],
  legendary: ['Godforged Plate', 'Eternal Aegis', 'Worldshell'],
};
const TRINKET_NAMES = {
  common:    ['Lucky Coin', 'Wooden Charm', 'Glass Pendant'],
  uncommon:  ['Silver Ring', 'Amber Amulet', 'Hawk Feather'],
  rare:      ['Gem of Striking', 'Band of Steel', 'Crit Sigil'],
  epic:      ['Eye of Fury', 'Stormcaller Ring', 'Void Pendant'],
  legendary: ['Heart of the World', 'Godslayer Sigil', 'Fatebinder'],
};

const RARITY_COLORS = { common:'common', uncommon:'uncommon', rare:'rare', epic:'epic', legendary:'legendary' };
const RARITY_MULT   = { common:1.0, uncommon:1.6, rare:2.5, epic:4.0, legendary:6.5 };

// --- Player state ---
const player = {
  name: 'Hero',
  level: 1,
  xp: 0,
  hp: 20,
  maxHp: 20,
  baseAtk: 5,
  baseDef: 2,
  baseCrit: 0.05,
  gold: 0,
  potions: 3,
  weapon: null,
  armor: null,
  trinket: null,
  inventory: [],
  defending: false,
  currentZone: 'forest',
};

let enemy = null;
let inBattle = false;
let gameBusy = false;

// --- Utilities ---
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const $ = id => document.getElementById(id);

function xpForLevel(lvl) { return 10 + (lvl - 1) * 8 + Math.floor(Math.pow(lvl, 1.7)); }

function totalAtk() {
  return player.baseAtk
    + (player.weapon?.atk || 0)
    + (player.armor?.atk || 0)
    + (player.trinket?.atk || 0);
}
function totalDef() {
  return player.baseDef
    + (player.weapon?.def || 0)
    + (player.armor?.def || 0)
    + (player.trinket?.def || 0);
}
function totalCrit() {
  return player.baseCrit
    + (player.weapon?.crit || 0)
    + (player.armor?.crit || 0)
    + (player.trinket?.crit || 0);
}

// --- Log ---
function log(msg, cls = '') {
  const el = $('log');
  const line = document.createElement('div');
  line.className = 'line' + (cls ? ' ' + cls : '');
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  while (el.children.length > 120) el.removeChild(el.firstChild);
}

// --- Enemy generation ---
function spawnEnemy() {
  const zone = ZONES.find(z => z.id === player.currentZone);
  const pool = ENEMY_POOL[zone.id];
  const template = pool[rand(0, pool.length - 1)];
  const lvl = rand(zone.enemyLvl[0], zone.enemyLvl[1]);
  const hp = Math.round((10 + lvl * 6) * template.hpMult);
  const atk = Math.round((3 + lvl * 1.6) * template.atkMult);
  const def = Math.round(lvl * 0.6);
  enemy = {
    name: template.name,
    sprite: template.sprite,
    level: lvl,
    hp, maxHp: hp,
    atk, def,
    xpReward: Math.round(6 + lvl * 4 * template.hpMult),
    goldReward: rand(Math.max(1, lvl), lvl * 4),
  };
}

// --- Loot generation ---
function rollRarity(enemyLvl) {
  const r = Math.random() + enemyLvl * 0.005;
  if (r > 0.98) return 'legendary';
  if (r > 0.90) return 'epic';
  if (r > 0.72) return 'rare';
  if (r > 0.45) return 'uncommon';
  return 'common';
}

function generateItem(enemyLvl) {
  const slot = ['weapon', 'armor', 'trinket'][rand(0, 2)];
  const rarity = rollRarity(enemyLvl);
  const mult = RARITY_MULT[rarity];
  const base = Math.max(1, Math.round(enemyLvl * 1.1 * mult));
  const item = { slot, rarity, level: enemyLvl, atk: 0, def: 0, crit: 0 };
  let names;
  if (slot === 'weapon') {
    item.atk = base;
    if (rarity !== 'common' && Math.random() < 0.35) item.crit = +(0.03 + Math.random() * 0.05 * mult).toFixed(2);
    names = WEAPON_NAMES;
  } else if (slot === 'armor') {
    item.def = Math.max(1, Math.round(base * 0.75));
    if (Math.random() < 0.25 && rarity !== 'common') item.atk = Math.max(1, Math.round(base * 0.2));
    names = ARMOR_NAMES;
  } else {
    const r = Math.random();
    if (r < 0.33) item.atk = Math.max(1, Math.round(base * 0.4));
    else if (r < 0.66) item.def = Math.max(1, Math.round(base * 0.4));
    else item.crit = +(0.04 + Math.random() * 0.06 * mult).toFixed(2);
    names = TRINKET_NAMES;
  }
  const pool = names[rarity];
  item.name = pool[rand(0, pool.length - 1)];
  return item;
}

function itemPower(it) { return (it.atk||0) + (it.def||0)*1.2 + (it.crit||0)*40; }
function sellValue(it) { return Math.max(1, Math.round(itemPower(it) * 3 * RARITY_MULT[it.rarity])); }
function describeItem(it) {
  const parts = [];
  if (it.atk) parts.push(`+${it.atk} ATK`);
  if (it.def) parts.push(`+${it.def} DEF`);
  if (it.crit) parts.push(`+${Math.round(it.crit*100)}% CRIT`);
  return parts.join(' · ');
}

// --- UI rendering ---
function renderStats() {
  $('s-level').textContent = player.level;
  $('s-hp').textContent = `${player.hp} / ${player.maxHp}`;
  $('s-atk').textContent = totalAtk();
  $('s-def').textContent = totalDef();
  $('s-crit').textContent = `${Math.round(totalCrit()*100)}%`;
  $('s-gold').textContent = player.gold;
  $('s-pots').textContent = player.potions;
  $('player-name').textContent = player.name;
  $('player-sub').textContent = `Lv ${player.level}`;
  $('player-hp-bar').style.width = `${Math.max(0, player.hp/player.maxHp*100)}%`;
  $('player-hp-label').textContent = `HP ${player.hp}/${player.maxHp}`;
  const need = xpForLevel(player.level);
  $('player-xp-bar').style.width = `${Math.min(100, player.xp/need*100)}%`;
  $('player-xp-label').textContent = `XP ${player.xp}/${need}`;
}

function renderEnemy() {
  const el = $('enemy-battler');
  if (!enemy) { el.style.visibility = 'hidden'; return; }
  el.style.visibility = 'visible';
  $('enemy-sprite').textContent = enemy.sprite;
  $('enemy-name').textContent = enemy.name;
  $('enemy-sub').textContent = `Lv ${enemy.level}`;
  $('enemy-hp-bar').style.width = `${Math.max(0, enemy.hp/enemy.maxHp*100)}%`;
  $('enemy-hp-label').textContent = `HP ${enemy.hp}/${enemy.maxHp}`;
}

function renderGear() {
  const show = it => it ? `${it.name}` : '—';
  $('slot-weapon').textContent = show(player.weapon);
  $('slot-armor').textContent = show(player.armor);
  $('slot-trinket').textContent = show(player.trinket);
  $('slot-weapon').className = 'slot-item' + (player.weapon ? ' ' + RARITY_COLORS[player.weapon.rarity] : '');
  $('slot-armor').className = 'slot-item' + (player.armor ? ' ' + RARITY_COLORS[player.armor.rarity] : '');
  $('slot-trinket').className = 'slot-item' + (player.trinket ? ' ' + RARITY_COLORS[player.trinket.rarity] : '');
}

function renderInventory() {
  const el = $('inventory');
  el.innerHTML = '';
  if (player.inventory.length === 0) {
    el.innerHTML = '<div class="muted">Empty</div>';
    return;
  }
  player.inventory.forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `
      <div class="item-info">
        <div class="item-name ${RARITY_COLORS[it.rarity]}">${it.name}</div>
        <div class="item-stats">${it.slot} · ${describeItem(it)}</div>
      </div>
      <div>
        <button data-action="equip" data-idx="${idx}">Equip</button>
        <button data-action="sell" data-idx="${idx}">Sell ${sellValue(it)}g</button>
      </div>
    `;
    el.appendChild(row);
  });
  el.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      const idx = +b.dataset.idx;
      if (b.dataset.action === 'equip') equipItem(idx);
      else sellItem(idx);
    };
  });
}

function renderZones() {
  const el = $('zones');
  el.innerHTML = '';
  ZONES.forEach(z => {
    const btn = document.createElement('button');
    btn.className = 'zone-btn';
    const locked = player.level < z.unlock;
    btn.disabled = locked || inBattle;
    btn.innerHTML = `
      <span class="zone-name">${player.currentZone === z.id ? '★ ' : ''}${z.name}${locked ? ' 🔒' : ''}</span>
      <span class="zone-sub">${z.sub}${locked ? ` · unlock at Lv ${z.unlock}` : ''}</span>
    `;
    btn.onclick = () => {
      if (inBattle) return;
      player.currentZone = z.id;
      $('zone-header').textContent = `Exploring: ${z.name}`;
      log(`You travel to ${z.name}.`, 'dim');
      renderZones();
    };
    el.appendChild(btn);
  });
}

function renderAll() {
  renderStats();
  renderEnemy();
  renderGear();
  renderInventory();
  renderZones();
}

// --- Actions ---
function setButtonsForBattle(on) {
  $('btn-attack').disabled = !on || gameBusy;
  $('btn-defend').disabled = !on || gameBusy;
  $('btn-flee').disabled = !on || gameBusy;
  $('btn-heal').disabled = gameBusy || player.potions <= 0 || player.hp >= player.maxHp;
}

function startBattle() {
  spawnEnemy();
  inBattle = true;
  player.defending = false;
  const zone = ZONES.find(z => z.id === player.currentZone);
  log(`A wild ${enemy.name} (Lv ${enemy.level}) appears in ${zone.name}!`, 'hit');
  renderAll();
  setButtonsForBattle(true);
}

function endBattle() {
  inBattle = false;
  enemy = null;
  renderAll();
  setButtonsForBattle(false);
  $('btn-attack').disabled = gameBusy;
  $('btn-attack').textContent = '⚔ Find Enemy';
}

function shake(id) {
  const el = $(id);
  el.classList.remove('shake', 'flash');
  void el.offsetWidth;
  el.classList.add('shake', 'flash');
}

function playerAttack() {
  if (!inBattle || gameBusy) return;
  gameBusy = true;
  setButtonsForBattle(false);
  const atk = totalAtk();
  const crit = Math.random() < totalCrit();
  const miss = Math.random() < 0.05;
  let dmg = 0;
  if (miss) {
    log(`You swing at the ${enemy.name} and miss!`, 'miss');
  } else {
    dmg = Math.max(1, atk - Math.floor(Math.random() * (enemy.def + 1)) + rand(-1, 2));
    if (crit) dmg = Math.round(dmg * 2);
    enemy.hp -= dmg;
    shake('enemy-battler');
    log(`${crit ? 'CRITICAL! ' : ''}You hit the ${enemy.name} for ${dmg}.`, crit ? 'crit' : 'hit');
  }
  renderEnemy();

  setTimeout(() => {
    if (enemy.hp <= 0) { onVictory(); return; }
    enemyAttack();
  }, 420);
}

function playerDefend() {
  if (!inBattle || gameBusy) return;
  player.defending = true;
  log('You raise your guard.', 'dim');
  gameBusy = true;
  setButtonsForBattle(false);
  setTimeout(enemyAttack, 320);
}

function playerHeal() {
  if (gameBusy || player.potions <= 0) return;
  if (player.hp >= player.maxHp) { log('Already at full HP.', 'dim'); return; }
  player.potions--;
  const heal = Math.round(player.maxHp * 0.5);
  player.hp = Math.min(player.maxHp, player.hp + heal);
  log(`You quaff a potion (+${heal} HP).`, 'loot');
  renderStats();
  if (inBattle) {
    gameBusy = true;
    setButtonsForBattle(false);
    setTimeout(enemyAttack, 320);
  } else {
    setButtonsForBattle(false);
    $('btn-heal').disabled = player.potions <= 0 || player.hp >= player.maxHp;
  }
}

function playerFlee() {
  if (!inBattle || gameBusy) return;
  const success = Math.random() < 0.6;
  if (success) {
    log('You escape the fight.', 'dim');
    endBattle();
  } else {
    log('You fail to flee!', 'miss');
    gameBusy = true;
    setButtonsForBattle(false);
    setTimeout(enemyAttack, 320);
  }
}

function enemyAttack() {
  if (!enemy) { gameBusy = false; setButtonsForBattle(inBattle); return; }
  const miss = Math.random() < 0.07;
  let dmg = 0;
  if (miss) {
    log(`The ${enemy.name} misses you!`, 'miss');
  } else {
    const defBonus = player.defending ? Math.round(totalDef() * 1.8) : totalDef();
    dmg = Math.max(0, enemy.atk - Math.floor(Math.random() * (defBonus + 1)) + rand(-1, 2));
    player.hp -= dmg;
    if (dmg > 0) shake('player-battler');
    log(`${enemy.name} hits you for ${dmg}${player.defending ? ' (blocked!)' : ''}.`, 'hit');
  }
  player.defending = false;
  renderStats();
  if (player.hp <= 0) { onDefeat(); return; }
  gameBusy = false;
  setButtonsForBattle(true);
}

// --- Progression ---
function gainXp(amount) {
  player.xp += amount;
  log(`+${amount} XP`, 'xp');
  while (player.xp >= xpForLevel(player.level)) {
    player.xp -= xpForLevel(player.level);
    player.level++;
    const hpGain = 4 + rand(1, 3);
    player.maxHp += hpGain;
    player.hp = player.maxHp;
    player.baseAtk += 1 + (player.level % 3 === 0 ? 1 : 0);
    player.baseDef += (player.level % 2 === 0 ? 1 : 0);
    log(`LEVEL UP! You are now level ${player.level}. (+${hpGain} HP, fully healed)`, 'lvl');
  }
}

function addItem(item) {
  player.inventory.push(item);
  log(`Looted: ${item.name} (${describeItem(item)})`, 'loot');
  // Auto-equip if nothing in slot
  if (!player[item.slot]) {
    player[item.slot] = item;
    player.inventory.pop();
    log(`Equipped ${item.name}.`, 'loot');
  }
}

function equipItem(idx) {
  const it = player.inventory[idx];
  if (!it) return;
  const old = player[it.slot];
  player[it.slot] = it;
  player.inventory.splice(idx, 1);
  if (old) player.inventory.push(old);
  log(`Equipped ${it.name}.`, 'loot');
  renderAll();
}

function sellItem(idx) {
  const it = player.inventory[idx];
  if (!it) return;
  const gold = sellValue(it);
  player.gold += gold;
  player.inventory.splice(idx, 1);
  log(`Sold ${it.name} for ${gold}g.`, 'loot');
  renderAll();
}

function buyPotion() {
  if (player.gold < 15) { log('Not enough gold.', 'dim'); return; }
  player.gold -= 15;
  player.potions++;
  log('Bought a potion.', 'loot');
  renderAll();
}

function onVictory() {
  log(`Defeated the ${enemy.name}!`, 'xp');
  gainXp(enemy.xpReward);
  player.gold += enemy.goldReward;
  log(`+${enemy.goldReward} gold`, 'loot');
  // Loot drop chance
  const dropChance = 0.55 + Math.min(0.3, enemy.level * 0.01);
  if (Math.random() < dropChance) {
    addItem(generateItem(enemy.level));
  }
  gameBusy = false;
  endBattle();
}

function onDefeat() {
  log('You have fallen...', 'crit');
  gameBusy = false;
  inBattle = false;
  const lost = Math.floor(player.gold * 0.3);
  player.gold -= lost;
  player.hp = Math.max(1, Math.floor(player.maxHp * 0.5));
  showOverlay('💀', 'You Died', `You lost ${lost} gold and limp back to town with half HP.`, 'Continue');
}

function showOverlay(emoji, title, body, btn) {
  $('overlay-emoji').textContent = emoji;
  $('overlay-title').textContent = title;
  $('overlay-body').textContent = body;
  $('overlay-btn').textContent = btn;
  $('overlay').style.display = 'flex';
}
function hideOverlay() { $('overlay').style.display = 'none'; }

// --- Wire up buttons ---
$('btn-attack').addEventListener('click', () => {
  if (!inBattle) {
    startBattle();
    $('btn-attack').textContent = '⚔ Attack';
  } else {
    playerAttack();
  }
});
$('btn-defend').addEventListener('click', playerDefend);
$('btn-heal').addEventListener('click', playerHeal);
$('btn-flee').addEventListener('click', playerFlee);
$('btn-shop').addEventListener('click', buyPotion);
$('overlay-btn').addEventListener('click', () => {
  hideOverlay();
  endBattle();
});

// --- Init ---
$('zone-header').textContent = `Exploring: ${ZONES[0].name}`;
$('btn-attack').textContent = '⚔ Find Enemy';
log('Welcome, Hero. The Whispering Forest awaits...', 'dim');
log('Click ⚔ Find Enemy to start a fight.', 'dim');
renderAll();
setButtonsForBattle(false);
