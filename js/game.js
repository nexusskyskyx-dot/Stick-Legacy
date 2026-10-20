// ---------------------------------------------------------------------------
// Stick Legacy — core game simulation (pure logic, no DOM).
// Units, miners & gold economy, combat, projectiles, particles, orders,
// camera, win/lose. The enemy (and demo) AI lives in ai.js.
// ---------------------------------------------------------------------------
import {
  VIEW_W, WORLD_W, GROUND_Y, POP_CAP, UNIT_TYPES, DIFFICULTY,
  STATUE_X, MINE_X, STATUE_HALF, HOLD_OFFSET, DEPOSIT_RANGE, AGGRO,
  CARRY, MINE_SWINGS, PLAYER_STATUE_HP,
} from './config.js';
import { EnemyAI } from './ai.js';
import { play } from './audio.js';
import { clamp, lerp, randRange, sign } from './util.js';

let UID = 1;

export class Game {
  constructor(diffKey = 'normal', hooks = {}) {
    this.hooks = hooks;
    this.demo = !!hooks.demo;
    this.diffKey = diffKey;
    this.diff = DIFFICULTY[diffKey] || DIFFICULTY.normal;

    this.time = 0;
    this.over = false;
    this.overT = 0;
    this.overFired = false;
    this.result = null;
    this.timeScale = 1;

    this.gold = this.diff.startGold;
    this.enemyGold = this.diff.startGold * 0.85;

    this.units = [];
    this.projectiles = [];
    this.particles = [];
    this.texts = [];

    this.stance = { 1: 'defend', 2: 'defend' };
    this.trainCd = { 1: 0, 2: 0 };

    this.camera = { x: 0, shake: 0 };
    this.camPan = 0;
    this.userPanT = 0;

    this.selected = null;
    this.possessed = null;
    this.moveInput = 0;
    this.attackQueued = false;

    this.stats = { kills: 0, losses: 0, goldMined: 0, trained: 0 };
    this.bannerCD = 0;
    this.warnCool = 0;

    this.statues = {
      1: { isStatue: true, team: 1, x: STATUE_X[1], hp: PLAYER_STATUE_HP, maxHp: PLAYER_STATUE_HP, hitFlash: 0, dead: false, vx: 0, depth: 0 },
      2: { isStatue: true, team: 2, x: STATUE_X[2], hp: this.diff.aiStatueHp, maxHp: this.diff.aiStatueHp, hitFlash: 0, dead: false, vx: 0, depth: 0 },
    };
    this.mines = {
      1: { team: 1, x: MINE_X[1], shake: 0 },
      2: { team: 2, x: MINE_X[2], shake: 0 },
    };

    this.ais = [new EnemyAI(this, 2)];
    if (this.demo) this.ais.push(new EnemyAI(this, 1));

    // starting armies
    for (let i = 0; i < 3; i++) this.spawnUnit(1, 'miner');
    this.spawnUnit(1, 'sword');
    for (let i = 0; i < this.diff.aiMiners; i++) this.spawnUnit(2, 'miner');
    this.spawnUnit(2, 'sword');
  }

  // -------------------------------------------------------------------------
  // Economy / population helpers
  // -------------------------------------------------------------------------
  goldOf(t) { return t === 1 ? this.gold : this.enemyGold; }
  setGold(t, v) { if (t === 1) this.gold = v; else this.enemyGold = v; }
  earn(t, amt) { this.setGold(t, this.goldOf(t) + amt); }

  popUsed(t) {
    let n = 0;
    for (const u of this.units) if (u.team === t && !u.dead) n += UNIT_TYPES[u.type].pop;
    return n;
  }
  countType(t, type) {
    let n = 0;
    for (const u of this.units) if (u.team === t && u.type === type && !u.dead) n++;
    return n;
  }
  countCombat(t) {
    let n = 0;
    for (const u of this.units) if (u.team === t && u.type !== 'miner' && !u.dead) n++;
    return n;
  }

  // -------------------------------------------------------------------------
  // Training & spawning
  // -------------------------------------------------------------------------
  tryTrain(team, type) {
    if (this.over) return { ok: false, why: 'over' };
    const cfg = UNIT_TYPES[type];
    if (!cfg) return { ok: false, why: 'bad' };
    if (this.trainCd[team] > 0) return { ok: false, why: 'busy' };
    if (this.goldOf(team) < cfg.cost) return { ok: false, why: 'gold' };
    if (this.popUsed(team) + cfg.pop > POP_CAP) return { ok: false, why: 'pop' };
    this.setGold(team, this.goldOf(team) - cfg.cost);
    this.trainCd[team] = team === 1 ? 0.35 : 0.5;
    const u = this.spawnUnit(team, type);
    if (team === 1) {
      this.stats.trained++;
      this.sfx('train', this.statues[1].x);
      this.addText(this.statues[1].x + 70, GROUND_Y - 150, cfg.name + ' joins!', '#bfe3ff');
      if (this.hooks.onTrain) this.hooks.onTrain(type);
    }
    return { ok: true, unit: u };
  }

  spawnUnit(team, type) {
    const cfg = UNIT_TYPES[type];
    const dir = team === 1 ? 1 : -1;
    const u = {
      id: UID++, team, type, cfg,
      x: this.statues[team].x + dir * randRange(70, 100),
      depth: randRange(-22, 22),
      hp: cfg.hp, maxHp: cfg.hp,
      facing: dir, vx: 0, moving: false,
      animT: Math.random() * 10, phase: Math.random() * 7,
      dead: false, deadT: 0, hitFlash: 0, spawnT: 0,
      attacking: false, attackT: 0, attackKind: 'combat', hasStruck: false,
      target: null, moveOrder: null,
      carry: 0, mstate: 'toMine', mineDelay: 0, swings: 0, depositT: 0, fleeT: 0,
      slot: (Math.random() * 3) | 0,
      wantMove: false, progT: 0, ghost: 0,
      scale: cfg.scale || 1,
      isStatue: false,
    };
    this.units.push(u);
    this.burst(u.x, GROUND_Y + u.depth - 8, 5, { color: '#c9d6e8', kind: 'smoke', spread: 30, life: 0.5, g: -12 });
    return u;
  }

  // -------------------------------------------------------------------------
  // Orders / player control API
  // -------------------------------------------------------------------------
  setStance(team, s) {
    if (this.stance[team] === s) return;
    this.stance[team] = s;
    if (team === 1) {
      this.sfx('click');
      this.bannerNow(s === 'attack' ? '⚔ ALL UNITS — ATTACK!' : '🛡 ALL UNITS — DEFEND!');
      for (const u of this.units) if (u.team === 1 && u !== this.possessed) u.moveOrder = null;
    }
  }

  banner(text) {
    if (this.bannerCD > 0 || this.demo) return;
    this.bannerNow(text);
  }
  bannerNow(text) {
    if (this.demo) return;
    this.bannerCD = 4;
    this.sfx('horn', this.camera.x + VIEW_W / 2);
    if (this.hooks.onBanner) this.hooks.onBanner(text);
  }

  possess(u) {
    if (u && u.team === 1 && !u.dead) {
      this.possessed = u;
      this.selected = u;
      this.sfx('click');
      if (this.hooks.onPossess) this.hooks.onPossess(u);
    }
  }
  releasePossess() {
    if (this.possessed && this.hooks.onPossess) this.hooks.onPossess(null);
    this.possessed = null;
    this.moveInput = 0;
  }
  pressAttack() { this.attackQueued = true; }
  setMoveInput(d) { this.moveInput = d; }

  selectAt(wx, wy) {
    let best = null, bd = 1e9;
    for (const u of this.units) {
      if (u.team !== 1 || u.dead) continue;
      const gy = GROUND_Y + u.depth;
      const h = 80 * u.scale;
      if (Math.abs(u.x - wx) < 28 && wy > gy - h && wy < gy + 12) {
        const d = Math.abs(u.x - wx);
        if (d < bd) { bd = d; best = u; }
      }
    }
    this.selected = best;
    if (best) this.sfx('click');
    return best;
  }

  orderSelected(wx) {
    const u = this.selected;
    if (!u || u.dead) return;
    // attack-move: clicking an enemy orders a strike
    let foe = null, bd = 60;
    for (const e of this.units) {
      if (e.team === 1 || e.dead) continue;
      const d = Math.abs(e.x - wx);
      if (d < bd) { bd = d; foe = e; }
    }
    const es = this.statues[2];
    if (!foe && !es.dead && Math.abs(es.x - wx) < 130) foe = es;
    if (foe) {
      u.moveOrder = null;
      u.target = foe;
      this.ring(foe.x, foe.isStatue ? GROUND_Y - 120 : GROUND_Y + foe.depth - 30, 26, '#ff6b5e');
    } else {
      u.moveOrder = clamp(wx, 60, WORLD_W - 60);
      this.ring(wx, GROUND_Y, 18, '#7fd0ff');
    }
    this.sfx('click');
  }

  jumpCam(mode) {
    if (mode === 'base') this.camera.x = 0;
    else if (mode === 'front') {
      let front = this.statues[1].x;
      for (const u of this.units) if (u.team === 1 && !u.dead && u.type !== 'miner') front = Math.max(front, u.x);
      this.camera.x = clamp(front - VIEW_W * 0.45, 0, WORLD_W - VIEW_W);
    }
    this.userPanT = 5;
  }

  sfx(name, x) {
    if (this.demo) return;
    let vol = 1;
    if (x != null) {
      const c = this.camera.x + VIEW_W / 2;
      vol = clamp(1 - Math.abs(x - c) / 1300, 0.04, 1);
    }
    play(name, vol);
  }

  // -------------------------------------------------------------------------
  // Particles & floating text
  // -------------------------------------------------------------------------
  addParticle(p) {
    if (this.particles.length > 640) this.particles.shift();
    this.particles.push(Object.assign(
      { x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0.6, max: 0.6, size: 3, color: '#fff', kind: 'dot', rot: 0, vr: 0, grow: 0 },
      p
    ));
  }
  burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = randRange(0.3, 1) * (o.spread || 60);
      this.addParticle({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - (o.up || 0),
        g: o.g != null ? o.g : 240,
        life: (o.life || 0.6) * randRange(0.7, 1.3),
        max: o.life || 0.6,
        size: (o.size || 3) * randRange(0.7, 1.3),
        color: o.color || '#fff', kind: o.kind || 'dot',
        rot: Math.random() * 7, vr: randRange(-6, 6),
      });
    }
  }
  ring(x, y, r, color) {
    this.addParticle({ x, y, kind: 'ring', size: r * 0.4, grow: r * 3.2, color, life: 0.4, max: 0.4, g: 0 });
  }
  puff(x, y) {
    this.addParticle({ x: x + randRange(-4, 4), y, vx: randRange(-14, 14), vy: randRange(-26, -8), g: 30, life: 0.45, max: 0.45, size: randRange(2, 4), color: '#a08a68', kind: 'smoke', grow: 14 });
  }
  blood(x, y, dir) {
    for (let i = 0; i < 6; i++) {
      this.addParticle({
        x, y, vx: dir * randRange(20, 110) + randRange(-30, 30), vy: randRange(-120, -20), g: 520,
        life: randRange(0.3, 0.6), max: 0.6, size: randRange(1.5, 3),
        color: Math.random() < 0.5 ? '#8e2f2f' : '#b84343', kind: 'dot',
      });
    }
  }
  stoneDust(x, y) {
    for (let i = 0; i < 6; i++) {
      this.addParticle({
        x, y, vx: randRange(-70, 70), vy: randRange(-90, -10), g: 420,
        life: randRange(0.3, 0.7), max: 0.7, size: randRange(2, 4.5),
        color: Math.random() < 0.5 ? '#9aa2ad' : '#c3cad3', kind: 'dot',
      });
    }
  }
  goldSpark(x, y) {
    for (let i = 0; i < 5; i++) {
      this.addParticle({
        x: x + randRange(-6, 6), y: y + randRange(-8, 4), vx: randRange(-40, 40), vy: randRange(-130, -50), g: 340,
        life: randRange(0.35, 0.6), max: 0.6, size: randRange(1.5, 2.8),
        color: Math.random() < 0.5 ? '#ffd76a' : '#ffe9ae', kind: 'spark',
      });
    }
  }
  addText(x, y, text, color) {
    if (this.demo) return;
    if (this.texts.length > 40) this.texts.shift();
    this.texts.push({ x, y, text, color, life: 1.5, max: 1.5, vy: -34 });
  }

  updateParticles(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.grow) p.size += p.grow * dt;
      if (p.kind !== 'ring' && p.kind !== 'smoke' && p.y > GROUND_Y + 30 && p.vy > 0) {
        p.y = GROUND_Y + 30; p.vy *= -0.35; p.vx *= 0.7;
      }
    }
    const ts = this.texts;
    for (let i = ts.length - 1; i >= 0; i--) {
      const t = ts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.life <= 0) ts.splice(i, 1);
    }
  }

  // -------------------------------------------------------------------------
  // Main update
  // -------------------------------------------------------------------------
  update(dtRaw) {
    const rdt = Math.min(dtRaw, 0.05);
    this.bannerCD = Math.max(0, this.bannerCD - rdt);
    this.warnCool = Math.max(0, this.warnCool - rdt);

    if (this.over) {
      this.overT += rdt;
      this.timeScale = lerp(this.timeScale, 1, rdt * 0.25);
      // slow-motion carnage continues briefly after a statue falls
      if (this.overT < 2.4) {
        const dt = rdt * this.timeScale;
        for (const u of this.units) this.updateUnit(u, dt);
        this.separate();
        this.updateProjectiles(dt);
      }
      this.updateParticles(rdt);
      this.camera.shake = Math.max(0, this.camera.shake - rdt * 18);
      if (!this.demo) this.updateCamera(rdt);
      else this.demoCam(rdt);
      if (this.overT > 2.6 && !this.overFired) {
        this.overFired = true;
        if (this.hooks.onGameOver) this.hooks.onGameOver(this.result, this.summary());
      }
      return;
    }

    const dt = rdt * this.timeScale;
    this.time += dt;
    this.trainCd[1] = Math.max(0, this.trainCd[1] - dt);
    this.trainCd[2] = Math.max(0, this.trainCd[2] - dt);

    for (const ai of this.ais) ai.update(dt);
    for (const u of this.units) this.updateUnit(u, dt);
    this.separate();
    this.updateProjectiles(dt);

    for (const k of [1, 2]) {
      this.statues[k].hitFlash = Math.max(0, this.statues[k].hitFlash - dt * 3);
      this.mines[k].shake = Math.max(0, this.mines[k].shake - dt * 3.4);
    }
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].dead && this.units[i].deadT > 2.8) this.units.splice(i, 1);
    }

    this.updateParticles(dt);
    if (this.demo) this.demoCam(dt); else this.updateCamera(dt);
    this.checkWarnings();
  }

  demoCam(dt) {
    this.camera.x = (WORLD_W - VIEW_W) * (0.5 + 0.44 * Math.sin(this.time * 0.055));
    this.camera.shake = Math.max(0, this.camera.shake - dt * 18);
  }

  updateCamera(dt) {
    const c = this.camera;
    if (this.camPan !== 0) { c.x += this.camPan * 820 * dt; this.userPanT = 5.5; }
    else this.userPanT = Math.max(0, this.userPanT - dt);

    if (this.possessed) {
      const u = this.possessed;
      const tx = clamp(u.x - VIEW_W / 2 + u.facing * 110, 0, WORLD_W - VIEW_W);
      c.x = lerp(c.x, tx, 1 - Math.pow(0.0015, dt));
    } else if (this.userPanT <= 0 && !this.selected) {
      // gentle auto-follow of the frontline (like the classic game's scroll)
      let front = this.statues[1].x;
      for (const u of this.units) {
        if (u.team === 1 && !u.dead && u.type !== 'miner') front = Math.max(front, u.x - 260);
      }
      let threat = false;
      for (const u of this.units) {
        if (u.team === 2 && !u.dead && u.x < this.statues[1].x + 900) threat = true;
      }
      const tx = clamp((threat ? Math.min(front, this.statues[1].x + 300) : front) - VIEW_W * 0.42, 0, WORLD_W - VIEW_W);
      c.x = lerp(c.x, tx, 1 - Math.pow(0.35, dt));
    }
    c.x = clamp(c.x, 0, WORLD_W - VIEW_W);
    c.shake = Math.max(0, c.shake - dt * 24);
  }

  checkWarnings() {
    if (this.demo) return;
    const s = this.statues[1];
    let near = false;
    for (const u of this.units) {
      if (u.team === 2 && !u.dead && u.type !== 'miner' && Math.abs(u.x - s.x) < 620) { near = true; break; }
    }
    if (near && this.warnCool <= 0) {
      this.warnCool = 20;
      this.banner('⚠ YOUR STATUE IS UNDER ATTACK!');
    }
  }

  summary() {
    return {
      time: this.time, kills: this.stats.kills, losses: this.stats.losses,
      goldMined: this.stats.goldMined, trained: this.stats.trained,
      diff: this.diff.label, result: this.result,
    };
  }

  // -------------------------------------------------------------------------
  // Unit behaviour
  // -------------------------------------------------------------------------
  updateUnit(u, dt) {
    const prevX = u.x;
    if (u.dead) { u.deadT += dt; return; }
    if (u.spawnT < 1) u.spawnT = Math.min(1, u.spawnT + dt * 3);
    u.hitFlash = Math.max(0, u.hitFlash - dt * 3.2);
    u.animT += dt;

    if (u === this.possessed) this.updatePossessed(u, dt);
    else if (u.type === 'miner') this.updateMiner(u, dt);
    else this.updateSoldier(u, dt);

    u.x = clamp(u.x, 60, WORLD_W - 60);
    u.vx = (u.x - prevX) / Math.max(dt, 0.0001);
    u.moving = Math.abs(u.vx) > 10 && !u.attacking;
    if (u.moving && Math.random() < dt * (u.scale > 1.7 ? 14 : 5)) this.puff(u.x, GROUND_Y + u.depth);

    // stuck detection: if we want to move but can't, briefly become a "ghost"
    // that ignores crowd separation (prevents permanent blocking deadlocks)
    u.ghost = Math.max(0, u.ghost - dt);
    if (u.wantMove && !u.dead) {
      if (Math.abs(u.x - prevX) > 0.35) u.progT = 0;
      else u.progT += dt;
      if (u.progT > 1.0) { u.progT = 0; u.ghost = 1.8; }
    } else u.progT = 0;
  }

  updateSoldier(u, dt) {
    const cfg = u.cfg;
    u.wantMove = false;
    if (u.attacking) {
      const t = u.target;
      if (t && (t.dead || (t.hp !== undefined && t.hp <= 0))) u.target = null;
      if (u.target) u.facing = u.target.x >= u.x ? 1 : -1;
      this.updateAttackCycle(u, dt);
      if (u.attacking) return;
    }

    // explicit move order (right-click) — attack-move along the way
    if (u.moveOrder != null) {
      const d = u.moveOrder - u.x;
      if (Math.abs(d) < 10) u.moveOrder = null;
      else {
        u.facing = sign(d) || u.facing;
        u.wantMove = true;
        u.x += u.facing * cfg.speed * dt;
        const t = this.findTarget(u, cfg.range * 0.9 + 20);
        if (t) { u.moveOrder = null; u.target = t; }
        else return;
      }
    }

    if (u.target && u.target.dead) u.target = null;
    if (!u.target) u.target = this.findTarget(u);

    if (u.target) {
      const t = u.target;
      const dx = t.x - u.x;
      const adx = Math.abs(dx);
      u.facing = dx >= 0 ? 1 : -1;
      const reach = cfg.range + (t.isStatue ? STATUE_HALF : 0) + (t.type === 'giant' ? 46 : 0);
      const chase = (cfg.ranged ? AGGRO.ranged : AGGRO.melee) * 1.7 + (t.isStatue ? 500 : 0);
      if (adx <= reach) this.startAttack(u, t);
      else if (adx < chase) { u.wantMove = true; u.x += sign(dx) * cfg.speed * dt; }
      else u.target = null;
      return;
    }

    // no target → follow stance
    const dir = u.team === 1 ? 1 : -1;
    const foeStatue = this.statues[u.team === 1 ? 2 : 1];
    let anchor;
    if (this.stance[u.team] === 'attack' && !foeStatue.dead) {
      anchor = foeStatue.x - dir * (STATUE_HALF + cfg.range + 12);
    } else if (this.stance[u.team] === 'attack') {
      anchor = WORLD_W / 2;
    } else {
      anchor = this.statues[u.team].x + dir * HOLD_OFFSET + ((u.id * 53) % 150) - 75;
    }
    const d = anchor - u.x;
    if (Math.abs(d) > 20) {
      u.facing = sign(d) || u.facing;
      u.wantMove = true;
      u.x += u.facing * cfg.speed * (this.stance[u.team] === 'attack' ? 1 : 0.92) * dt;
    }
  }

  updateMiner(u, dt) {
    const cfg = UNIT_TYPES.miner;
    const dir = u.team === 1 ? 1 : -1;
    const mine = this.mines[u.team];
    const statue = this.statues[u.team];
    u.wantMove = false;

    if (u.attacking) {
      if (u.target && !u.target.isStatue) u.facing = u.target.x >= u.x ? 1 : -1;
      this.updateAttackCycle(u, dt);
      if (!u.attacking && u.attackKind === 'mine' && u.mstate === 'mining') {
        u.swings++;
        if (u.swings >= MINE_SWINGS) { u.mstate = 'return'; u.swings = 0; }
        else u.mineDelay = 0.2;
      }
      return;
    }

    // threat scan
    let threat = null, td = 1e9;
    for (const e of this.units) {
      if (e.team === u.team || e.dead) continue;
      const d = Math.abs(e.x - u.x);
      if (d < td) { td = d; threat = e; }
    }
    const scared = u.hp < u.maxHp * 0.45;

    if (scared && threat && td < 460 && u.mstate !== 'flee') { u.mstate = 'flee'; u.fleeT = 2.4; }
    if (threat && td < 150 && !scared) { this.startAttack(u, threat, 'combat'); return; }

    if (u.mstate === 'flee') {
      u.fleeT -= dt;
      const d = statue.x + dir * 100 - u.x;
      u.facing = sign(d) || dir;
      u.wantMove = true;
      u.x += u.facing * cfg.speed * 1.25 * dt;
      if (u.fleeT <= 0 && (!threat || td > 440)) u.mstate = u.carry >= CARRY * 0.9 ? 'return' : 'toMine';
      return;
    }

    switch (u.mstate) {
      case 'toMine': {
        const tx = mine.x - dir * (48 + u.slot * 18);
        const d = tx - u.x;
        if (Math.abs(d) < 8) { u.mstate = 'mining'; u.swings = 0; u.mineDelay = 0.2; u.facing = dir; }
        else { u.facing = sign(d) || dir; u.wantMove = true; u.x += u.facing * cfg.speed * dt; }
        break;
      }
      case 'mining': {
        u.facing = dir;
        u.mineDelay -= dt;
        if (u.mineDelay <= 0) this.startAttack(u, null, 'mine');
        break;
      }
      case 'return': {
        const tx = statue.x + dir * 110;
        const d = tx - u.x;
        if (Math.abs(d) < 12) { u.mstate = 'deposit'; u.depositT = 0.45; }
        else { u.facing = sign(d) || dir; u.wantMove = true; u.x += u.facing * cfg.speed * dt; }
        break;
      }
      case 'deposit': {
        u.depositT -= dt;
        if (u.depositT <= 0) {
          const amt = Math.round(u.carry);
          u.carry = 0;
          if (amt > 0) {
            this.earn(u.team, amt);
            if (u.team === 1) {
              this.stats.goldMined += amt;
              this.addText(u.x, GROUND_Y + u.depth - 84, '+' + amt, '#ffd76a');
              this.sfx('coin', u.x);
              this.goldSpark(u.x, GROUND_Y + u.depth - 40);
            }
          }
          u.mstate = 'toMine';
        }
        break;
      }
    }
  }

  updatePossessed(u, dt) {
    const cfg = u.cfg;
    u.wantMove = this.moveInput !== 0;
    if (this.attackQueued) {
      this.attackQueued = false;
      if (u.type === 'miner') {
        const m = this.mines[1];
        if (Math.abs(u.x - m.x) < 115 && u.carry < CARRY + 0.01) {
          u.facing = m.x >= u.x ? 1 : -1;
          this.startAttack(u, null, 'mine');
        } else this.possessedStrike(u);
      } else this.possessedStrike(u);
    }

    if (u.attacking) {
      this.updateAttackCycle(u, dt);
      if (u.attacking) return;
      if (u.attackKind === 'mine' && u.type === 'miner') {
        // keep swinging while space held near mine (handled per press otherwise)
      }
    }

    if (this.moveInput !== 0 && !u.attacking) {
      u.facing = this.moveInput;
      u.x += this.moveInput * cfg.speed * 1.06 * dt;
    }

    // miner auto-deposit at statue
    if (u.type === 'miner' && u.carry > 0) {
      const s = this.statues[1];
      if (Math.abs(u.x - (s.x + 70)) < DEPOSIT_RANGE) {
        const amt = Math.round(u.carry);
        u.carry = 0;
        this.earn(1, amt);
        this.stats.goldMined += amt;
        this.addText(u.x, GROUND_Y + u.depth - 84, '+' + amt, '#ffd76a');
        this.sfx('coin', u.x);
        this.goldSpark(u.x, GROUND_Y + u.depth - 40);
      }
    }
  }

  possessedStrike(u) {
    const cfg = u.cfg;
    let best = null, bd = 1e9;
    for (const e of this.units) {
      if (e.team === u.team || e.dead) continue;
      const dx = e.x - u.x;
      const adx = Math.abs(dx);
      if (adx < bd && dx * u.facing > -45) { bd = adx; best = e; }
    }
    const es = this.statues[u.team === 1 ? 2 : 1];
    if (!es.dead) {
      const dx = es.x - u.x;
      if (Math.abs(dx) < bd && dx * u.facing > -45) { bd = Math.abs(dx); best = es; }
    }
    let reach = cfg.ranged ? cfg.range + 140 : cfg.range + 80;
    if (best && best.isStatue) reach = cfg.range + STATUE_HALF + 30;
    if (best && bd <= reach) this.startAttack(u, best);
    else this.startAttack(u, null); // whiff / directional shot
  }

  // -------------------------------------------------------------------------
  // Combat
  // -------------------------------------------------------------------------
  startAttack(u, target, kind = 'combat') {
    if (u.attacking || u.dead) return;
    u.attacking = true;
    u.attackT = 0;
    u.hasStruck = false;
    u.attackKind = kind;
    u.target = target || null;
    if (target) u.facing = target.x >= u.x ? 1 : -1;
  }

  updateAttackCycle(u, dt) {
    if (!u.attacking) return;
    const cfg = u.cfg;
    let dur = 1 / cfg.atkSpeed;
    if (u.attackKind === 'mine') dur = 1.15;
    if (u.type === 'giant') dur *= 1.05;
    u.attackT += dt;
    const p = u.attackT / dur;
    if (!u.hasStruck && p >= 0.46) {
      u.hasStruck = true;
      this.applyStrike(u);
    }
    if (p >= 1) {
      u.attacking = false;
      u.attackT = 0;
    }
  }

  applyStrike(u) {
    const cfg = u.cfg;
    if (u.attackKind === 'mine') {
      const m = this.mines[u.team];
      m.shake = 1;
      u.carry = Math.min(CARRY, u.carry + CARRY / MINE_SWINGS);
      this.sfx('mine', u.x);
      this.goldSpark(m.x + (u.team === 1 ? -34 : 34), GROUND_Y - 46);
      this.stoneDust(m.x + (u.team === 1 ? -30 : 30), GROUND_Y - 40);
      return;
    }
    if (cfg.ranged) {
      this.spawnProjectile(u, u.target);
      this.sfx(cfg.aoe ? 'cast' : 'shoot', u.x);
      return;
    }
    const t = u.target;
    this.sfx('swing', u.x);
    if (!t || t.dead) return;
    const reach = cfg.range + (t.isStatue ? STATUE_HALF : 0) + (t.type === 'giant' ? 46 : 0) + 28;
    if (Math.abs(t.x - u.x) > reach) return;
    this.damage(t, cfg.dmg, u);
    this.sfx(u.type === 'giant' ? 'boom' : 'clash', u.x);
    if (u.type === 'giant') {
      this.camera.shake = Math.max(this.camera.shake, 9);
      this.burst(t.x, GROUND_Y + (t.depth || 0) - 6, 10, { color: '#a08a68', spread: 120, life: 0.6, up: 60 });
    }
  }

  damage(t, amt, src) {
    if (t.dead || t.hp <= 0) return;
    t.hp -= amt;
    t.hitFlash = 1;
    if (t.isStatue) {
      this.camera.shake = Math.max(this.camera.shake, Math.min(6, amt / 14));
      this.stoneDust(t.x + randRange(-40, 40), GROUND_Y - randRange(60, 220));
      if (t.hp <= 0) this.killStatue(t);
      return;
    }
    const dir = t.x >= src.x ? 1 : -1;
    t.x += dir * (t.type === 'giant' ? 0 : amt > 60 ? 5 : 2.5);
    this.blood(t.x, GROUND_Y + t.depth - 40 * t.scale, dir);
    if (t.hp <= 0) this.killUnit(t, src);
  }

  killUnit(u, src) {
    u.dead = true;
    u.deadT = 0;
    u.attacking = false;
    u.hitFlash = 0;
    if (src) {
      if (src.team === 1) this.stats.kills++;
      else if (u.team === 1) this.stats.losses++;
    }
    if (u === this.possessed) this.releasePossess();
    if (u === this.selected) this.selected = null;
    this.sfx('die', u.x);
    this.blood(u.x, GROUND_Y + u.depth - 30 * u.scale, u.facing * -1);
    if (u.carry > 0) this.goldSpark(u.x, GROUND_Y + u.depth - 20);
  }

  killStatue(s) {
    s.dead = true;
    s.hp = 0;
    this.over = true;
    this.overT = 0;
    this.result = s.team === 1 ? 'defeat' : 'victory';
    this.timeScale = 0.32;
    this.camera.shake = 22;
    this.sfx('crumble', s.x);
    // debris
    for (let i = 0; i < 46; i++) {
      this.addParticle({
        x: s.x + randRange(-60, 60), y: GROUND_Y - randRange(20, 250),
        vx: randRange(-160, 160), vy: randRange(-260, -40), g: 620,
        life: randRange(0.8, 1.8), max: 1.8, size: randRange(4, 11),
        color: ['#9aa2ad', '#7d8590', '#b8c0c8', '#6f7681'][(Math.random() * 4) | 0],
        kind: 'chunk', rot: Math.random() * 7, vr: randRange(-8, 8),
      });
    }
    this.burst(s.x, GROUND_Y - 40, 20, { color: '#c3cad3', spread: 160, life: 1.2, g: 120, kind: 'smoke', size: 10 });
    if (this.hooks.onStatueFall) this.hooks.onStatueFall(this.result);
  }

  // -------------------------------------------------------------------------
  // Targeting
  // -------------------------------------------------------------------------
  findTarget(u, maxD) {
    const cfg = u.cfg || UNIT_TYPES[u.type];
    const bd0 = maxD != null ? maxD : (cfg.ranged ? AGGRO.ranged : AGGRO.melee) * (u.type === 'giant' ? 1.25 : 1);
    let best = null, bd = bd0;
    // pass 1: combat units & statues take priority (miners are "transparent"
    // to marching armies, like the classic game — raids are a manual job)
    for (const e of this.units) {
      if (e.team === u.team || e.dead || e.type === 'miner') continue;
      const d = Math.abs(e.x - u.x);
      if (d < bd) { bd = d; best = e; }
    }
    const es = this.statues[u.team === 1 ? 2 : 1];
    if (!es.dead) {
      const d = Math.abs(es.x - u.x) - 40;
      if (d < bd) best = es;
    }
    if (best) return best;
    // pass 2: nothing else around → miners are fair game
    bd = bd0 * 0.7;
    for (const e of this.units) {
      if (e.team === u.team || e.dead || e.type !== 'miner') continue;
      const d = Math.abs(e.x - u.x);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Projectiles
  // -------------------------------------------------------------------------
  spawnProjectile(u, target) {
    const cfg = u.cfg;
    const ox = u.x + u.facing * 12;
    const oy = GROUND_Y + u.depth - 52 * u.scale;
    let tx, ty;
    if (target) {
      tx = target.x;
      ty = target.isStatue ? GROUND_Y - 150 : GROUND_Y + target.depth - 42 * target.scale;
      tx += (target.vx || 0) * 0.28;
    } else {
      tx = u.x + u.facing * 520;
      ty = GROUND_Y - 44;
    }
    const d = Math.abs(tx - ox);
    const speed = cfg.aoe ? 380 : 540;
    const T = clamp(d / speed, 0.22, 1.6);
    const g = cfg.aoe ? 850 : 1500;
    const vx = (tx - ox) / T;
    const vy = ((ty - oy) - 0.5 * g * T * T) / T;
    if (this.projectiles.length > 220) this.projectiles.shift();
    this.projectiles.push({
      team: u.team, x: ox, y: oy, vx, vy, g,
      dmg: cfg.dmg, aoe: cfg.aoe || 0, kind: cfg.aoe ? 'orb' : 'arrow',
      life: T + 2.4,
    });
  }

  updateProjectiles(dt) {
    const ps = this.projectiles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.kind === 'orb' && Math.random() < dt * 40) {
        this.addParticle({ x: p.x, y: p.y, vx: randRange(-8, 8), vy: randRange(-14, -2), g: -6, life: 0.4, max: 0.4, size: randRange(2, 4.5), color: p.team === 1 ? '#8fb7ff' : '#ff9d8f', kind: 'smoke', grow: 8 });
      }
      let hit = false;

      if (p.life <= 0 || p.x < -50 || p.x > WORLD_W + 50) { ps.splice(i, 1); continue; }

      // ground
      if (p.y >= GROUND_Y + 24) {
        if (p.aoe) this.explode(p.x, GROUND_Y + 10, p.aoe, p.dmg, p.team);
        else this.puff(p.x, GROUND_Y + 18);
        ps.splice(i, 1);
        continue;
      }

      // units
      for (const u of this.units) {
        if (u.team === p.team || u.dead) continue;
        const gy = GROUND_Y + u.depth;
        const h = 66 * u.scale;
        if (Math.abs(u.x - p.x) < 15 * u.scale && p.y > gy - h && p.y < gy + 3) {
          if (p.aoe) this.explode(p.x, p.y, p.aoe, p.dmg, p.team);
          else {
            this.damage(u, p.dmg, { team: p.team, x: p.x });
            this.sfx('thud', p.x);
            this.puff(p.x, p.y);
          }
          hit = true;
          break;
        }
      }
      if (hit) { ps.splice(i, 1); continue; }

      // statues
      const es = this.statues[p.team === 1 ? 2 : 1];
      if (!es.dead && Math.abs(es.x - p.x) < 66 && p.y > GROUND_Y - 250 && p.y < GROUND_Y + 4) {
        if (p.aoe) this.explode(p.x, p.y, p.aoe, p.dmg, p.team);
        else {
          this.damage(es, p.dmg, { team: p.team, x: p.x });
          this.sfx('thud', p.x);
          this.stoneDust(p.x, p.y);
        }
        ps.splice(i, 1);
        continue;
      }
    }
  }

  explode(x, y, radius, dmg, team) {
    this.sfx('boom', x);
    this.camera.shake = Math.max(this.camera.shake, 7);
    this.ring(x, y, radius, team === 1 ? '#9cc3ff' : '#ffb0a3');
    this.burst(x, y, 16, { color: team === 1 ? '#7fa8ff' : '#ff8f7d', spread: 170, life: 0.5, g: 60 });
    this.burst(x, y, 8, { color: '#ffe9ae', spread: 110, life: 0.35, g: 60, kind: 'spark' });
    for (const u of this.units) {
      if (u.team === team || u.dead) continue;
      const d = Math.abs(u.x - x);
      if (d < radius) this.damage(u, Math.round(dmg * (1 - 0.5 * (d / radius))), { team, x });
    }
    const es = this.statues[team === 1 ? 2 : 1];
    if (!es.dead && Math.abs(es.x - x) < radius + 70) this.damage(es, Math.round(dmg * 0.8), { team, x });
  }

  // -------------------------------------------------------------------------
  // Crowd separation (soft 1D)
  // -------------------------------------------------------------------------
  separate() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (a.dead || a.ghost > 0) continue;
      const ra = a.type === 'giant' ? 30 : 12;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (b.dead || b.ghost > 0) continue;
        const sameTeam = a.team === b.team;
        // miners slip through their own army: no wall-ins, no marching fights
        if (sameTeam && (a.type === 'miner' || b.type === 'miner')) continue;
        const rb = b.type === 'giant' ? 30 : 12;
        const dx = b.x - a.x;
        const adx = Math.abs(dx);
        let sep = ra + rb;
        let strength = 0.6;
        if (sameTeam) {
          // allies marching the same way don't shove each other
          const da = a.vx !== 0 ? Math.sign(a.vx) : a.facing;
          const db = b.vx !== 0 ? Math.sign(b.vx) : b.facing;
          if (a.wantMove && b.wantMove && da === db) continue;
          sep *= 0.7;
          strength = 0.32;
        } else {
          sep *= 0.78;
        }
        if (adx < sep && adx > 0.0001) {
          const push = (sep - adx) * 0.5 * sign(dx);
          const am = a.attacking ? 0.25 : 1, bm = b.attacking ? 0.25 : 1;
          a.x -= push * am * strength;
          b.x += push * bm * strength;
        }
      }
    }
  }
}
