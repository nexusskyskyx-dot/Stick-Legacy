// ---------------------------------------------------------------------------
// Stick Legacy — enemy (and menu-demo) AI commander.
// Manages economy, trains an evolving army mix, and launches attack waves.
// Also used to drive BOTH sides for the attract-mode battle behind the menu.
// ---------------------------------------------------------------------------
import { STATUE_X } from './config.js';
import { weightedPick } from './util.js';

const WAVE_TAUNTS = [
  'The enemy horde advances!',
  'A red wave marches out!',
  'Enemy army on the attack!',
  'The horde charges!',
];

export class EnemyAI {
  constructor(game, team = 2) {
    this.g = game;
    this.team = team;
    this.t = 0;
    this.next = 1.2 + Math.random() * 1.5;
    this.tauntIdx = 0;
  }

  update(dt) {
    const g = this.g;
    if (g.over) return;

    // passive income trickle (the classic "AI has a budget" cheat) + miners
    const trickle = this.team === 2 ? g.diff.aiTrickle : g.diff.aiTrickle * 0.95;
    g.earn(this.team, trickle * dt);

    this.t += dt;
    this.next -= dt;
    if (this.next > 0) return;
    const reaction = this.team === 2 ? g.diff.aiReaction : 0.9;
    this.next = (0.7 + Math.random() * 0.6) * reaction;

    const team = this.team;
    const isMain = team === 2;

    // ---- economy: keep miners running ----
    const miners = g.countType(team, 'miner');
    const targetMiners = isMain ? g.diff.aiMiners : 4;
    if (miners < targetMiners) {
      if (g.tryTrain(team, 'miner').ok) return;
    }
    // replace miner losses a bit above target on hard
    if (isMain && miners === targetMiners && g.goldOf(2) > 600 && Math.random() < 0.1) {
      g.tryTrain(team, 'miner');
    }

    // ---- wave orders ----
    // Grace period: the horde masses at home before the first assault,
    // giving the player time to build an economy (like the classic game).
    const grace = g.demo
      ? 40
      : isMain
        ? ({ easy: 95, normal: 78, hard: 70 }[g.diff.key] || 78)
        : 55;
    const elapsed = Math.max(0, this.t - grace);
    const army = g.countCombat(team);
    const wave = isMain
      ? Math.ceil((2 + elapsed / 55) * g.diff.waveScale)
      : Math.ceil(2 + elapsed / 50);
    const st = g.stance[team];

    if (this.t > grace && army >= wave && st !== 'attack') {
      g.setStance(team, 'attack');
      if (isMain) {
        g.bannerNow(WAVE_TAUNTS[this.tauntIdx % WAVE_TAUNTS.length]);
        this.tauntIdx++;
      }
    } else if (st === 'attack' && army < Math.max(2, Math.ceil(wave * 0.35))) {
      // spent wave & homeland threatened → fall back and regroup
      const threat = this.ownStatueThreatDist();
      if (threat < 950) g.setStance(team, 'defend');
    }

    // ---- army composition evolves over the battle ----
    const t = this.t;
    const pool = [['sword', 10]];
    if (t > 40) pool.push(['archer', 8]);
    if (t > 80) pool.push(['spear', 7]);
    if (t > 130) pool.push(['mage', 5]);
    if (t > 170 && g.goldOf(team) > 1750) pool.push(['giant', 1.5]);

    const type = weightedPick(pool);
    g.tryTrain(team, type);
  }

  /** Distance of the closest hostile unit to OUR statue. */
  ownStatueThreatDist() {
    const g = this.g;
    const sx = STATUE_X[this.team];
    let best = 1e9;
    for (const u of g.units) {
      if (u.team === this.team || u.dead) continue;
      best = Math.min(best, Math.abs(u.x - sx));
    }
    return best;
  }
}
