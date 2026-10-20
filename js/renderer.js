// ---------------------------------------------------------------------------
// Stick Legacy — canvas renderer.
// Parallax mountains/hills/trees, fortified bases with torches & banners,
// gold mines, carved statues, animated stick units, projectiles, particles.
// Pure drawing: reads Game state, never mutates logic.
// ---------------------------------------------------------------------------
import {
  VIEW_W, VIEW_H, WORLD_W, GROUND_Y, TEAM_COLORS, STATUE_X, MINE_X,
} from './config.js';
import {
  drawStickman, walkPose, runPose, idlePose, attackPose, deathPose, heroPose,
  WEAP_REST,
} from './stickman.js';
import { clamp, mulberry32 } from './util.js';

const STONE = { body: '#aeb8c2', limbBack: '#8b95a0', team: '#8b95a0', dark: '#7d8590' };

export class Renderer {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.deco = this.buildDeco();
  }

  buildDeco() {
    const r = mulberry32(20260220);
    const d = { farPeaks: [], nearPeaks: [], hills: [], hills2: [], trees: [], trees2: [], rocks: [], bushes: [], tufts: [], clouds: [], birds: [] };
    // far mountains (parallax .18)
    let x = -300;
    while (x < WORLD_W * 0.18 + VIEW_W + 600) {
      d.farPeaks.push({ x, h: 150 + r() * 240, w: 220 + r() * 260 });
      x += 170 + r() * 130;
    }
    // near mountains (parallax .32)
    x = -300;
    while (x < WORLD_W * 0.32 + VIEW_W + 600) {
      d.nearPeaks.push({ x, h: 110 + r() * 180, w: 200 + r() * 240 });
      x += 190 + r() * 150;
    }
    // rolling hills (.5)
    x = -300;
    while (x < WORLD_W * 0.5 + VIEW_W + 600) {
      d.hills.push({ x, h: 70 + r() * 90, w: 260 + r() * 300 });
      x += 200 + r() * 180;
    }
    // bushy hills (.68)
    x = -200;
    while (x < WORLD_W * 0.68 + VIEW_W + 400) {
      d.hills2.push({ x, h: 40 + r() * 60, w: 200 + r() * 220 });
      x += 160 + r() * 140;
    }
    // distant pines (.8)
    for (let i = 0; i < 70; i++) {
      d.trees.push({ x: r() * (WORLD_W * 0.8 + VIEW_W), s: 0.6 + r() * 0.7, v: r() });
    }
    // near pines (.92)
    for (let i = 0; i < 46; i++) {
      d.trees2.push({ x: r() * (WORLD_W * 0.92 + VIEW_W), s: 0.8 + r() * 0.6, v: r() });
    }
    // world-space (1.0) rocks / bushes / tufts, avoiding base footprints a bit
    for (let i = 0; i < 90; i++) {
      const wx = 120 + r() * (WORLD_W - 240);
      d.rocks.push({ x: wx, s: 0.5 + r() * 1.1 });
    }
    for (let i = 0; i < 60; i++) {
      d.bushes.push({ x: 100 + r() * (WORLD_W - 200), s: 0.6 + r() * 0.9 });
    }
    for (let i = 0; i < 220; i++) {
      d.tufts.push({ x: r() * WORLD_W, s: 0.6 + r() * 0.8, ph: r() * 7 });
    }
    for (let i = 0; i < 9; i++) {
      d.clouds.push({ x: r() * 2400, y: 40 + r() * 150, s: 0.6 + r() * 1.1, sp: 4 + r() * 8 });
    }
    for (let i = 0; i < 4; i++) {
      d.birds.push({ x: r() * WORLD_W, y: 90 + r() * 120, sp: 16 + r() * 14, ph: r() * 7 });
    }
    return d;
  }

  // ===========================================================================
  render(ctx, dt) {
    this.t += dt;
    const g = this.g;
    const cam = g.camera;
    const sx = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 2 : 0;
    const sy = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 1.5 : 0;

    this.drawSky(ctx, cam);
    this.drawRidges(ctx, cam);
    this.drawHills(ctx, cam);
    this.drawTreeLines(ctx, cam);

    ctx.save();
    ctx.translate(Math.round(-cam.x + sx), Math.round(sy));
    const vl = cam.x - 540, vr = cam.x + VIEW_W + 540;
    this.drawGround(ctx, cam);
    if (STATUE_X[1] + 400 > vl) this.drawBase(ctx, 1);
    if (STATUE_X[2] - 400 < vr) this.drawBase(ctx, 2);
    if (MINE_X[1] + 160 > vl && MINE_X[1] - 160 < vr) this.drawMine(ctx, g.mines[1]);
    if (MINE_X[2] + 160 > vl && MINE_X[2] - 160 < vr) this.drawMine(ctx, g.mines[2]);
    this.drawEntities(ctx, vl, vr);
    this.drawProjectiles(ctx);
    this.drawParticles(ctx);
    this.drawStatueBars(ctx, vl, vr);
    this.drawTexts(ctx);
    ctx.restore();

    this.drawOverlayFx(ctx);
  }

  // -------------------------------------------------------------------------
  // Sky & parallax layers
  // -------------------------------------------------------------------------
  drawSky(ctx, cam) {
    const gr = ctx.createLinearGradient(0, 0, 0, GROUND_Y + 40);
    gr.addColorStop(0, '#7db9e0');
    gr.addColorStop(0.55, '#a8d4ec');
    gr.addColorStop(1, '#e2f1f4');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // sun
    const sunX = 1030 - cam.x * 0.03;
    const gl = ctx.createRadialGradient(sunX, 118, 6, sunX, 118, 130);
    gl.addColorStop(0, 'rgba(255,248,214,0.95)');
    gl.addColorStop(0.25, 'rgba(255,240,190,0.4)');
    gl.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(sunX, 118, 130, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath(); ctx.arc(sunX, 118, 26, 0, Math.PI * 2); ctx.fill();

    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const c of this.deco.clouds) {
      let cx = c.x + this.t * c.sp - cam.x * 0.07;
      cx = ((cx % 2600) + 2600) % 2600 - 400;
      this.cloud(ctx, cx, c.y, c.s);
    }
    // birds
    ctx.strokeStyle = 'rgba(40,50,60,0.55)';
    ctx.lineWidth = 1.6;
    for (const b of this.deco.birds) {
      let bx = b.x + this.t * b.sp - cam.x * 0.1;
      bx = ((bx % (WORLD_W + 400)) + WORLD_W + 400) % (WORLD_W + 400) - 200;
      if (bx < -50 || bx > VIEW_W + 50) continue;
      const f = Math.sin(this.t * 6 + b.ph) * 4;
      ctx.beginPath();
      ctx.moveTo(bx - 7, b.y + f); ctx.quadraticCurveTo(bx - 3, b.y - 3, bx, b.y);
      ctx.quadraticCurveTo(bx + 3, b.y - 3, bx + 7, b.y + f);
      ctx.stroke();
    }
  }

  cloud(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 22 * s, 0, Math.PI * 2);
    ctx.arc(x + 24 * s, y - 9 * s, 26 * s, 0, Math.PI * 2);
    ctx.arc(x + 52 * s, y, 20 * s, 0, Math.PI * 2);
    ctx.arc(x + 26 * s, y + 9 * s, 22 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  ridgeLayer(ctx, cam, factor, peaks, baseY, color, snowLine) {
    const off = -cam.x * factor;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(off - 400, VIEW_H);
    for (const p of peaks) {
      const px = off + p.x;
      if (px < -p.w - 200 || px > VIEW_W + p.w + 200) { ctx.lineTo(px, baseY); continue; }
      ctx.lineTo(px - p.w / 2, baseY);
      ctx.lineTo(px, baseY - p.h);
      ctx.lineTo(px + p.w / 2, baseY);
    }
    ctx.lineTo(off + WORLD_W * factor + VIEW_W + 800, VIEW_H);
    ctx.closePath();
    ctx.fill();
    if (snowLine) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const p of peaks) {
        if (p.h < snowLine) continue;
        const px = off + p.x;
        if (px < -p.w - 200 || px > VIEW_W + p.w + 200) continue;
        const hgt = p.h * 0.22;
        ctx.beginPath();
        ctx.moveTo(px, baseY - p.h);
        ctx.lineTo(px - p.w * 0.11, baseY - p.h + hgt);
        ctx.lineTo(px - p.w * 0.04, baseY - p.h + hgt * 0.7);
        ctx.lineTo(px + p.w * 0.03, baseY - p.h + hgt);
        ctx.lineTo(px + p.w * 0.11, baseY - p.h + hgt * 0.75);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  drawRidges(ctx, cam) {
    this.ridgeLayer(ctx, cam, 0.18, this.deco.farPeaks, GROUND_Y - 30, '#9db1c6', 190);
    this.ridgeLayer(ctx, cam, 0.32, this.deco.nearPeaks, GROUND_Y - 16, '#7f96a6', null);
  }

  drawHills(ctx, cam) {
    // green rolling hills
    const off = -cam.x * 0.5;
    ctx.fillStyle = '#6f9a58';
    ctx.beginPath();
    ctx.moveTo(off - 400, VIEW_H);
    for (const h of this.deco.hills) {
      const hx = off + h.x;
      if (hx < -h.w || hx > VIEW_W + h.w) { ctx.lineTo(hx, GROUND_Y - 4); continue; }
      ctx.lineTo(hx - h.w / 2, GROUND_Y - 4);
      ctx.quadraticCurveTo(hx, GROUND_Y - 4 - h.h, hx + h.w / 2, GROUND_Y - 4);
    }
    ctx.lineTo(off + WORLD_W * 0.5 + VIEW_W + 800, VIEW_H);
    ctx.closePath();
    ctx.fill();

    // darker bushy band
    const off2 = -cam.x * 0.68;
    ctx.fillStyle = '#54803f';
    ctx.beginPath();
    ctx.moveTo(off2 - 400, VIEW_H);
    for (const h of this.deco.hills2) {
      const hx = off2 + h.x;
      if (hx < -h.w || hx > VIEW_W + h.w) { ctx.lineTo(hx, GROUND_Y - 2); continue; }
      ctx.lineTo(hx - h.w / 2, GROUND_Y - 2);
      ctx.quadraticCurveTo(hx, GROUND_Y - 2 - h.h, hx + h.w / 2, GROUND_Y - 2);
    }
    ctx.lineTo(off2 + WORLD_W * 0.68 + VIEW_W + 800, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }

  pine(ctx, x, baseY, s, color, trunk) {
    const H = 64 * s;
    ctx.fillStyle = trunk;
    ctx.fillRect(x - 2.2 * s, baseY - 8 * s, 4.4 * s, 9 * s);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, baseY - H);
    ctx.lineTo(x - 15 * s, baseY - H * 0.42);
    ctx.lineTo(x - 7 * s, baseY - H * 0.46);
    ctx.lineTo(x - 19 * s, baseY - 4 * s);
    ctx.lineTo(x + 19 * s, baseY - 4 * s);
    ctx.lineTo(x + 7 * s, baseY - H * 0.46);
    ctx.lineTo(x + 15 * s, baseY - H * 0.42);
    ctx.closePath();
    ctx.fill();
  }

  drawTreeLines(ctx, cam) {
    const off = -cam.x * 0.8;
    for (const t of this.deco.trees) {
      const x = off + t.x;
      if (x < -60 || x > VIEW_W + 60) continue;
      this.pine(ctx, x, GROUND_Y - 24, t.s * 0.9, t.v < 0.5 ? '#3f6b3a' : '#457039', '#4a3620');
    }
    const off2 = -cam.x * 0.92;
    for (const t of this.deco.trees2) {
      const x = off2 + t.x;
      if (x < -70 || x > VIEW_W + 70) continue;
      this.pine(ctx, x, GROUND_Y - 10, t.s, t.v < 0.5 ? '#35612f' : '#2f5a2c', '#40301c');
    }
  }

  // -------------------------------------------------------------------------
  // Ground & world decoration
  // -------------------------------------------------------------------------
  drawGround(ctx, cam) {
    const x0 = cam.x - 60, x1 = cam.x + VIEW_W + 60;
    const gr = ctx.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
    gr.addColorStop(0, '#8a6a45');
    gr.addColorStop(0.25, '#7a5c3c');
    gr.addColorStop(1, '#58412a');
    ctx.fillStyle = gr;
    ctx.fillRect(x0, GROUND_Y, x1 - x0, VIEW_H - GROUND_Y + 10);
    // grass cap
    ctx.fillStyle = '#6f9e4f';
    ctx.fillRect(x0, GROUND_Y - 5, x1 - x0, 8);
    ctx.fillStyle = '#5d8a40';
    ctx.fillRect(x0, GROUND_Y + 3, x1 - x0, 3);

    // pebbles (deterministic, from tufts hash)
    ctx.fillStyle = 'rgba(60,45,30,0.5)';
    for (const rk of this.deco.rocks) {
      if (rk.x < x0 || rk.x > x1) continue;
      ctx.beginPath();
      ctx.ellipse(rk.x, GROUND_Y + 14 + (rk.s * 13) % 40, 4 * rk.s + 2, 2.4 * rk.s + 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // swaying tufts
    ctx.strokeStyle = '#5d8a40';
    ctx.lineWidth = 1.8;
    for (const tf of this.deco.tufts) {
      if (tf.x < x0 || tf.x > x1) continue;
      const sway = Math.sin(this.t * 1.8 + tf.ph) * 2.4 * tf.s;
      const y = GROUND_Y - 2;
      ctx.beginPath();
      ctx.moveTo(tf.x, y); ctx.quadraticCurveTo(tf.x + sway * 0.4, y - 6 * tf.s, tf.x + sway, y - 10 * tf.s);
      ctx.moveTo(tf.x + 3, y); ctx.quadraticCurveTo(tf.x + 3 + sway * 0.3, y - 5 * tf.s, tf.x + 4 + sway * 0.8, y - 8 * tf.s);
      ctx.stroke();
    }
    // bushes
    for (const b of this.deco.bushes) {
      if (b.x < x0 - 40 || b.x > x1 + 40) continue;
      ctx.fillStyle = '#3f6b34';
      ctx.beginPath();
      ctx.arc(b.x, GROUND_Y - 2, 9 * b.s, Math.PI, 0);
      ctx.arc(b.x + 10 * b.s, GROUND_Y - 2, 7 * b.s, Math.PI, 0);
      ctx.arc(b.x - 9 * b.s, GROUND_Y - 2, 6 * b.s, Math.PI, 0);
      ctx.fill();
    }
  }

  drawDecoWorld(ctx, cam) { /* kept for future world props */ }

  // -------------------------------------------------------------------------
  // Bases: walls, banners, torches, statue
  // -------------------------------------------------------------------------
  drawBases(ctx) {
    this.drawBase(ctx, 1);
    this.drawBase(ctx, 2);
  }

  drawBase(ctx, team) {
    const sx = STATUE_X[team];
    const C = TEAM_COLORS[team];

    // wall behind (extends outward from statue)
    const wx0 = team === 1 ? sx - 330 : sx - 60;
    const wx1 = team === 1 ? sx + 60 : sx + 330;
    const wallH = 118;
    const wy = GROUND_Y - wallH;
    ctx.fillStyle = '#6d7480';
    ctx.fillRect(wx0, wy, wx1 - wx0, wallH);
    // block pattern
    ctx.strokeStyle = 'rgba(30,34,42,0.35)';
    ctx.lineWidth = 1.5;
    for (let y = wy + 20; y < GROUND_Y; y += 20) {
      ctx.beginPath(); ctx.moveTo(wx0, y); ctx.lineTo(wx1, y); ctx.stroke();
    }
    for (let x = wx0, row = 0; x < wx1; x += 44, row++) {
      for (let y = wy + (row % 2 ? 10 : 0); y < GROUND_Y; y += 40) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(y + 40, GROUND_Y)); ctx.stroke();
      }
    }
    // merlons
    ctx.fillStyle = '#7b828e';
    for (let x = wx0; x < wx1 - 14; x += 34) ctx.fillRect(x, wy - 14, 20, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(wx0, wy, wx1 - wx0, 5);

    // banners
    for (const bxp of [wx0 + (wx1 - wx0) * 0.28, wx0 + (wx1 - wx0) * 0.72]) {
      const wave = Math.sin(this.t * 2.4 + bxp) * 7;
      ctx.strokeStyle = '#4a3620';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(bxp, wy - 10); ctx.lineTo(bxp, wy - 66); ctx.stroke();
      ctx.fillStyle = C.main;
      ctx.beginPath();
      ctx.moveTo(bxp + 2, wy - 64);
      ctx.quadraticCurveTo(bxp + 26, wy - 60 + wave * 0.5, bxp + 44, wy - 56 + wave);
      ctx.lineTo(bxp + 40, wy - 40 + wave * 0.7);
      ctx.lineTo(bxp + 46, wy - 26 + wave);
      ctx.quadraticCurveTo(bxp + 24, wy - 30 + wave * 0.4, bxp + 2, wy - 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(bxp + 2, wy - 46, 40, 3);
    }

    // torches
    for (const tx of [wx0 + 30, wx1 - 30]) {
      ctx.strokeStyle = '#4a3620';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(tx, wy + 8); ctx.lineTo(tx, wy - 26); ctx.stroke();
      const fl = Math.sin(this.t * 9 + tx) * 2 + Math.sin(this.t * 23 + tx * 2) * 1.4;
      const fx = tx, fy = wy - 30;
      const gl = ctx.createRadialGradient(fx, fy, 1, fx, fy, 34);
      gl.addColorStop(0, 'rgba(255,180,80,0.5)');
      gl.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(fx, fy, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff9d33';
      ctx.beginPath();
      ctx.moveTo(fx - 5, fy + 3);
      ctx.quadraticCurveTo(fx - 4 + fl * 0.4, fy - 10, fx + fl * 0.6, fy - 17 - Math.abs(fl));
      ctx.quadraticCurveTo(fx + 4 + fl * 0.4, fy - 9, fx + 5, fy + 3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.moveTo(fx - 2.4, fy + 2);
      ctx.quadraticCurveTo(fx + fl * 0.3, fy - 6, fx + fl * 0.4, fy - 10);
      ctx.quadraticCurveTo(fx + 2.4 + fl * 0.2, fy - 5, fx + 2.4, fy + 2);
      ctx.closePath(); ctx.fill();
    }
  }

  drawStatue(ctx, s) {
    const team = s.team;
    const C = TEAM_COLORS[team];
    const dir = team === 1 ? 1 : -1;
    const x = s.x;
    const flash = s.hitFlash;

    // dais
    ctx.fillStyle = '#848c98';
    ctx.fillRect(x - 96, GROUND_Y - 22, 192, 24);
    ctx.fillStyle = '#98a0ac';
    ctx.fillRect(x - 78, GROUND_Y - 44, 156, 24);
    ctx.fillStyle = '#a8b0ba';
    ctx.fillRect(x - 58, GROUND_Y - 60, 116, 18);
    ctx.strokeStyle = 'rgba(30,34,42,0.3)';
    ctx.lineWidth = 1.4;
    for (const [yy, w] of [[GROUND_Y - 22, 192], [GROUND_Y - 44, 156]]) {
      ctx.beginPath(); ctx.moveTo(x - w / 2, yy); ctx.lineTo(x + w / 2, yy); ctx.stroke();
    }
    // team inlay on dais
    ctx.fillStyle = C.main;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(x - 58, GROUND_Y - 47, 116, 4);
    ctx.globalAlpha = 1;

    if (s.dead) {
      // broken stump + rubble
      ctx.fillStyle = '#8b939e';
      ctx.beginPath();
      ctx.moveTo(x - 34, GROUND_Y - 60);
      ctx.lineTo(x - 26, GROUND_Y - 96);
      ctx.lineTo(x - 6, GROUND_Y - 80);
      ctx.lineTo(x + 12, GROUND_Y - 104);
      ctx.lineTo(x + 30, GROUND_Y - 60);
      ctx.closePath(); ctx.fill();
      for (const rx of [-70, -46, 40, 66]) {
        ctx.beginPath();
        ctx.ellipse(x + rx, GROUND_Y - 8 + (rx % 7), 10 + (rx % 5), 5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#7d8590'; ctx.fill();
      }
      return;
    }

    // carved hero figure
    const shX = x + (flash > 0 ? (Math.random() - 0.5) * 3 : 0);
    const colors = flash > 0.4
      ? { body: '#e8edf3', limbBack: '#c8d0d9', team: C.main, dark: '#c8d0d9' }
      : Object.assign({}, STONE, { team: C.dark });
    drawStickman(ctx, {
      x: shX, y: GROUND_Y - 58, facing: dir, scale: 2.25,
      pose: heroPose(this.t),
      colors, lw: 7,
      weapon: 'sword',
      extras: { cape: C.dark, capeWave: this.t * 1.4, stone: true },
    });

    // glowing eyes
    const eyePulse = 0.55 + Math.sin(this.t * 2.2) * 0.2;
    const eyeY = GROUND_Y - 191;
    ctx.fillStyle = C.main;
    ctx.globalAlpha = eyePulse * (s.hp / s.maxHp * 0.7 + 0.3);
    ctx.beginPath(); ctx.arc(x + dir * 8, eyeY, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // cracks as hp drops
    const pct = s.hp / s.maxHp;
    ctx.strokeStyle = 'rgba(25,28,34,0.75)';
    ctx.lineWidth = 2;
    if (pct < 0.66) {
      ctx.beginPath();
      ctx.moveTo(x - 20, GROUND_Y - 150); ctx.lineTo(x - 8, GROUND_Y - 128);
      ctx.lineTo(x - 16, GROUND_Y - 108); ctx.lineTo(x - 4, GROUND_Y - 88);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 40, GROUND_Y - 34); ctx.lineTo(x + 22, GROUND_Y - 26); ctx.lineTo(x + 30, GROUND_Y - 12);
      ctx.stroke();
    }
    if (pct < 0.33) {
      ctx.beginPath();
      ctx.moveTo(x + 14, GROUND_Y - 190); ctx.lineTo(x + 4, GROUND_Y - 160);
      ctx.lineTo(x + 18, GROUND_Y - 130); ctx.lineTo(x + 6, GROUND_Y - 96);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 52, GROUND_Y - 40); ctx.lineTo(x - 36, GROUND_Y - 30); ctx.lineTo(x - 48, GROUND_Y - 14);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 2, GROUND_Y - 214); ctx.lineTo(x + 6, GROUND_Y - 186);
      ctx.stroke();
    }
  }

  drawStatueBars(ctx, vl, vr) {
    for (const team of [1, 2]) {
      const s = this.g.statues[team];
      if (s.dead) continue;
      if (s.x + 140 < vl || s.x - 140 > vr) continue;
      const C = TEAM_COLORS[team];
      const w = 250, h = 16;
      const x = s.x - w / 2;
      const y = GROUND_Y - 336;
      const pct = clamp(s.hp / s.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(12,15,21,0.78)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 4, y - 4, w + 8, h + 8, 6) : ctx.rect(x - 4, y - 4, w + 8, h + 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      const gr = ctx.createLinearGradient(x, y, x, y + h);
      gr.addColorStop(0, C.main);
      gr.addColorStop(1, C.dark);
      ctx.fillStyle = gr;
      ctx.fillRect(x, y, w * pct, h);
      // segment ticks
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 10; i++) {
        ctx.beginPath(); ctx.moveTo(x + (w / 10) * i, y); ctx.lineTo(x + (w / 10) * i, y + h); ctx.stroke();
      }
      ctx.font = '600 15px Oswald, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = team === 1 ? '#cfe6ff' : '#ffd9d2';
      ctx.fillText((team === 1 ? 'YOUR STATUE  ' : 'ENEMY STATUE  ') + Math.ceil(s.hp) + ' / ' + s.maxHp, s.x, y - 10);
    }
  }

  // -------------------------------------------------------------------------
  // Gold mine
  // -------------------------------------------------------------------------
  drawMine(ctx, m) {
    const x = m.x + (m.shake > 0 ? (Math.random() - 0.5) * 3 * m.shake : 0);
    const y = GROUND_Y;
    // mound
    ctx.fillStyle = '#6e675e';
    ctx.beginPath();
    ctx.moveTo(x - 96, y);
    ctx.quadraticCurveTo(x - 70, y - 84, x - 10, y - 104);
    ctx.quadraticCurveTo(x + 60, y - 112, x + 98, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7d766c';
    ctx.beginPath();
    ctx.moveTo(x - 60, y);
    ctx.quadraticCurveTo(x - 30, y - 70, x + 14, y - 82);
    ctx.quadraticCurveTo(x + 62, y - 84, x + 84, y);
    ctx.closePath();
    ctx.fill();
    // boulders
    ctx.fillStyle = '#5c564e';
    for (const [bx, by, br] of [[-84, -8, 14], [86, -10, 12], [-40, -66, 10], [50, -60, 9]]) {
      ctx.beginPath(); ctx.arc(x + bx, y + by, br, 0, Math.PI * 2); ctx.fill();
    }
    // mine opening
    ctx.fillStyle = '#241f1a';
    ctx.beginPath();
    ctx.ellipse(x, y - 26, 30, 27, 0, Math.PI, 0);
    ctx.rect(x - 30, y - 26, 60, 26);
    ctx.fill();
    // wooden frame
    ctx.strokeStyle = '#5d4227';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - 36, y); ctx.lineTo(x - 33, y - 56);
    ctx.moveTo(x + 36, y); ctx.lineTo(x + 33, y - 56);
    ctx.moveTo(x - 40, y - 58); ctx.lineTo(x + 40, y - 58);
    ctx.stroke();
    // gold veins
    ctx.fillStyle = '#e8b93c';
    const veins = [[-52, -44], [-30, -80], [8, -92], [34, -66], [58, -38], [-64, -20], [22, -50], [70, -18], [-14, -62]];
    for (const [vx, vy] of veins) {
      const gl = 0.6 + 0.4 * Math.sin(this.t * 3 + vx);
      ctx.globalAlpha = gl;
      ctx.beginPath(); ctx.arc(x + vx, y + vy, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(x + vx + 3, y + vy + 2.4, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    // nugget pile
    ctx.fillStyle = '#ffd76a';
    for (const [nx, ny] of [[-46, -4], [-40, -7], [-34, -4], [-40, -1]]) {
      ctx.beginPath(); ctx.arc(x + nx, y + ny, 3.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // -------------------------------------------------------------------------
  // Entities (depth-sorted), projectiles, particles, texts
  // -------------------------------------------------------------------------
  drawEntities(ctx, vl, vr) {
    const g = this.g;
    const list = [];
    for (const u of g.units) {
      if (u.x + 140 < vl || u.x - 140 > vr) continue;
      list.push({ y: GROUND_Y + u.depth, u });
    }
    // statues sort at ground level so units can pass in front of or behind them
    for (const k of [1, 2]) {
      const s = g.statues[k];
      if (s.x + 340 < vl || s.x - 340 > vr) continue;
      list.push({ y: GROUND_Y + 1, statue: s });
    }
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.statue) this.drawStatue(ctx, it.statue);
      else this.drawUnit(ctx, it.u);
    }
  }

  poseFor(u) {
    const cfg = u.cfg;
    if (u.dead) {
      const p = clamp(u.deadT / 0.9, 0, 1);
      const pose = deathPose(p);
      pose.weap = WEAP_REST[cfg.weapon] + p * 1.6;
      return pose;
    }
    if (u.attacking) {
      const dur = u.attackKind === 'mine' ? 1.15 : (1 / cfg.atkSpeed) * (u.type === 'giant' ? 1.05 : 1);
      const kind = u.attackKind === 'mine' ? 'pick' : cfg.weapon;
      return attackPose(kind, clamp(u.attackT / dur, 0, 1));
    }
    if (u.type === 'miner' && u.mstate === 'mining') {
      const p = idlePose(u.animT + u.phase);
      p.weap = WEAP_REST.pick;
      p.ra = { s: -0.9, e: 0.7 };
      return p;
    }
    if (u.moving) {
      const fast = u.mstate === 'flee' || Math.abs(u.vx) > cfg.speed * 1.15;
      const p = fast ? runPose(u.animT * (cfg.speed / 100)) : walkPose(u.animT * (cfg.speed / 100));
      p.weap = WEAP_REST[cfg.weapon];
      return p;
    }
    const p = idlePose(u.animT + u.phase);
    p.weap = WEAP_REST[cfg.weapon];
    return p;
  }

  drawUnit(ctx, u) {
    const cfg = u.cfg;
    const C = TEAM_COLORS[u.team];
    const gy = GROUND_Y + u.depth;
    const S = u.scale;

    // shadow
    ctx.fillStyle = 'rgba(20,16,10,0.22)';
    ctx.beginPath();
    ctx.ellipse(u.x, gy + 2, 15 * S, 4.2 * S, 0, 0, Math.PI * 2);
    ctx.fill();

    // selection / possession rings
    if (u === this.g.selected && !u.dead) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.ellipse(u.x, gy + 2, 18 * S, 6 * S, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (u === this.g.possessed && !u.dead) {
      const pulse = 0.6 + Math.sin(this.t * 6) * 0.25;
      ctx.strokeStyle = `rgba(255,215,106,${pulse})`;
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.ellipse(u.x, gy + 2, 20 * S, 7 * S, 0, 0, Math.PI * 2); ctx.stroke();
      // little chevrons above head
      const hy = gy - 92 * S - Math.sin(this.t * 5) * 3;
      ctx.fillStyle = `rgba(255,215,106,${pulse})`;
      ctx.beginPath();
      ctx.moveTo(u.x - 6, hy - 8); ctx.lineTo(u.x, hy); ctx.lineTo(u.x + 6, hy - 8);
      ctx.lineTo(u.x + 3, hy - 8); ctx.lineTo(u.x, hy - 4.4); ctx.lineTo(u.x - 3, hy - 8);
      ctx.closePath(); ctx.fill();
    }

    let alpha = u.spawnT < 1 ? u.spawnT : 1;
    if (u.dead && u.deadT > 1.5) alpha = clamp(1 - (u.deadT - 1.5) / 1.1, 0, 1);

    const pose = this.poseFor(u);
    // hit recoil (lean back in local space)
    if (u.hitFlash > 0 && !u.dead) {
      pose.lean -= u.hitFlash * 0.18;
      pose.head -= u.hitFlash * 0.12;
    }
    const flash = u.hitFlash > 0.45 && !u.dead;
    const colors = flash
      ? { body: '#ffd9d0', limbBack: '#e8b0a4', team: '#fff', dark: '#e8b0a4' }
      : { body: C.body, limbBack: C.limbBack, team: C.main, dark: C.dark };

    const extras = {
      draw: pose.extra,
      glow: cfg.weapon === 'staff' && !u.attacking ? 0.16 + Math.sin(this.t * 2 + u.phase) * 0.08 : pose.extra,
      carry: u.type === 'miner' ? clamp(u.carry / 22, 0, 1.001) : 0,
      flap: this.t * (u.moving ? 11 : 3) + u.phase,
    };

    drawStickman(ctx, {
      x: u.x, y: gy, facing: u.facing, scale: S, pose,
      colors, lw: S > 1.7 ? 5.6 : 2.8 * S,
      weapon: cfg.weapon, extras, alpha,
    });

    // hp bar
    if (!u.dead && (u.hp < u.maxHp || u === this.g.selected || u === this.g.possessed)) {
      const w = 30 * Math.min(S, 1.6), h = 4;
      const bx = u.x - w / 2;
      const by = gy - 78 * S - 10;
      const pct = clamp(u.hp / u.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(10,12,16,0.66)';
      ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
      ctx.fillStyle = pct > 0.55 ? '#67d45a' : pct > 0.28 ? '#e8c33c' : '#e05242';
      ctx.fillRect(bx, by, w * pct, h);
    }
  }

  drawProjectiles(ctx) {
    for (const p of this.g.projectiles) {
      const a = Math.atan2(p.vy, p.vx);
      if (p.kind === 'arrow') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(a);
        ctx.strokeStyle = '#8a6a42';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(7, 0); ctx.stroke();
        ctx.fillStyle = '#c8ced8';
        ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(5, -2.4); ctx.lineTo(5, 2.4); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = TEAM_COLORS[p.team].main;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-11, -2.6); ctx.moveTo(-15, 0); ctx.lineTo(-11, 2.6); ctx.stroke();
        ctx.restore();
      } else {
        const C = TEAM_COLORS[p.team];
        const gl = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 16);
        gl.addColorStop(0, p.team === 1 ? 'rgba(160,200,255,0.95)' : 'rgba(255,170,150,0.95)');
        gl.addColorStop(0.4, p.team === 1 ? 'rgba(90,150,255,0.6)' : 'rgba(255,110,90,0.6)');
        gl.addColorStop(1, 'rgba(90,150,255,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(p.x, p.y, 4.4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  drawParticles(ctx) {
    for (const p of this.g.particles) {
      const k = clamp(p.life / p.max, 0, 1);
      switch (p.kind) {
        case 'dot':
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
          break;
        case 'spark':
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * 0.8;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
          ctx.stroke();
          break;
        case 'smoke':
          ctx.globalAlpha = k * 0.4;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - k), 0, Math.PI * 2); ctx.fill();
          break;
        case 'ring':
          ctx.globalAlpha = k * 0.9;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * k + 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'chunk':
          ctx.globalAlpha = k;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8);
          ctx.restore();
          break;
      }
      ctx.globalAlpha = 1;
    }
  }

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    for (const t of this.g.texts) {
      const k = clamp(t.life / t.max, 0, 1);
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.font = '700 17px Oswald, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,12,16,0.8)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------
  // Screen effects
  // -------------------------------------------------------------------------
  drawOverlayFx(ctx) {
    // vignette
    const gr = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
    gr.addColorStop(0, 'rgba(8,10,14,0)');
    gr.addColorStop(1, 'rgba(8,10,14,0.3)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // low-hp pulse while possessing
    const u = this.g.possessed;
    if (u && !u.dead && u.hp < u.maxHp * 0.3) {
      const a = 0.12 + Math.sin(this.t * 7) * 0.06;
      const rg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.8);
      rg.addColorStop(0, 'rgba(190,30,20,0)');
      rg.addColorStop(1, `rgba(190,30,20,${a})`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }
}
