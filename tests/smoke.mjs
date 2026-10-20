// ---------------------------------------------------------------------------
// Stick Legacy — headless smoke test.
// Simulates several minutes of gameplay (AI waves, economy, possession,
// projectiles) and renders every frame through a stub canvas context,
// catching runtime errors without a browser. Run: node tests/smoke.mjs
// ---------------------------------------------------------------------------
import { Game } from '../js/game.js';
import { Renderer } from '../js/renderer.js';
import {
  attackPose, walkPose, runPose, idlePose, deathPose, heroPose,
  drawStickman, WEAP_REST,
} from '../js/stickman.js';
import { UNIT_TYPES, TRAIN_ORDER, VIEW_W, VIEW_H, WORLD_W, GROUND_Y } from '../js/config.js';

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error('  FAIL:', msg); }
}

// ---- stub 2D context: absorbs every canvas call ---------------------------
function makeCtx() {
  const grad = { addColorStop() {} };
  const target = {
    canvas: { width: VIEW_W, height: VIEW_H },
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setTransform() {}, save() {}, restore() {},
  };
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      return () => undefined;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

// ---- 1. pose library sanity ------------------------------------------------
console.log('1. pose library...');
for (const kind of ['sword', 'pick', 'spear', 'bow', 'staff', 'club']) {
  for (const p of [0, 0.2, 0.46, 0.55, 0.7, 0.999, 1]) {
    const pose = attackPose(kind, p);
    check(Number.isFinite(pose.lean) && Number.isFinite(pose.weap), `attackPose(${kind},${p}) finite`);
    check(Number.isFinite(pose.ra.s) && Number.isFinite(pose.la.e), `attackPose(${kind},${p}) limbs finite`);
  }
}
for (const f of [walkPose, runPose, idlePose, deathPose, heroPose]) {
  const pose = f(1.234);
  check(Number.isFinite(pose.ll.h) && Number.isFinite(pose.rl.k), `${f.name} finite`);
}

// ---- 2. draw every unit type (icon-like) -----------------------------------
console.log('2. drawStickman for all units...');
const ctx = makeCtx();
for (const key of TRAIN_ORDER) {
  const cfg = UNIT_TYPES[key];
  drawStickman(ctx, {
    x: 100, y: 200, facing: 1, scale: cfg.scale,
    pose: idlePose(0.5), weapon: cfg.weapon,
    colors: { body: '#232b38', limbBack: '#151a23', team: '#4aa3ff', dark: '#2c6cb5' },
    extras: { glow: 0.4, draw: 0.8, carry: 1, flap: 2 },
  });
  drawStickman(ctx, {
    x: 100, y: 200, facing: -1, scale: cfg.scale,
    pose: attackPose(cfg.weapon, 0.5), weapon: cfg.weapon,
    colors: { body: '#38272b', limbBack: '#221619', team: '#ff5f4d', dark: '#b53a2c' },
    extras: { stone: true, cape: '#b53a2c', capeWave: 1 },
  });
}
check(true, 'drawn without exceptions');

// ---- 3. full game simulation ------------------------------------------------
console.log('3. simulating battle (normal, ~6 min accelerated)...');
const banners = [];
let gameOver = null;
const g = new Game('normal', {
  onBanner: (t) => banners.push(t),
  onGameOver: (r, s) => { gameOver = { r, s }; },
});
const renderer = new Renderer(g);
const dt = 1 / 30;
let simErr = null;
try {
  for (let i = 0; i < 30 * 360; i++) {
    // player behaves like a decent human: eco first, then army, then attack
    if (i % 300 === 0) g.gold += 500; // cheat a little so all unit types appear
    if (i % 143 === 0) {
      const t = TRAIN_ORDER[(i / 143 | 0) % TRAIN_ORDER.length];
      g.tryTrain(1, t);
    }
    if (i === 900) g.setStance(1, 'attack');
    if (i === 1500) g.setStance(1, 'defend');
    if (i === 1800) g.setStance(1, 'attack');
    // possession stint
    if (i === 2100) {
      const u = g.units.find((u) => u.team === 1 && !u.dead && u.type === 'sword');
      if (u) g.possess(u);
    }
    if (i > 2100 && i < 2700) {
      g.setMoveInput((i % 90) < 45 ? 1 : -1);
      if (i % 25 === 0) g.pressAttack();
    }
    if (i === 2700) g.releasePossess();
    // right-click style order
    if (i === 3000) {
      const u = g.units.find((u) => u.team === 1 && !u.dead && u.type !== 'miner');
      if (u) { g.selected = u; g.orderSelected(u.x + 400); }
    }
    // camera pans
    g.camPan = (i % 600) < 300 ? 0.4 : -0.4;

    g.update(dt);
    renderer.render(ctx, dt);

    if (g.over && g.overT > 4) break;
  }
} catch (e) {
  simErr = e;
}
check(simErr === null, 'simulation threw: ' + (simErr && simErr.stack || ''));

console.log(`   t=${g.time.toFixed(1)}s units=${g.units.length} kills=${g.stats.kills} losses=${g.stats.losses} gold=${g.gold.toFixed(0)} mined=${g.stats.goldMined.toFixed(0)} particles=${g.particles.length} projectiles=${g.projectiles.length} over=${g.over} result=${g.result}`);
check(g.time > 60, 'game time advanced');
check(g.stats.goldMined > 0, 'miners produced gold');
check(g.stats.kills + g.stats.losses > 0, 'combat happened');
check(banners.length > 0, 'AI waves announced');
check(g.particles.length < 700, 'particle count bounded');
check(g.units.every((u) => Number.isFinite(u.x)), 'unit positions finite');
check(g.units.every((u) => u.x >= 0 && u.x <= WORLD_W), 'units inside world');
check(g.camera.x >= 0 && g.camera.x <= WORLD_W - VIEW_W, 'camera clamped');
if (g.over) {
  check(gameOver !== null, 'onGameOver fired');
  check(g.result === 'victory' || g.result === 'defeat', 'result set');
}

// ---- 4. train refusal paths --------------------------------------------------
console.log('4. economy guards...');
const g2 = new Game('easy', {});
g2.gold = 10;
check(g2.tryTrain(1, 'giant').ok === false, 'cannot afford → refused');
check(g2.tryTrain(1, 'giant').why === 'gold', 'reason: gold');
g2.gold = 99999;
for (let i = 0; i < 40; i++) g2.spawnUnit(1, 'sword');
check(g2.tryTrain(1, 'giant').ok === false, 'pop cap → refused');
check(g2.popUsed(1) >= 30, 'pop counting works');

// ---- 5. demo (menu) mode both-side AI ---------------------------------------
console.log('5. demo mode (AI vs AI, 90s)...');
const gd = new Game('hard', { demo: true });
const rd = new Renderer(gd);
let demoErr = null;
try {
  for (let i = 0; i < 30 * 90; i++) {
    gd.update(dt);
    if (i % 3 === 0) rd.render(ctx, dt * 3);
    if (gd.over && gd.overT > 3) break;
  }
} catch (e) { demoErr = e; }
check(demoErr === null, 'demo threw: ' + (demoErr && demoErr.stack || ''));
check(gd.units.length > 4, 'demo armies grew');
console.log(`   demo: units=${gd.units.length} gold p1=${gd.gold.toFixed(0)} p2=${gd.enemyGold.toFixed(0)} statue hp ${gd.statues[1].hp.toFixed(0)}/${gd.statues[2].hp.toFixed(0)}`);

// ---- 6. statue kill → game over path ----------------------------------------
console.log('6. forced statue kill...');
const g3 = new Game('normal', { onGameOver: (r, s) => { g3._fired = { r, s }; } });
let overErr = null;
try {
  // smash the enemy statue directly, then let the slow-mo crumble play out
  g3.damage(g3.statues[2], 99999, { team: 1, x: g3.statues[2].x - 100 });
  for (let i = 0; i < 30 * 8; i++) g3.update(dt);
} catch (e) { overErr = e; }
check(overErr === null, 'statue kill threw: ' + (overErr && overErr.stack || ''));
check(g3.over === true, 'game marked over');
check(g3.result === 'victory', 'victory result');
check(!!g3._fired, 'onGameOver hook fired after slow-mo');

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED ✔' : `\n${failures} FAILURE(S) ✘`);
process.exit(failures === 0 ? 0 : 1);
