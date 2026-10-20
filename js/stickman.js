// ---------------------------------------------------------------------------
// Stick Legacy — procedural stick-figure skeleton, poses & rendering.
// Every animation (walk cycles, sword slashes, bow draws, deaths...) is
// computed from joint angles each frame — no sprites, pure code, SW-style.
//
// Angle convention (local space, character faces +x):
//   0 = straight down, positive = toward facing direction (forward)
//   limb vector = (sin(a) * len, cos(a) * len)   [canvas y is down]
//   legs: shin absolute = thigh - kneeBend   (knee bends backward)
//   arms: forearm absolute = shoulder + elbowBend (elbow bends forward)
// ---------------------------------------------------------------------------
import { clamp, lerp } from './util.js';

export function makePose(o = {}) {
  return Object.assign({
    lean: 0, crouch: 0, bob: 0, rot: 0, head: 0,
    la: { s: 0.18, e: 0.24 },   // back arm  (shoulder, elbow)
    ra: { s: -0.18, e: 0.24 },  // front arm (holds weapon)
    ll: { h: 0.06, k: 0.05 },   // back leg  (thigh, knee)
    rl: { h: -0.06, k: 0.05 },  // front leg
    weap: 3.7,                  // weapon direction from hand (0=down, PI=up)
    extra: 0,                   // bow draw amount / orb charge glow
  }, o);
}

// Resting weapon angles per weapon type
export const WEAP_REST = { sword: 3.7, pick: 3.95, spear: 2.95, bow: 1.35, staff: 3.3, club: 3.6 };

// ---------------------------------------------------------------------------
// Locomotion / idle poses
// ---------------------------------------------------------------------------
export function walkPose(t, stride = 1) {
  const ph = t * 7.6 * stride;
  const s = Math.sin;
  return makePose({
    lean: 0.09,
    bob: Math.abs(s(ph)) * 2.0,
    ll: { h: s(ph) * 0.62, k: 0.08 + Math.max(0, s(ph - 1.1)) * 0.85 },
    rl: { h: s(ph + Math.PI) * 0.62, k: 0.08 + Math.max(0, s(ph + Math.PI - 1.1)) * 0.85 },
    la: { s: -s(ph) * 0.46, e: 0.34 + Math.max(0, -s(ph)) * 0.3 },
    ra: { s: s(ph) * 0.24, e: 0.34 + Math.max(0, s(ph)) * 0.2 },
    head: s(ph * 0.5) * 0.03,
  });
}

export function runPose(t) {
  const ph = t * 10.5;
  const s = Math.sin;
  return makePose({
    lean: 0.24,
    bob: Math.abs(s(ph)) * 2.6,
    ll: { h: s(ph) * 0.85, k: 0.1 + Math.max(0, s(ph - 1.0)) * 1.15 },
    rl: { h: s(ph + Math.PI) * 0.85, k: 0.1 + Math.max(0, s(ph + Math.PI - 1.0)) * 1.15 },
    la: { s: -s(ph) * 0.7, e: 0.9 },
    ra: { s: s(ph) * 0.5, e: 0.9 },
  });
}

export function idlePose(t) {
  const sw = Math.sin(t * 1.7);
  const br = Math.sin(t * 2.3);
  return makePose({
    lean: 0.02 + sw * 0.015,
    bob: br * 0.7,
    ll: { h: 0.1, k: 0.05 },
    rl: { h: -0.1, k: 0.05 },
    la: { s: 0.14 + sw * 0.05, e: 0.3 },
    ra: { s: -0.12 - sw * 0.05, e: 0.3 },
    head: sw * 0.04,
  });
}

/** Big hero pose used for the statue figures. */
export function heroPose(t) {
  const sw = Math.sin(t * 0.8) * 0.02;
  return makePose({
    lean: 0.02,
    ll: { h: 0.2, k: 0.03 },
    rl: { h: -0.2, k: 0.03 },
    la: { s: 0.3 + sw, e: 0.35 },
    ra: { s: -0.42, e: 0.28 },
    weap: 3.02, // sword held high
    head: sw,
  });
}

// ---------------------------------------------------------------------------
// Attack poses — parameterized by swing progress p ∈ [0,1]
// kinds: sword | pick | spear | bow | staff | club
// ---------------------------------------------------------------------------
export function attackPose(kind, p) {
  p = clamp(p, 0, 1);
  switch (kind) {
    case 'sword': {
      if (p < 0.42) { // wind up — raise blade back over shoulder
        const k = p / 0.42;
        return makePose({
          ra: { s: lerp(-0.2, -2.5, k), e: lerp(0.3, 1.05, k) },
          la: { s: lerp(0.2, 0.55, k), e: lerp(0.24, 0.55, k) },
          weap: lerp(3.7, 4.55, k), lean: lerp(0, -0.15, k),
          ll: { h: lerp(0.06, -0.2, k), k: 0.1 }, rl: { h: lerp(-0.06, -0.16, k), k: lerp(0.05, 0.3, k) },
          head: lerp(0, -0.1, k),
        });
      }
      if (p < 0.58) { // SLASH
        const k = (p - 0.42) / 0.16;
        return makePose({
          ra: { s: lerp(-2.5, 1.25, k), e: lerp(1.05, 0.16, k) },
          la: { s: lerp(0.55, -0.5, k), e: 0.42 },
          weap: lerp(4.55, 0.72, k), lean: lerp(-0.15, 0.27, k), crouch: k > 0.5 ? 1.2 : 0,
          ll: { h: lerp(-0.2, 0.46, k), k: 0.14 }, rl: { h: lerp(-0.16, -0.32, k), k: lerp(0.3, 0.1, k) },
          head: lerp(-0.1, 0.13, k),
        });
      }
      const k = (p - 0.58) / 0.42; // recover
      const e = k * k;
      return makePose({
        ra: { s: lerp(1.25, -0.2, e), e: lerp(0.16, 0.3, k) },
        la: { s: lerp(-0.5, 0.2, e), e: lerp(0.42, 0.24, k) },
        weap: lerp(0.72, 3.7, Math.sqrt(k)), lean: lerp(0.27, 0, e),
        ll: { h: lerp(0.46, 0.06, e), k: lerp(0.14, 0.05, k) },
        rl: { h: lerp(-0.32, -0.06, e), k: lerp(0.1, 0.05, k) },
        head: lerp(0.13, 0, e),
      });
    }
    case 'pick': {
      if (p < 0.45) {
        const k = p / 0.45;
        return makePose({
          ra: { s: lerp(-0.2, -2.6, k), e: lerp(0.3, 0.9, k) },
          la: { s: lerp(0.2, -1.9, k), e: lerp(0.24, 1.1, k) }, // both hands on pick
          weap: lerp(3.95, 4.8, k), lean: lerp(0, -0.18, k), crouch: k * 1.5,
          ll: { h: lerp(0.06, -0.15, k), k: 0.12 }, rl: { h: lerp(-0.06, -0.2, k), k: lerp(0.05, 0.25, k) },
        });
      }
      if (p < 0.62) {
        const k = (p - 0.45) / 0.17;
        return makePose({
          ra: { s: lerp(-2.6, 0.95, k), e: lerp(0.9, 0.2, k) },
          la: { s: lerp(-1.9, 0.75, k), e: lerp(1.1, 0.3, k) },
          weap: lerp(4.8, 0.5, k), lean: lerp(-0.18, 0.34, k), crouch: lerp(1.5, 3.2, k),
          ll: { h: lerp(-0.15, 0.35, k), k: lerp(0.12, 0.3, k) }, rl: { h: lerp(-0.2, -0.3, k), k: 0.12 },
        });
      }
      const k = (p - 0.62) / 0.38;
      return makePose({
        ra: { s: lerp(0.95, -0.2, k), e: lerp(0.2, 0.3, k) },
        la: { s: lerp(0.75, 0.2, k), e: lerp(0.3, 0.24, k) },
        weap: lerp(0.5, 3.95, Math.sqrt(k)), lean: lerp(0.34, 0, k), crouch: lerp(3.2, 0, k),
        ll: { h: lerp(0.35, 0.06, k), k: lerp(0.3, 0.05, k) }, rl: { h: lerp(-0.3, -0.06, k), k: 0.05 },
      });
    }
    case 'spear': {
      if (p < 0.4) { // cock spear back
        const k = p / 0.4;
        return makePose({
          ra: { s: lerp(-0.2, -0.85, k), e: lerp(0.3, 0.55, k) },
          la: { s: lerp(0.2, 0.5, k), e: lerp(0.24, 1.5, k) },
          weap: lerp(2.95, 3.5, k), lean: lerp(0, -0.1, k), crouch: k * 1.5,
          ll: { h: lerp(0.06, -0.1, k), k: 0.1 }, rl: { h: lerp(-0.06, -0.22, k), k: lerp(0.05, 0.22, k) },
        });
      }
      if (p < 0.54) { // THRUST
        const k = (p - 0.4) / 0.14;
        return makePose({
          ra: { s: lerp(-0.85, 1.38, k), e: lerp(0.55, 0.08, k) },
          la: { s: lerp(0.5, 0.95, k), e: lerp(1.5, 0.55, k) },
          weap: lerp(3.5, 1.57, k), lean: lerp(-0.1, 0.24, k), crouch: lerp(1.5, 2.5, k),
          ll: { h: lerp(-0.1, 0.5, k), k: lerp(0.1, 0.18, k) }, rl: { h: lerp(-0.22, -0.4, k), k: lerp(0.22, 0.06, k) },
        });
      }
      const k = (p - 0.54) / 0.46; // retract
      return makePose({
        ra: { s: lerp(1.38, -0.2, k), e: lerp(0.08, 0.3, k) },
        la: { s: lerp(0.95, 0.2, k), e: lerp(0.55, 0.24, k) },
        weap: lerp(1.57, 2.95, Math.sqrt(k)), lean: lerp(0.24, 0, k), crouch: lerp(2.5, 0, k),
        ll: { h: lerp(0.5, 0.06, k), k: lerp(0.18, 0.05, k) }, rl: { h: lerp(-0.4, -0.06, k), k: lerp(0.06, 0.05, k) },
      });
    }
    case 'bow': {
      const drawK = clamp(p / 0.45, 0, 1);
      const relK = clamp((p - 0.52) / 0.09, 0, 1);
      const draw = p < 0.52 ? drawK : 1 - relK;
      const recoil = p >= 0.52 ? (1 - clamp((p - 0.61) / 0.3, 0, 1)) : 0;
      return makePose({
        ra: { s: lerp(0.1, 1.5, drawK), e: lerp(0.24, 0.05, drawK) }, // bow arm forward
        la: { // string arm: pulls back to chin, snaps forward on release
          s: relK > 0 ? lerp(-0.98, -0.2, relK) : lerp(0.1, -0.98, drawK),
          e: relK > 0 ? lerp(2.0, 0.4, relK) : lerp(0.24, 2.0, drawK),
        },
        weap: lerp(1.35, 1.52, drawK),
        lean: -0.05 * draw - 0.1 * recoil,
        ll: { h: lerp(0.06, 0.3, drawK), k: 0.06 }, rl: { h: lerp(-0.06, -0.34, drawK), k: 0.1 },
        extra: draw,
        crouch: draw * 1.2,
      });
    }
    case 'staff': {
      if (p < 0.55) { // charge — orb grows overhead
        const k = p / 0.55;
        return makePose({
          ra: { s: lerp(-0.2, -2.35, k), e: lerp(0.3, 0.5, k) },
          la: { s: lerp(0.2, 0.55, k), e: lerp(0.24, 1.0, k) },
          weap: lerp(3.3, 3.95, k), lean: lerp(0, -0.12, k), crouch: k * 2.4,
          ll: { h: lerp(0.06, -0.12, k), k: lerp(0.05, 0.28, k) }, rl: { h: lerp(-0.06, -0.18, k), k: lerp(0.05, 0.2, k) },
          extra: k,
        });
      }
      if (p < 0.7) { // CAST forward
        const k = (p - 0.55) / 0.15;
        return makePose({
          ra: { s: lerp(-2.35, 1.2, k), e: lerp(0.5, 0.12, k) },
          la: { s: lerp(0.55, -0.4, k), e: lerp(1.0, 0.4, k) },
          weap: lerp(3.95, 2.0, k), lean: lerp(-0.12, 0.24, k), crouch: lerp(2.4, 1.0, k),
          ll: { h: lerp(-0.12, 0.4, k), k: 0.14 }, rl: { h: lerp(-0.18, -0.3, k), k: 0.1 },
          extra: lerp(0.6, 0, k),
        });
      }
      const k = (p - 0.7) / 0.3;
      return makePose({
        ra: { s: lerp(1.2, -0.2, k), e: lerp(0.12, 0.3, k) },
        la: { s: lerp(-0.4, 0.2, k), e: lerp(0.4, 0.24, k) },
        weap: lerp(2.0, 3.3, Math.sqrt(k)), lean: lerp(0.24, 0, k), crouch: lerp(1.0, 0, k),
        ll: { h: lerp(0.4, 0.06, k), k: 0.05 }, rl: { h: lerp(-0.3, -0.06, k), k: 0.05 },
      });
    }
    case 'club': { // giant
      if (p < 0.5) { // huge wind-up
        const k = p / 0.5;
        return makePose({
          ra: { s: lerp(-0.3, -2.15, k), e: lerp(0.3, 0.75, k) },
          la: { s: lerp(0.3, -1.85, k), e: lerp(0.3, 0.95, k) },
          weap: lerp(3.6, 4.75, k), lean: lerp(0, -0.28, k), crouch: k * 4,
          ll: { h: lerp(0.1, -0.3, k), k: lerp(0.05, 0.3, k) }, rl: { h: lerp(-0.1, -0.25, k), k: lerp(0.05, 0.25, k) },
          head: lerp(0, -0.18, k),
        });
      }
      if (p < 0.62) { // SMASH
        const k = (p - 0.5) / 0.12;
        return makePose({
          ra: { s: lerp(-2.15, 0.95, k), e: lerp(0.75, 0.15, k) },
          la: { s: lerp(-1.85, 0.8, k), e: lerp(0.95, 0.2, k) },
          weap: lerp(4.75, 0.32, k), lean: lerp(-0.28, 0.42, k), crouch: lerp(4, -2.5, k),
          ll: { h: lerp(-0.3, 0.55, k), k: lerp(0.3, 0.4, k) }, rl: { h: lerp(-0.25, -0.45, k), k: 0.1 },
          head: lerp(-0.18, 0.2, k),
        });
      }
      const k = (p - 0.62) / 0.38; // heavy recover
      const e = Math.sqrt(k);
      return makePose({
        ra: { s: lerp(0.95, -0.3, e), e: lerp(0.15, 0.3, k) },
        la: { s: lerp(0.8, 0.3, e), e: lerp(0.2, 0.3, k) },
        weap: lerp(0.32, 3.6, e), lean: lerp(0.42, 0, e), crouch: lerp(-2.5, 0, e),
        ll: { h: lerp(0.55, 0.1, e), k: lerp(0.4, 0.05, k) }, rl: { h: lerp(-0.45, -0.1, e), k: 0.05 },
        head: lerp(0.2, 0, e),
      });
    }
  }
  return idlePose(0);
}

export function deathPose(p) {
  const k = clamp(p, 0, 1);
  return makePose({
    rot: -k * 1.5, // topple backwards
    lean: lerp(0, -0.32, k),
    ll: { h: lerp(0.06, 0.55, k), k: lerp(0.05, 0.5, k) },
    rl: { h: lerp(-0.06, 0.18, k), k: lerp(0.05, 0.85, k) },
    la: { s: lerp(0.18, -0.65, k), e: lerp(0.24, 0.12, k) },
    ra: { s: lerp(-0.18, 0.85, k), e: lerp(0.24, 0.15, k) },
    head: lerp(0, -0.55, k),
    weap: lerp(3.7, 5.7, k),
    crouch: k * 4,
  });
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
/**
 * Draw a full stick figure.
 * opts: { x, y (feet), facing (±1), scale, pose, colors {body, limbBack, team},
 *         lw, weapon, extras {draw, glow, carry, flap, cape, capeWave, stone}, alpha }
 */
export function drawStickman(ctx, o) {
  const pose = o.pose;
  const S = o.scale;
  const C = o.colors;
  const weapon = o.weapon || 'none';
  const ex = o.extras || {};
  const HEAD = 7 * S, TORSO = 24 * S, UA = 10.5 * S, FA = 10.5 * S, TH = 13 * S, SH = 13 * S;
  const lw = o.lw || 2.8 * S;
  const isGiant = S > 1.7;

  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.facing >= 0 ? 1 : -1, 1);
  if (pose.rot) ctx.rotate(pose.rot);
  if (o.alpha != null && o.alpha < 1) ctx.globalAlpha = (ctx.globalAlpha ?? 1) * o.alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const crouch = (pose.crouch || 0) * S;
  const bob = (pose.bob || 0) * S;
  const hip = { x: 0, y: -(TH + SH) + crouch + bob * 0.45 };
  const leanA = pose.lean || 0;
  const sh = { x: hip.x + Math.sin(leanA) * TORSO, y: hip.y - Math.cos(leanA) * TORSO };
  const headA = leanA + (pose.head || 0);
  const headC = { x: sh.x + Math.sin(headA) * (HEAD + 3 * S), y: sh.y - Math.cos(headA) * (HEAD + 3 * S) };

  const legPts = (L) => {
    const knee = { x: hip.x + Math.sin(L.h) * TH, y: hip.y + Math.cos(L.h) * TH };
    const b = L.h - L.k;
    const foot = { x: knee.x + Math.sin(b) * SH, y: knee.y + Math.cos(b) * SH };
    return { knee, foot };
  };
  const armPts = (A) => {
    const el = { x: sh.x + Math.sin(A.s) * UA, y: sh.y + Math.cos(A.s) * UA };
    const b = A.s + A.e;
    const hand = { x: el.x + Math.sin(b) * FA, y: el.y + Math.cos(b) * FA };
    return { el, hand };
  };
  const ll = legPts(pose.ll), rl = legPts(pose.rl);
  const la = armPts(pose.la), ra = armPts(pose.ra);

  const stroke = (color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; };
  const line = (a, b) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };

  // ---- back arm + back leg (darker) ----
  stroke(C.limbBack, lw * 0.94);
  line(sh, la.el); line(la.el, la.hand);
  line(hip, ll.knee); line(ll.knee, ll.foot);

  // ---- shield on back arm (Spearton) ----
  if (weapon === 'spear') {
    ctx.save();
    ctx.translate(la.hand.x, la.hand.y);
    ctx.beginPath(); ctx.arc(0, 0, 9 * S, 0, Math.PI * 2);
    ctx.fillStyle = '#5d4227'; ctx.fill();
    ctx.lineWidth = 2.4 * S; ctx.strokeStyle = C.team; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 2.6 * S, 0, Math.PI * 2);
    ctx.fillStyle = '#c8ccd4'; ctx.fill();
    ctx.restore();
  }

  // ---- cape (statues) ----
  if (ex.cape) {
    const w = ex.capeWave || 0;
    ctx.beginPath();
    ctx.moveTo(sh.x - 2 * S, sh.y + 2 * S);
    ctx.quadraticCurveTo(sh.x - 16 * S + Math.sin(w) * 4 * S, hip.y + 6 * S, sh.x - 9 * S + Math.sin(w * 1.3) * 5 * S, hip.y + 22 * S);
    ctx.lineTo(sh.x + 3 * S, hip.y + 14 * S);
    ctx.closePath();
    ctx.fillStyle = ex.cape; ctx.fill();
  }

  // ---- robe (Magikill) ----
  if (weapon === 'staff') {
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y - 6 * S);
    ctx.lineTo(hip.x - 7.5 * S, hip.y + 17 * S);
    ctx.lineTo(hip.x + 7.5 * S, hip.y + 17 * S);
    ctx.closePath();
    ctx.fillStyle = C.dark || C.limbBack; ctx.globalAlpha = (ctx.globalAlpha ?? 1) * 0.92; ctx.fill();
    ctx.globalAlpha = o.alpha != null && o.alpha < 1 ? o.alpha : 1;
    ctx.strokeStyle = C.team; ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.moveTo(hip.x - 7.5 * S, hip.y + 17 * S); ctx.lineTo(hip.x + 7.5 * S, hip.y + 17 * S); ctx.stroke();
  }

  // ---- quiver (Archidon) ----
  if (weapon === 'bow') {
    ctx.save();
    ctx.translate(sh.x - 3 * S, sh.y + 1 * S);
    ctx.rotate(-0.62);
    ctx.fillStyle = '#5d4227';
    ctx.fillRect(-2.2 * S, -2 * S, 4.4 * S, 14 * S);
    ctx.strokeStyle = '#3c2a17'; ctx.lineWidth = 1 * S;
    ctx.strokeRect(-2.2 * S, -2 * S, 4.4 * S, 14 * S);
    // arrow fletchings poking out
    ctx.strokeStyle = C.team; ctx.lineWidth = 1.4 * S;
    ctx.beginPath(); ctx.moveTo(-1 * S, -2 * S); ctx.lineTo(-2 * S, -6 * S);
    ctx.moveTo(0.6 * S, -2 * S); ctx.lineTo(0.6 * S, -7 * S);
    ctx.moveTo(2 * S, -2 * S); ctx.lineTo(3 * S, -5.5 * S); ctx.stroke();
    ctx.restore();
  }

  // ---- gold sack (miner carrying) ----
  if (ex.carry > 0) {
    const full = ex.carry >= 1;
    ctx.save();
    ctx.translate(hip.x - 6 * S, hip.y - 2 * S);
    ctx.beginPath(); ctx.arc(0, 0, 5.4 * S, 0, Math.PI * 2);
    ctx.fillStyle = '#6e5333'; ctx.fill();
    ctx.strokeStyle = '#4a3620'; ctx.lineWidth = 1.2 * S; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2 * S, -5 * S); ctx.lineTo(2 * S, -5 * S); ctx.lineTo(0, -8 * S); ctx.closePath();
    ctx.fillStyle = '#6e5333'; ctx.fill();
    if (full) {
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath(); ctx.arc(-1.4 * S, -0.6 * S, 1.3 * S, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(1.8 * S, 1.2 * S, 1.1 * S, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ---- torso ----
  stroke(C.body, lw * 1.06);
  line(sh, hip);
  // belt
  stroke(C.team, lw * 0.8);
  ctx.beginPath();
  ctx.moveTo(hip.x - 3 * S, hip.y - 1 * S); ctx.lineTo(hip.x + 3 * S, hip.y - 1 * S);
  ctx.stroke();

  // ---- front leg ----
  stroke(C.body, lw);
  line(hip, rl.knee); line(rl.knee, rl.foot);

  // ---- head ----
  ctx.beginPath();
  ctx.arc(headC.x, headC.y, HEAD, 0, Math.PI * 2);
  ctx.fillStyle = ex.stone ? C.body : C.body;
  ctx.fill();
  if (!ex.stone) {
    // eye
    ctx.beginPath();
    ctx.arc(headC.x + 3.1 * S, headC.y - 1.1 * S, 1.15 * S, 0, Math.PI * 2);
    ctx.fillStyle = '#eef4ff'; ctx.fill();
  }

  // ---- headgear per unit ----
  if (weapon === 'sword' || ex.stone) {
    // headband + flapping tails
    stroke(C.team, 2.6 * S);
    ctx.beginPath();
    ctx.arc(headC.x, headC.y, HEAD * 0.98, -2.5, -0.66);
    ctx.stroke();
    if (!ex.stone) {
      const fl = ex.flap || 0;
      ctx.lineWidth = 1.7 * S;
      ctx.beginPath();
      ctx.moveTo(headC.x - HEAD * 0.8, headC.y - 3 * S);
      ctx.quadraticCurveTo(headC.x - HEAD - 4 * S, headC.y - 4 * S + Math.sin(fl) * 2.4 * S, headC.x - HEAD - 8 * S, headC.y - 1.5 * S + Math.sin(fl * 1.2) * 3 * S);
      ctx.stroke();
    }
  } else if (weapon === 'spear') {
    // helmet
    ctx.beginPath();
    ctx.arc(headC.x, headC.y - 0.6 * S, HEAD * 1.08, Math.PI * 1.06, Math.PI * 2.02);
    ctx.strokeStyle = '#b9c2cc'; ctx.lineWidth = 2.7 * S; ctx.stroke();
    // crest
    ctx.beginPath();
    ctx.moveTo(headC.x - 1 * S, headC.y - HEAD * 1.15);
    ctx.quadraticCurveTo(headC.x - 5 * S, headC.y - HEAD * 1.9, headC.x - 8 * S, headC.y - HEAD * 1.2);
    ctx.strokeStyle = C.team; ctx.lineWidth = 2 * S; ctx.stroke();
    // nose guard
    ctx.beginPath();
    ctx.moveTo(headC.x + HEAD * 0.82, headC.y - HEAD * 0.5);
    ctx.lineTo(headC.x + HEAD * 0.82, headC.y + HEAD * 0.35);
    ctx.strokeStyle = '#b9c2cc'; ctx.lineWidth = 1.5 * S; ctx.stroke();
  } else if (weapon === 'bow') {
    // hood
    ctx.beginPath();
    ctx.arc(headC.x - 1 * S, headC.y, HEAD * 1.12, Math.PI * 0.62, Math.PI * 1.72);
    ctx.strokeStyle = C.dark || C.limbBack; ctx.lineWidth = 3.4 * S; ctx.stroke();
    ctx.beginPath();
    ctx.arc(headC.x - 1 * S, headC.y, HEAD * 1.32, Math.PI * 0.85, Math.PI * 1.45);
    ctx.strokeStyle = C.team; ctx.lineWidth = 1.3 * S; ctx.stroke();
  } else if (weapon === 'staff') {
    // pointed wizard hat
    ctx.beginPath();
    ctx.moveTo(headC.x - HEAD * 1.15, headC.y - HEAD * 0.45);
    ctx.lineTo(headC.x + 1.5 * S, headC.y - HEAD * 3.1);
    ctx.lineTo(headC.x + HEAD * 1.15, headC.y - HEAD * 0.45);
    ctx.closePath();
    ctx.fillStyle = C.dark || C.limbBack; ctx.fill();
    stroke(C.team, 1.6 * S);
    ctx.beginPath();
    ctx.moveTo(headC.x - HEAD * 1.25, headC.y - HEAD * 0.42);
    ctx.lineTo(headC.x + HEAD * 1.25, headC.y - HEAD * 0.42);
    ctx.stroke();
  } else if (weapon === 'pick') {
    // bandana + knot
    stroke(C.team, 2.4 * S);
    ctx.beginPath();
    ctx.arc(headC.x, headC.y, HEAD * 0.98, -2.62, -0.52);
    ctx.stroke();
    const fl = ex.flap || 0;
    ctx.lineWidth = 1.6 * S;
    ctx.beginPath();
    ctx.moveTo(headC.x - HEAD * 0.85, headC.y - 2.4 * S);
    ctx.lineTo(headC.x - HEAD - 4.5 * S, headC.y - 3.4 * S + Math.sin(fl) * 1.8 * S);
    ctx.moveTo(headC.x - HEAD * 0.85, headC.y - 2.4 * S);
    ctx.lineTo(headC.x - HEAD - 3.5 * S, headC.y - 0.4 * S + Math.sin(fl * 1.3) * 1.8 * S);
    ctx.stroke();
  }

  if (isGiant) {
    // angry brow + shoulder fur
    stroke(C.body, 2 * S);
    ctx.beginPath();
    ctx.moveTo(headC.x + 0.5 * S, headC.y - 3.2 * S);
    ctx.lineTo(headC.x + 5.5 * S, headC.y - 1.6 * S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sh.x - 6 * S, sh.y + 1 * S);
    ctx.lineTo(sh.x - 3 * S, sh.y - 2 * S);
    ctx.lineTo(sh.x, sh.y + 1.5 * S);
    ctx.lineTo(sh.x + 3 * S, sh.y - 2 * S);
    ctx.lineTo(sh.x + 6 * S, sh.y + 1 * S);
    ctx.strokeStyle = C.limbBack; ctx.lineWidth = 2.4 * S; ctx.stroke();
  }

  // ---- front arm ----
  stroke(C.body, lw);
  line(sh, ra.el); line(ra.el, ra.hand);

  // ---- weapon in front hand ----
  drawWeapon(ctx, weapon, ra.hand, la.hand, pose.weap, S, C, ex, pose);

  ctx.restore();
}

function drawWeapon(ctx, type, hand, backHand, w, S, C, ex, pose) {
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(-w); // local +y now points along weapon angle
  ctx.lineCap = 'round';
  const glow = ex.glow || 0;

  switch (type) {
    case 'sword': {
      // pommel + grip
      ctx.strokeStyle = '#4a3620'; ctx.lineWidth = 2.6 * S;
      ctx.beginPath(); ctx.moveTo(0, -3.4 * S); ctx.lineTo(0, 1.6 * S); ctx.stroke();
      // crossguard
      ctx.strokeStyle = C.team; ctx.lineWidth = 2.2 * S;
      ctx.beginPath(); ctx.moveTo(-3.6 * S, 1.9 * S); ctx.lineTo(3.6 * S, 1.9 * S); ctx.stroke();
      // blade
      ctx.beginPath();
      ctx.moveTo(-1.5 * S, 2.4 * S); ctx.lineTo(0, 17 * S); ctx.lineTo(1.5 * S, 2.4 * S);
      ctx.closePath();
      ctx.fillStyle = '#c8ced8'; ctx.fill();
      ctx.strokeStyle = '#8b93a1'; ctx.lineWidth = 0.8 * S; ctx.stroke();
      break;
    }
    case 'pick': {
      ctx.strokeStyle = '#6e5333'; ctx.lineWidth = 2.4 * S;
      ctx.beginPath(); ctx.moveTo(0, -5 * S); ctx.lineTo(0, 13 * S); ctx.stroke();
      // head — curved double spike
      ctx.strokeStyle = '#9aa2ad'; ctx.lineWidth = 2.6 * S;
      ctx.beginPath();
      ctx.moveTo(-7.5 * S, 13.5 * S);
      ctx.quadraticCurveTo(0, 7.5 * S, 7.5 * S, 13.5 * S);
      ctx.stroke();
      break;
    }
    case 'spear': {
      ctx.strokeStyle = '#6e5333'; ctx.lineWidth = 2.2 * S;
      ctx.beginPath(); ctx.moveTo(0, -9 * S); ctx.lineTo(0, 25 * S); ctx.stroke();
      // leaf tip
      ctx.beginPath();
      ctx.moveTo(-2.1 * S, 25 * S); ctx.lineTo(0, 32 * S); ctx.lineTo(2.1 * S, 25 * S);
      ctx.closePath();
      ctx.fillStyle = '#c8ced8'; ctx.fill();
      ctx.strokeStyle = C.team; ctx.lineWidth = 1 * S;
      ctx.beginPath(); ctx.moveTo(-1.4 * S, 24 * S); ctx.lineTo(1.4 * S, 24 * S); ctx.stroke();
      break;
    }
    case 'bow': {
      const draw = ex.draw || 0;
      // limbs of the bow (local +y = toward target)
      ctx.strokeStyle = '#7a5533'; ctx.lineWidth = 2.2 * S;
      ctx.beginPath();
      ctx.moveTo(-13 * S, 0);
      ctx.quadraticCurveTo(7.5 * S, 0, 13 * S, 0);
      ctx.stroke();
      // grip wrap
      ctx.strokeStyle = C.team; ctx.lineWidth = 2.6 * S;
      ctx.beginPath(); ctx.moveTo(-1.6 * S, 0); ctx.lineTo(1.6 * S, 0); ctx.stroke();
      // string (+ nocked arrow while drawing)
      const nock = { x: -draw * 11 * S, y: 0 };
      ctx.strokeStyle = '#d8dde4'; ctx.lineWidth = 0.9 * S;
      ctx.beginPath();
      ctx.moveTo(-13 * S, 0); ctx.lineTo(nock.x, nock.y); ctx.lineTo(13 * S, 0);
      ctx.stroke();
      if (draw > 0.15) {
        ctx.strokeStyle = '#8a6a42'; ctx.lineWidth = 1.5 * S;
        ctx.beginPath(); ctx.moveTo(nock.x, nock.y); ctx.lineTo(nock.x + 24 * S, 0); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(nock.x + 24 * S, 0); ctx.lineTo(nock.x + 20 * S, -1.6 * S);
        ctx.moveTo(nock.x + 24 * S, 0); ctx.lineTo(nock.x + 20 * S, 1.6 * S);
        ctx.strokeStyle = '#c8ced8'; ctx.lineWidth = 1.2 * S; ctx.stroke();
      }
      break;
    }
    case 'staff': {
      ctx.strokeStyle = '#5f4a70'; ctx.lineWidth = 2.4 * S;
      ctx.beginPath(); ctx.moveTo(0, -7 * S); ctx.lineTo(0, 20 * S); ctx.stroke();
      // orb
      const r = (3.2 + glow * 2.6) * S;
      if (glow > 0.02) {
        const g = ctx.createRadialGradient(0, 22 * S, 0, 0, 22 * S, r * 3.2);
        g.addColorStop(0, `rgba(190,140,255,${0.55 * glow})`);
        g.addColorStop(1, 'rgba(190,140,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 22 * S, r * 3.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 22 * S, r, 0, Math.PI * 2);
      ctx.fillStyle = glow > 0.3 ? '#e2c9ff' : '#b78fe0'; ctx.fill();
      ctx.strokeStyle = '#7a5a9e'; ctx.lineWidth = 1.2 * S; ctx.stroke();
      break;
    }
    case 'club': {
      ctx.strokeStyle = '#5d4227'; ctx.lineWidth = 5 * S;
      ctx.beginPath(); ctx.moveTo(0, -6 * S); ctx.lineTo(0, 16 * S); ctx.stroke();
      // knobby head
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-5.5 * S, 14 * S, 11 * S, 20 * S, 4 * S)
                    : ctx.rect(-5.5 * S, 14 * S, 11 * S, 20 * S);
      ctx.fillStyle = '#7a5533'; ctx.fill();
      ctx.strokeStyle = '#4a3620'; ctx.lineWidth = 1.6 * S; ctx.stroke();
      // spikes
      ctx.fillStyle = '#9aa2ad';
      [[-5.5, 18], [5.5, 24], [-5.5, 30]].forEach(([sx, sy]) => {
        const s2 = Math.sign(sx);
        ctx.beginPath();
        ctx.moveTo(sx * S, (sy - 2) * S);
        ctx.lineTo((sx + s2 * 4) * S, sy * S);
        ctx.lineTo(sx * S, (sy + 2) * S);
        ctx.closePath(); ctx.fill();
      });
      break;
    }
  }
  ctx.restore();
}
