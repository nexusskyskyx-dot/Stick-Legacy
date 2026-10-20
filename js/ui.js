// ---------------------------------------------------------------------------
// Stick Legacy — DOM user interface: menus, HUD, unit cards, minimap,
// orders, keyboard/mouse/touch input. Binds DOM events to Game API.
// ---------------------------------------------------------------------------
import {
  VIEW_W, WORLD_W, POP_CAP, UNIT_TYPES, TRAIN_ORDER,
  TEAM_COLORS, STATUE_X, MINE_X,
} from './config.js';
import { drawStickman, idlePose, attackPose, WEAP_REST } from './stickman.js';
import { clamp, fmtTime } from './util.js';
import { toggleMute, play, unlockAudio } from './audio.js';

const $ = (id) => document.getElementById(id);

const HINTS = [
  { t: 2.5, text: 'Train MINERS (1) — gold wins wars.' },
  { t: 12, text: 'Click a unit, then press C to control it yourself.' },
  { t: 24, text: 'Press F to send the whole army attacking.' },
  { t: 40, text: 'Right-click to give your selected unit orders.' },
];

export class UI {
  constructor(callbacks) {
    this.cb = callbacks;
    this.game = null;
    this.mode = 'menu';
    this.diff = 'normal';
    this.keys = new Set();
    this.drag = null;
    this.hintsShown = new Set();
    this.lastVals = {};

    this.cacheRefs();
    this.buildCards();
    this.buildHowto();
    this.bindEvents();
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (this.isTouch) document.body.classList.add('touch');
    this.touch = { left: false, right: false, atk: false };
  }

  cacheRefs() {
    this.el = {
      stage: $('stage'), canvas: $('game'), hud: $('hud'),
      gold: $('gold'), pop: $('pop'), kills: $('kills'), timer: $('timer'),
      minimap: $('minimap'), cards: $('cards'), banner: $('banner'),
      btnDefend: $('btn-defend'), btnAttack: $('btn-attack'), btnPossess: $('btn-possess'),
      btnPause: $('btn-pause'), btnMute: $('btn-mute'), btnQuit: $('btn-quit'),
      possessHint: $('possess-hint'), selChip: $('sel-chip'),
      menu: $('menu'), howto: $('howto'), pause: $('pause'), gameover: $('gameover'),
      goTitle: $('go-title'), goSub: $('go-sub'), goStats: $('go-stats'),
      touchControls: $('touch-controls'),
      tcLeft: $('tc-left'), tcRight: $('tc-right'), tcAtk: $('tc-atk'),
    };
    this.mctx = this.el.minimap.getContext('2d');
  }

  // -------------------------------------------------------------------------
  // Cards & icons
  // -------------------------------------------------------------------------
  drawIcon(canvas, type, team = 1, poseOverride = null) {
    const dpr = 2;
    const size = 52;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const cfg = UNIT_TYPES[type];
    const C = TEAM_COLORS[team];
    const S = (cfg.scale || 1) > 1.7 ? 0.26 : 0.6;
    const pose = poseOverride || idlePose(0.6);
    pose.weap = WEAP_REST[cfg.weapon];
    ctx.fillStyle = 'rgba(20,16,10,0.2)';
    ctx.beginPath(); ctx.ellipse(25, 50, 12 * S + 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    drawStickman(ctx, {
      x: 24, y: 50, facing: 1, scale: S, pose,
      colors: { body: C.body, limbBack: C.limbBack, team: C.main, dark: C.dark },
      lw: S > 0.4 ? 2.8 * S : 4.5,
      weapon: cfg.weapon,
      extras: { glow: cfg.weapon === 'staff' ? 0.3 : 0, draw: pose.extra || 0, flap: 0 },
    });
  }

  buildCards() {
    const wrap = this.el.cards;
    wrap.innerHTML = '';
    this.cardEls = {};
    for (const key of TRAIN_ORDER) {
      const cfg = UNIT_TYPES[key];
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.type = 'button';
      btn.innerHTML = `
        <kbd>${cfg.hotkey}</kbd>
        <canvas class="card-icon"></canvas>
        <div class="c-name">${cfg.name}</div>
        <div class="c-cost"><span class="coin">◉</span><span class="c-cost-v">${cfg.cost}</span></div>`;
      btn.addEventListener('click', (e) => { e.preventDefault(); this.train(key); });
      wrap.appendChild(btn);
      this.cardEls[key] = btn;
      const icon = btn.querySelector('canvas');
      const pose = key === 'archer' ? attackPose('bow', 0.46) : idlePose(0.6);
      this.drawIcon(icon, key, 1, pose);
    }
  }

  buildHowto() {
    const tbl = $('howto-units');
    tbl.innerHTML = '';
    for (const key of TRAIN_ORDER) {
      const cfg = UNIT_TYPES[key];
      const row = document.createElement('div');
      row.className = 'howto-unit';
      const icon = document.createElement('canvas');
      row.appendChild(icon);
      const info = document.createElement('div');
      info.innerHTML = `<b>${cfg.name}</b> <span class="hu-cost">◉${cfg.cost}</span> <span class="hu-stats">HP ${cfg.hp} · DMG ${cfg.dmg}${cfg.ranged ? ' · RANGED' : ''}</span><br><span class="hu-desc">${cfg.desc}</span>`;
      row.appendChild(info);
      tbl.appendChild(row);
      this.drawIcon(icon, key, 1);
      icon.style.width = '44px';
      icon.style.height = '44px';
    }
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  train(type) {
    unlockAudio();
    if (this.mode !== 'playing' || !this.game) return;
    const res = this.game.tryTrain(1, type);
    if (!res.ok) {
      const card = this.cardEls[type];
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      play('error', 0.8);
      if (res.why === 'gold') this.flashBannerSmall('Not enough gold!');
      else if (res.why === 'pop') this.flashBannerSmall('Population cap reached!');
    }
  }

  flashBannerSmall(text) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.remove('show', 'small');
    void b.offsetWidth;
    b.classList.add('show', 'small');
  }

  banner(text) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.remove('show', 'small');
    void b.offsetWidth;
    b.classList.add('show');
  }

  togglePossess() {
    const g = this.game;
    if (!g || this.mode !== 'playing') return;
    if (g.possessed) { g.releasePossess(); this.refreshPossess(null); return; }
    let u = g.selected;
    if (!u || u.dead) {
      // nearest own unit to camera center
      const cx = g.camera.x + VIEW_W / 2;
      let bd = 1e9;
      u = null;
      for (const c of g.units) {
        if (c.team !== 1 || c.dead) continue;
        const d = Math.abs(c.x - cx);
        if (d < bd) { bd = d; u = c; }
      }
    }
    if (u) { g.possess(u); this.refreshPossess(u); }
  }

  refreshPossess(u) {
    const btn = this.el.btnPossess;
    const hint = this.el.possessHint;
    if (u) {
      btn.classList.add('active');
      btn.innerHTML = '✊ Release <kbd>Esc</kbd>';
      hint.classList.remove('hidden');
      const cfg = UNIT_TYPES[u.type];
      hint.textContent = u.type === 'miner'
        ? `Controlling MINER — A/D move · SPACE: mine gold at the mine, fight nearby foes · haul loads back to the statue`
        : `Controlling ${cfg.name.toUpperCase()} — A/D move · SPACE attack · Esc release`;
      this.el.touchControls.classList.remove('hidden');
    } else {
      btn.classList.remove('active');
      btn.innerHTML = '✋ Control <kbd>C</kbd>';
      hint.classList.add('hidden');
      this.el.touchControls.classList.add('hidden');
      this.touch.left = this.touch.right = this.touch.atk = false;
    }
  }

  // -------------------------------------------------------------------------
  // Mode / overlay control
  // -------------------------------------------------------------------------
  setGame(g) {
    this.game = g;
    this.hintsShown = new Set();
    this.lastVals = {};
    this.refreshPossess(null);
  }

  setMode(mode) {
    this.mode = mode;
    this.el.menu.classList.toggle('hidden', mode !== 'menu');
    this.el.hud.classList.toggle('hidden', mode === 'menu');
    this.el.pause.classList.toggle('hidden', mode !== 'paused');
    this.el.gameover.classList.toggle('hidden', mode !== 'over');
    if (mode !== 'playing') this.el.touchControls.classList.add('hidden');
    if (mode === 'menu') { this.el.howto.classList.add('hidden'); }
  }

  showGameOver(result, stats) {
    const t = this.el.goTitle;
    t.textContent = result === 'victory' ? 'VICTORY' : 'DEFEAT';
    t.className = result === 'victory' ? 'win' : 'lose';
    this.el.goSub.textContent = result === 'victory'
      ? 'The enemy statue lies in ruins. Your legacy endures.'
      : 'Your statue has fallen. The empire is no more.';
    const rows = [
      ['Battle time', fmtTime(stats.time)],
      ['Enemy kills', stats.kills],
      ['Your losses', stats.losses],
      ['Gold mined', Math.round(stats.goldMined)],
      ['Units trained', stats.trained],
      ['Difficulty', stats.diff],
    ];
    this.el.goStats.innerHTML = rows.map(([k, v]) =>
      `<div class="go-stat"><span>${k}</span><b>${v}</b></div>`).join('');
    play(result === 'victory' ? 'win' : 'lose');
    this.setMode('over');
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  bindEvents() {
    // menu
    document.querySelectorAll('.diff-btn').forEach((b) => {
      b.addEventListener('click', () => {
        unlockAudio(); play('click');
        document.querySelectorAll('.diff-btn').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        this.diff = b.dataset.diff;
      });
    });
    $('btn-play').addEventListener('click', () => { unlockAudio(); this.cb.onStart(this.diff); });
    $('btn-howto').addEventListener('click', () => { play('click'); this.el.howto.classList.remove('hidden'); });
    $('howto-close').addEventListener('click', () => { play('click'); this.el.howto.classList.add('hidden'); });

    // hud buttons
    this.el.btnDefend.addEventListener('click', () => { if (this.game && this.mode === 'playing') this.game.setStance(1, 'defend'); });
    this.el.btnAttack.addEventListener('click', () => { if (this.game && this.mode === 'playing') this.game.setStance(1, 'attack'); });
    this.el.btnPossess.addEventListener('click', () => this.togglePossess());
    this.el.btnPause.addEventListener('click', () => this.cb.onPauseToggle());
    this.el.btnQuit.addEventListener('click', () => { play('click'); this.cb.onPauseToggle(true); });
    this.el.btnMute.addEventListener('click', () => {
      const m = toggleMute();
      this.el.btnMute.textContent = m ? '🔇' : '🔊';
    });

    // pause / gameover
    $('btn-resume').addEventListener('click', () => this.cb.onPauseToggle());
    $('btn-pause-quit').addEventListener('click', () => { play('click'); this.cb.onQuit(); });
    $('btn-rematch').addEventListener('click', () => { play('click'); this.cb.onRestart(); });
    $('btn-go-menu').addEventListener('click', () => { play('click'); this.cb.onQuit(); });

    // keyboard
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));

    // mouse on canvas
    const cv = this.el.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousedown', (e) => this.mouseDown(e));
    window.addEventListener('mousemove', (e) => this.mouseMove(e));
    window.addEventListener('mouseup', (e) => this.mouseUp(e));
    cv.addEventListener('dblclick', (e) => {
      const [wx, wy] = this.toWorld(e.clientX, e.clientY);
      if (this.game) {
        const u = this.game.selectAt(wx, wy);
        if (u) { this.game.possess(u); this.refreshPossess(u); }
      }
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.game || this.mode !== 'playing') return;
      this.game.camera.x += (e.deltaY + e.deltaX) * 0.7;
      this.game.userPanT = 5.5;
    }, { passive: false });

    // minimap navigation
    const mm = this.el.minimap;
    const mmJump = (e) => {
      if (!this.game || this.mode !== 'playing') return;
      const r = mm.getBoundingClientRect();
      const ratio = clamp((e.clientX - r.left) / r.width, 0, 1);
      this.game.camera.x = clamp(ratio * WORLD_W - VIEW_W / 2, 0, WORLD_W - VIEW_W);
      this.game.userPanT = 5.5;
    };
    mm.addEventListener('mousedown', (e) => { mmJump(e); this.mmDrag = true; });
    window.addEventListener('mousemove', (e) => { if (this.mmDrag) mmJump(e); });
    window.addEventListener('mouseup', () => { this.mmDrag = false; });

    // touch on canvas
    cv.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        this.drag = { x0: t.clientX, y0: t.clientY, lx: t.clientX, moved: false, t: performance.now(), touch: true };
      }
    }, { passive: true });
    cv.addEventListener('touchmove', (e) => {
      if (this.drag && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - this.drag.lx;
        this.drag.lx = t.clientX;
        if (Math.abs(t.clientX - this.drag.x0) > 10) this.drag.moved = true;
        if (this.drag.moved && this.game && this.mode === 'playing') {
          const r = cv.getBoundingClientRect();
          this.game.camera.x -= dx / r.width * VIEW_W;
          this.game.userPanT = 5.5;
        }
      }
    }, { passive: true });
    cv.addEventListener('touchend', (e) => {
      if (this.drag && !this.drag.moved && this.game && this.mode === 'playing') {
        const t = e.changedTouches[0];
        const [wx, wy] = this.toWorld(t.clientX, t.clientY);
        this.game.selectAt(wx, wy);
      }
      this.drag = null;
    });

    // on-screen touch controls
    const bindTouch = (el, on, off) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
      el.addEventListener('pointerup', (e) => { e.preventDefault(); off(); });
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    };
    bindTouch(this.el.tcLeft, () => this.touch.left = true, () => this.touch.left = false);
    bindTouch(this.el.tcRight, () => this.touch.right = true, () => this.touch.right = false);
    bindTouch(this.el.tcAtk, () => { this.touch.atk = true; if (this.game) this.game.pressAttack(); }, () => this.touch.atk = false);
  }

  onKey(e, down) {
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'spacebar'].includes(k)) e.preventDefault();

    if (down && k === 'enter' && this.mode === 'menu') { this.cb.onStart(this.diff); return; }
    if (down && k === 'escape') {
      if (!this.el.howto.classList.contains('hidden')) { this.el.howto.classList.add('hidden'); return; }
      if (this.mode === 'playing') {
        const g = this.game;
        if (g && g.possessed) { g.releasePossess(); this.refreshPossess(null); }
        else if (g && g.selected) g.selected = null;
        else this.cb.onPauseToggle();
        return;
      }
      if (this.mode === 'paused') { this.cb.onPauseToggle(); return; }
    }
    if (this.mode === 'paused') {
      if (down && !e.repeat) {
        if (k === 'p') this.cb.onPauseToggle();
        if (k === 'm') { const m = toggleMute(); this.el.btnMute.textContent = m ? '🔇' : '🔊'; }
      }
      this.keys.clear();
      return;
    }
    if (this.mode !== 'playing' || !this.game) {
      if (down) this.keys.delete(k);
      return;
    }
    const g = this.game;
    if (down && !e.repeat) {
      switch (k) {
        case '1': case '2': case '3': case '4': case '5': case '6': {
          const type = TRAIN_ORDER[parseInt(k, 10) - 1];
          if (type) this.train(type);
          break;
        }
        case 'f': g.setStance(1, 'attack'); break;
        case 'g': g.setStance(1, 'defend'); break;
        case 'c': this.togglePossess(); break;
        case ' ': case 'spacebar': case 'j': g.pressAttack(); break;
        case 'p': this.cb.onPauseToggle(); break;
        case 'm': { const m = toggleMute(); this.el.btnMute.textContent = m ? '🔇' : '🔊'; break; }
        case 'h': g.jumpCam('base'); break;
        case 'n': g.jumpCam('front'); break;
      }
    }
    if (down) this.keys.add(k); else this.keys.delete(k);
  }

  toWorld(clientX, clientY) {
    const r = this.el.canvas.getBoundingClientRect();
    const lx = (clientX - r.left) / r.width * VIEW_W;
    const ly = (clientY - r.top) / r.height * VIEW_H;
    return [lx + (this.game ? this.game.camera.x : 0), ly];
  }

  mouseDown(e) {
    this.drag = { x0: e.clientX, y0: e.clientY, lx: e.clientX, moved: false, button: e.button };
  }

  mouseMove(e) {
    if (!this.drag || this.drag.touch) return;
    const dx = e.clientX - this.drag.lx;
    this.drag.lx = e.clientX;
    if (Math.abs(e.clientX - this.drag.x0) + Math.abs(e.clientY - this.drag.y0) > 6) this.drag.moved = true;
    if (this.drag.moved && this.game && this.mode === 'playing' && this.drag.button === 0) {
      const r = this.el.canvas.getBoundingClientRect();
      this.game.camera.x -= dx / r.width * VIEW_W;
      this.game.userPanT = 5.5;
    }
  }

  mouseUp(e) {
    const d = this.drag;
    this.drag = null;
    if (!d || d.touch || d.moved || this.mode !== 'playing' || !this.game) return;
    const [wx, wy] = this.toWorld(e.clientX, e.clientY);
    if (d.button === 2) {
      this.game.orderSelected(wx);
    } else if (d.button === 0) {
      this.game.selectAt(wx, wy);
    }
  }

  // -------------------------------------------------------------------------
  // Per-frame HUD update (called from main loop)
  // -------------------------------------------------------------------------
  applyFrame(dt) {
    const g = this.game;
    if (!g || (this.mode !== 'playing' && this.mode !== 'paused')) return;

    // continuous input
    let pan = 0, move = 0;
    const K = this.keys;
    if (K.has('arrowleft')) pan -= 1;
    if (K.has('arrowright')) pan += 1;
    const left = K.has('a') || this.touch.left;
    const right = K.has('d') || this.touch.right;
    if (g.possessed) {
      if (left) move -= 1;
      if (right) move += 1;
    } else {
      if (left) pan -= 1;
      if (right) pan += 1;
    }
    g.camPan = pan;
    g.setMoveInput(move);

    if (this.mode !== 'playing') return;

    // text stats (only touch DOM when changed)
    const gold = Math.floor(g.gold);
    if (this.lastVals.gold !== gold) { this.el.gold.textContent = gold; this.lastVals.gold = gold; }
    const popTxt = g.popUsed(1) + '/' + POP_CAP;
    if (this.lastVals.pop !== popTxt) { this.el.pop.textContent = popTxt; this.lastVals.pop = popTxt; }
    const timer = fmtTime(g.time);
    if (this.lastVals.timer !== timer) { this.el.timer.textContent = timer; this.lastVals.timer = timer; }
    if (this.lastVals.kills !== g.stats.kills) { this.el.kills.textContent = '☠ ' + g.stats.kills; this.lastVals.kills = g.stats.kills; }

    // cards
    const popUsed = g.popUsed(1);
    for (const key of TRAIN_ORDER) {
      const cfg = UNIT_TYPES[key];
      const card = this.cardEls[key];
      const afford = gold >= cfg.cost;
      const popOk = popUsed + cfg.pop <= POP_CAP;
      card.classList.toggle('disabled', !afford || !popOk);
      card.querySelector('.c-cost-v').classList.toggle('lack', !afford);
    }

    // orders
    this.el.btnDefend.classList.toggle('active', g.stance[1] === 'defend');
    this.el.btnAttack.classList.toggle('active', g.stance[1] === 'attack');

    // selected chip (cached — don't thrash innerHTML every frame)
    const su = g.possessed || g.selected;
    if (su && !su.dead) {
      const cfg = UNIT_TYPES[su.type];
      const pct = Math.max(0, Math.round(su.hp / su.maxHp * 100));
      const key = su.id + '|' + pct;
      if (this.lastVals.chip !== key) {
        this.lastVals.chip = key;
        this.el.selChip.classList.remove('hidden');
        this.el.selChip.innerHTML = `<b>${cfg.name}</b><div class="chip-bar"><i style="width:${pct}%"></i></div>`;
      }
    } else if (this.lastVals.chip !== null) {
      this.lastVals.chip = null;
      this.el.selChip.classList.add('hidden');
    }

    // tutorial hints
    for (const h of HINTS) {
      if (g.time >= h.t && !this.hintsShown.has(h.t)) {
        this.hintsShown.add(h.t);
        this.flashBannerSmall(h.text);
      }
    }

    this.drawMinimap();
  }

  drawMinimap() {
    const g = this.game;
    const c = this.mctx;
    const W = this.el.minimap.width, H = this.el.minimap.height;
    const X = (wx) => wx / WORLD_W * W;
    c.clearRect(0, 0, W, H);
    // backdrop
    const gr = c.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#1a2230');
    gr.addColorStop(1, '#232c1e');
    c.fillStyle = gr;
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#3d5230';
    c.fillRect(0, H - 9, W, 9);
    // mines
    for (const k of [1, 2]) {
      c.fillStyle = '#e8b93c';
      c.beginPath(); c.arc(X(MINE_X[k]), H - 13, 3.2, 0, Math.PI * 2); c.fill();
    }
    // statues
    for (const k of [1, 2]) {
      c.fillStyle = TEAM_COLORS[k].main;
      c.fillRect(X(STATUE_X[k]) - 3, 4, 6, H - 12);
    }
    // units
    for (const u of g.units) {
      if (u.dead) continue;
      c.fillStyle = u.type === 'miner'
        ? (u.team === 1 ? '#9cc7f5' : '#f5b0a5')
        : TEAM_COLORS[u.team].main;
      const y = u.type === 'miner' ? 9 : H - 15;
      const s = u.type === 'giant' ? 3.4 : 2;
      c.fillRect(X(u.x) - s / 2, y - s / 2, s, s);
    }
    // possessed
    if (g.possessed) {
      c.fillStyle = '#ffd76a';
      c.beginPath(); c.arc(X(g.possessed.x), H - 15, 3.6, 0, Math.PI * 2); c.fill();
    }
    // camera window
    c.fillStyle = 'rgba(255,255,255,0.16)';
    c.fillRect(X(g.camera.x), 0, VIEW_W / WORLD_W * W, H);
    c.strokeStyle = 'rgba(255,255,255,0.4)';
    c.lineWidth = 1;
    c.strokeRect(X(g.camera.x), 0.5, VIEW_W / WORLD_W * W, H - 1);
  }

  onResize() {
    const stage = this.el.stage;
    const s = stage.clientWidth / VIEW_W;
    stage.style.setProperty('--s', s.toFixed(4));
  }
}
