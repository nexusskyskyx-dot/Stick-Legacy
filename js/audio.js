// ---------------------------------------------------------------------------
// Stick Legacy — procedural audio (WebAudio). No external sound files needed.
// Everything (swords, arrows, coins, war drums...) is synthesized live.
// ---------------------------------------------------------------------------
import { clamp } from './util.js';

let ctx = null, master = null, musicGain = null;
let muted = false, noiseBuf = null;
let musicTimer = null, musicStep = 0, nextNoteTime = 0, musicWanted = false;

function ensure() {
  if (ctx || typeof window === 'undefined') return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.42;
    musicGain.connect(master);
  } catch (e) { ctx = null; }
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function noise() {
  if (noiseBuf) return noiseBuf;
  const c = ensure(); if (!c) return null;
  noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function tone({ freq = 440, to = 0, dur = 0.1, type = 'square', gain = 0.2, at = null, dest = null }) {
  const c = ensure(); if (!c || muted) return;
  const t0 = at != null ? at : c.currentTime;
  if (t0 < c.currentTime - 0.05) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, freq), t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(Math.max(0.0001, gain), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest || master);
  o.start(t0); o.stop(t0 + dur + 0.03);
}

function nz({ dur = 0.1, gain = 0.2, freq = 1000, q = 1, type = 'bandpass', at = null, dest = null, sweepTo = 0 }) {
  const c = ensure(); if (!c || muted) return;
  const t0 = at != null ? at : c.currentTime;
  if (t0 < c.currentTime - 0.05) return;
  const b = noise(); if (!b) return;
  const s = c.createBufferSource(); s.buffer = b;
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, gain), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(dest || master);
  s.start(t0); s.stop(t0 + dur + 0.03);
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------
export function play(name, vol = 1) {
  if (muted) return;
  const v = clamp(vol, 0, 1);
  if (v < 0.02) return;
  switch (name) {
    case 'click':
      tone({ freq: 640, dur: 0.05, type: 'triangle', gain: 0.22 * v });
      tone({ freq: 960, dur: 0.04, type: 'triangle', gain: 0.1 * v, at: (ctx ? ctx.currentTime : 0) + 0.03 });
      break;
    case 'error':
      tone({ freq: 200, to: 140, dur: 0.14, type: 'square', gain: 0.16 * v });
      break;
    case 'coin':
      tone({ freq: 988, dur: 0.07, type: 'sine', gain: 0.26 * v });
      tone({ freq: 1319, dur: 0.13, type: 'sine', gain: 0.26 * v, at: (ctx ? ctx.currentTime : 0) + 0.06 });
      break;
    case 'train':
      tone({ freq: 392, dur: 0.08, type: 'triangle', gain: 0.24 * v });
      tone({ freq: 523, dur: 0.13, type: 'triangle', gain: 0.24 * v, at: (ctx ? ctx.currentTime : 0) + 0.07 });
      break;
    case 'swing':
      nz({ dur: 0.09, gain: 0.1 * v, freq: 2600, q: 0.6, type: 'highpass', sweepTo: 900 });
      break;
    case 'clash':
      nz({ dur: 0.07, gain: 0.3 * v, freq: 3400, q: 1.1 });
      tone({ freq: 560, to: 190, dur: 0.08, type: 'square', gain: 0.14 * v });
      break;
    case 'thud':
      tone({ freq: 150, to: 55, dur: 0.11, type: 'sine', gain: 0.4 * v });
      nz({ dur: 0.05, gain: 0.1 * v, freq: 700, type: 'lowpass' });
      break;
    case 'shoot':
      nz({ dur: 0.1, gain: 0.13 * v, freq: 1900, q: 0.8, sweepTo: 700 });
      tone({ freq: 880, to: 300, dur: 0.08, type: 'triangle', gain: 0.07 * v });
      break;
    case 'cast':
      tone({ freq: 520, to: 1250, dur: 0.22, type: 'sine', gain: 0.14 * v });
      nz({ dur: 0.18, gain: 0.06 * v, freq: 2600, q: 2, sweepTo: 900 });
      break;
    case 'boom':
      tone({ freq: 120, to: 34, dur: 0.42, type: 'sine', gain: 0.5 * v });
      nz({ dur: 0.3, gain: 0.28 * v, freq: 500, type: 'lowpass', sweepTo: 90 });
      break;
    case 'mine':
      nz({ dur: 0.06, gain: 0.18 * v, freq: 3000, q: 1.4 });
      tone({ freq: 260, to: 130, dur: 0.06, type: 'square', gain: 0.08 * v });
      break;
    case 'die':
      tone({ freq: 320, to: 85, dur: 0.24, type: 'sawtooth', gain: 0.1 * v });
      nz({ dur: 0.1, gain: 0.06 * v, freq: 900, type: 'lowpass' });
      break;
    case 'horn':
      tone({ freq: 164, dur: 0.5, type: 'sawtooth', gain: 0.07 * v });
      tone({ freq: 246, dur: 0.5, type: 'sawtooth', gain: 0.05 * v });
      tone({ freq: 164, dur: 0.35, type: 'sawtooth', gain: 0.06 * v, at: (ctx ? ctx.currentTime : 0) + 0.55 });
      break;
    case 'crumble':
      tone({ freq: 85, to: 28, dur: 1.3, type: 'sine', gain: 0.55 * v });
      nz({ dur: 1.1, gain: 0.3 * v, freq: 400, type: 'lowpass', sweepTo: 70 });
      break;
    case 'win': {
      const t = ctx ? ctx.currentTime : 0;
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.22 * v, at: t + i * 0.13 }));
      break;
    }
    case 'lose': {
      const t = ctx ? ctx.currentTime : 0;
      [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.35, type: 'sawtooth', gain: 0.12 * v, at: t + i * 0.16 }));
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Tribal war-drum music loop (procedural, low volume)
// ---------------------------------------------------------------------------
const BPM = 96;
const STEP = 60 / BPM / 2; // 8th notes
const BASS = [110, 110, 130.8, 98]; // A2 A2 C3 G2 — one per bar

function scheduleStep(i, t) {
  const bar = Math.floor(i / 8) % 4;
  const s = i % 16;
  // kick pattern (tribal)
  if (s === 0 || s === 3 || s === 8 || s === 11) {
    tone({ freq: 130, to: 42, dur: 0.16, type: 'sine', gain: 0.5, at: t, dest: musicGain });
  }
  // soft shaker every 8th
  nz({ dur: 0.03, gain: 0.035, freq: 6500, q: 1, type: 'highpass', at: t, dest: musicGain });
  // drum slap on backbeat
  if (s === 4 || s === 12) {
    nz({ dur: 0.09, gain: 0.14, freq: 1800, q: 0.9, at: t, dest: musicGain });
  }
  // bass drone once per bar
  if (s === 0) {
    tone({ freq: BASS[bar], dur: STEP * 6.5, type: 'triangle', gain: 0.16, at: t, dest: musicGain });
    tone({ freq: BASS[bar] * 2, dur: STEP * 4, type: 'sine', gain: 0.05, at: t, dest: musicGain });
  }
  // sparse melody pluck (minor pentatonic) every 2 bars
  if (i % 16 === 6 || i % 16 === 14) {
    const scale = [440, 523.3, 587.3, 659.3, 784, 880];
    const f = scale[(Math.random() * scale.length) | 0];
    tone({ freq: f, dur: 0.28, type: 'sine', gain: 0.05, at: t, dest: musicGain });
  }
}

export function startMusic() {
  musicWanted = true;
  const c = ensure(); if (!c) return;
  if (musicTimer) return;
  nextNoteTime = c.currentTime + 0.12;
  musicStep = 0;
  musicTimer = setInterval(() => {
    if (!ctx || muted) return;
    while (nextNoteTime < ctx.currentTime + 0.3) {
      scheduleStep(musicStep, nextNoteTime);
      nextNoteTime += STEP;
      musicStep = (musicStep + 1) % 32;
    }
  }, 70);
}

export function stopMusic() {
  musicWanted = false;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  if (!muted && musicWanted) startMusic();
  return muted;
}

export function isMuted() { return muted; }
