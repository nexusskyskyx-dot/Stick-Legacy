// ---------------------------------------------------------------------------
// Stick Legacy — bootstrap: canvas setup, game modes (menu/playing/paused/
// over), the main rAF loop, and glue between Game ↔ Renderer ↔ UI.
// ---------------------------------------------------------------------------
import { VIEW_W, VIEW_H } from './config.js';
import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { startMusic, stopMusic, unlockAudio } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let dpr = Math.min(2, window.devicePixelRatio || 1);
function setupCanvas() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(VIEW_W * dpr);
  canvas.height = Math.round(VIEW_H * dpr);
}
setupCanvas();

let mode = 'menu';        // menu | playing | paused | over
let game = null;
let renderer = null;
let ui = null;
let pendingGameOver = null; // { result, stats } shown after crumble slow-mo

function makeHooks(demo = false) {
  return {
    demo,
    onBanner: (text) => ui.banner(text),
    onPossess: (u) => ui.refreshPossess(u),
    onGameOver: (result, stats) => {
      if (demo) return;
      pendingGameOver = { result, stats };
    },
  };
}

function startMenu() {
  mode = 'menu';
  game = new Game('normal', makeHooks(true));
  renderer = new Renderer(game);
  ui.setGame(game);
  ui.setMode('menu');
  stopMusic();
}

function startBattle(diff) {
  unlockAudio();
  mode = 'playing';
  pendingGameOver = null;
  game = new Game(diff, makeHooks(false));
  renderer = new Renderer(game);
  ui.setGame(game);
  ui.setMode('playing');
  ui.banner('⚔ DEFEND YOUR STATUE — TRAIN MINERS FIRST!');
  startMusic();
}

ui = new UI({
  onStart: (diff) => startBattle(diff),
  onRestart: () => startBattle(game ? game.diffKey : 'normal'),
  onQuit: () => { startMenu(); },
  onPauseToggle: (force) => {
    if (mode === 'playing' || (force && mode === 'paused')) {
      mode = 'paused';
      ui.setMode('paused');
    } else if (mode === 'paused') {
      mode = 'playing';
      ui.setMode('playing');
    }
  },
});

startMenu();

// ---------------------------------------------------------------------------
// Resize / stage scaling
// ---------------------------------------------------------------------------
function onResize() {
  setupCanvas();
  ui.onResize();
}
window.addEventListener('resize', onResize);
onResize();

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing') {
    mode = 'paused';
    ui.setMode('paused');
  }
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let last = performance.now();
let demoRestartT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.016;

  if (mode === 'menu' || mode === 'playing') {
    ui.applyFrame(dt);
    game.update(dt);
    // menu demo battle: restart a fresh one shortly after someone wins
    if (mode === 'menu' && game.over) {
      demoRestartT += dt;
      if (demoRestartT > 3.2) { demoRestartT = 0; startMenu(); }
    }
    // delayed game-over overlay (after crumble slow-motion)
    if (pendingGameOver && game.overT > 2.6) {
      const { result, stats } = pendingGameOver;
      pendingGameOver = null;
      ui.showGameOver(result, stats);
      mode = 'over';
      stopMusic();
    }
  }

  // render (always — keeps pause/menu backdrops alive)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderer.render(ctx, mode === 'paused' ? 0 : dt);
}
requestAnimationFrame(frame);
