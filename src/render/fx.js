// HYPERNOVA — particle / juice layer. Renderer-owned.
// Everything is pooled and allocated ONCE in createFX(). update() never allocates.
//   points : soft additive sprites (radial falloff from gl_PointCoord — no textures)
//   lines  : additive streaks (overdrive speed-lines + rising "+flux" light streaks)
//   waves  : expanding fresnel shells + equatorial rings (STAGE_UP / OVERDRIVE / COLLAPSE)
// Budget: POINTS + LINES <= 4000 together with the scene's starfield (see scene.js).
import { EVT } from '../core/events.js';

const EMPTY = Object.freeze({});
const FX_BUDGET = { points: 2400, lines: 160, waves: 4 };

const POINT_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uPixelRatio;
uniform float uScale;
varying vec3 vColor;
void main(){
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio * uScale / max(0.001, -mv.z);
  if (aSize <= 0.0) gl_PointSize = 0.0;
  gl_Position = projectionMatrix * mv;
}
`;
const POINT_FRAG = /* glsl */ `
varying vec3 vColor;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;               // 0 centre .. 1 edge
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 9.0);              // hot centre
  float halo = (1.0 - r2) * (1.0 - r2) * 0.35;
  gl_FragColor = vec4(vColor * (core * 1.2 + halo * 0.8), 1.0);
}
`;
const LINE_VERT = /* glsl */ `
attribute vec3 aColor;
varying vec3 vColor;
void main(){
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const LINE_FRAG = /* glsl */ `
varying vec3 vColor;
void main(){ gl_FragColor = vec4(vColor, 1.0); }
`;
const WAVE_VERT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const SHELL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uFade;
varying vec3 vNormalW;
varying vec3 vPosW;
void main(){
  vec3 V = normalize(cameraPosition - vPosW);
  float f = 1.0 - clamp(abs(dot(normalize(vNormalW), V)), 0.0, 1.0);
  float rim = pow(f, 4.0) * 0.9 + pow(f, 14.0) * 1.6;
  gl_FragColor = vec4(uColor * rim * uFade, 1.0);
}
`;
const DISC_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uFade;
varying vec2 vUv;
void main(){
  float r = length(vUv * 2.0 - 1.0);
  if (r > 1.0) discard;
  float band = exp(-pow((r - 0.93) * 30.0, 2.0)) * 1.4;
  float wash = pow(r, 8.0) * 0.06;
  gl_FragColor = vec4(uColor * (band + wash) * uFade, 1.0);
}
`;

/**
 * @param {object} three  the THREE namespace (passed in so this module has no hard import)
 * @param {THREE.Scene|THREE.Object3D} scene
 * @param {EventBus} bus
 */
export function createFX(three, scene, bus) {
  if (!three || !scene) throw new Error('HYPERNOVA createFX: three namespace and scene are required');
  const T = three;
  const NP = FX_BUDGET.points;
  const NL = FX_BUDGET.lines;
  const NW = FX_BUDGET.waves;

  // ---------------- points pool ----------------
  const pPos = new Float32Array(NP * 3);
  const pCol = new Float32Array(NP * 3);
  const pSize = new Float32Array(NP);
  const pVel = new Float32Array(NP * 3);
  const pBase = new Float32Array(NP * 3);   // base colour
  const pLife = new Float32Array(NP);
  const pMax = new Float32Array(NP);
  const pSize0 = new Float32Array(NP);
  const pMode = new Uint8Array(NP);         // 0 burst(drag) 1 inflow 2 drift
  const pDrag = new Float32Array(NP);
  let pCursor = 0;

  const pGeo = new T.BufferGeometry();
  const pPosAttr = new T.BufferAttribute(pPos, 3).setUsage(T.DynamicDrawUsage);
  const pColAttr = new T.BufferAttribute(pCol, 3).setUsage(T.DynamicDrawUsage);
  const pSizeAttr = new T.BufferAttribute(pSize, 1).setUsage(T.DynamicDrawUsage);
  pGeo.setAttribute('position', pPosAttr);
  pGeo.setAttribute('aColor', pColAttr);
  pGeo.setAttribute('aSize', pSizeAttr);
  pGeo.boundingSphere = new T.Sphere(new T.Vector3(), 1000);
  const pMat = new T.ShaderMaterial({
    name: 'hypernova.fx.points',
    uniforms: { uPixelRatio: { value: 1 }, uScale: { value: 60 } },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const points = new T.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 10;
  scene.add(points);

  // ---------------- lines pool ----------------
  const lPos = new Float32Array(NL * 6);
  const lCol = new Float32Array(NL * 6);
  const lHead = new Float32Array(NL * 3);
  const lVel = new Float32Array(NL * 3);
  const lBase = new Float32Array(NL * 3);
  const lLife = new Float32Array(NL);
  const lMax = new Float32Array(NL);
  const lLen = new Float32Array(NL);
  const lMode = new Uint8Array(NL);         // 0 speed-line (inflow) 1 rising streak
  let lCursor = 0;
  const lGeo = new T.BufferGeometry();
  const lPosAttr = new T.BufferAttribute(lPos, 3).setUsage(T.DynamicDrawUsage);
  const lColAttr = new T.BufferAttribute(lCol, 3).setUsage(T.DynamicDrawUsage);
  lGeo.setAttribute('position', lPosAttr);
  lGeo.setAttribute('aColor', lColAttr);
  lGeo.boundingSphere = new T.Sphere(new T.Vector3(), 1000);
  const lMat = new T.ShaderMaterial({
    name: 'hypernova.fx.lines',
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const lines = new T.LineSegments(lGeo, lMat);
  lines.frustumCulled = false;
  lines.renderOrder = 11;
  scene.add(lines);

  // ---------------- shockwave pool ----------------
  const shellGeo = new T.IcosahedronGeometry(1, 12);
  const discGeo = new T.PlaneGeometry(2, 2);
  const waves = [];
  for (let i = 0; i < NW; i++) {
    const sm = new T.ShaderMaterial({
      name: 'hypernova.fx.wave.shell',
      uniforms: { uColor: { value: new T.Color(1, 1, 1) }, uFade: { value: 0 } },
      vertexShader: WAVE_VERT, fragmentShader: SHELL_FRAG,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    });
    const dm = new T.ShaderMaterial({
      name: 'hypernova.fx.wave.disc',
      uniforms: { uColor: { value: new T.Color(1, 1, 1) }, uFade: { value: 0 } },
      vertexShader: WAVE_VERT, fragmentShader: DISC_FRAG,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    });
    const shell = new T.Mesh(shellGeo, sm);
    const disc = new T.Mesh(discGeo, dm);
    shell.visible = disc.visible = false;
    shell.renderOrder = disc.renderOrder = 12;
    shell.frustumCulled = disc.frustumCulled = false;
    scene.add(shell); scene.add(disc);
    waves.push({ shell, disc, life: 0, max: 1, r0: 1, r1: 8, px: 0, py: 0, pz: 0 });
  }
  let wCursor = 0;

  // ---------------- palette (updated from snapshot, no per-frame alloc) ----------------
  const cCore = new T.Color('#ffd9a0');
  const cGlow = new T.Color('#ff7a1a');
  const cRim = new T.Color('#fff3c4');
  const cAccent = new T.Color('#ffb347');
  const cWhite = new T.Color(1, 1, 1);
  const cTmp = new T.Color();
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const PKEYS = ['core', 'glow', 'rim', 'accent'];
  const PCOLS = [cCore, cGlow, cRim, cAccent];
  const lastPal = ['', '', '', ''];
  function setPalette(p) {          // field-by-field compare: no per-frame string building
    if (!p) return;
    for (let i = 0; i < 4; i++) {
      const v = p[PKEYS[i]];
      if (typeof v !== 'string' || v === lastPal[i]) continue;
      lastPal[i] = v;
      if (HEX.test(v)) PCOLS[i].set(v);
    }
  }

  // ---------------- spawners ----------------
  let seed = 0x9e3779b9 >>> 0;
  function rnd() { // xorshift32: deterministic, allocation-free, render-only
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  }
  // random unit vector written into scratch
  const U = { x: 0, y: 0, z: 1 };
  function randDir() {
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - z * z);
    U.x = s * Math.cos(a); U.y = s * Math.sin(a); U.z = z;
  }
  function pickColor(mixT, brightness) {
    // blend core->glow->accent->white by mixT for variety
    if (mixT < 0.4) cTmp.copy(cGlow).lerp(cCore, mixT / 0.4);
    else if (mixT < 0.8) cTmp.copy(cCore).lerp(cAccent, (mixT - 0.4) / 0.4);
    else cTmp.copy(cRim).lerp(cWhite, (mixT - 0.8) / 0.2);
    cTmp.r *= brightness; cTmp.g *= brightness; cTmp.b *= brightness;
  }
  function spawnPoint(x, y, z, vx, vy, vz, life, size, mode, drag, mixT, bright) {
    const i = pCursor; pCursor = (pCursor + 1) % NP;
    const i3 = i * 3;
    pPos[i3] = x; pPos[i3 + 1] = y; pPos[i3 + 2] = z;
    pVel[i3] = vx; pVel[i3 + 1] = vy; pVel[i3 + 2] = vz;
    pLife[i] = life; pMax[i] = life; pSize0[i] = size; pMode[i] = mode; pDrag[i] = drag;
    pickColor(mixT, bright);
    pBase[i3] = cTmp.r; pBase[i3 + 1] = cTmp.g; pBase[i3 + 2] = cTmp.b;
  }
  function spawnLine(x, y, z, vx, vy, vz, life, len, mode, mixT, bright) {
    const i = lCursor; lCursor = (lCursor + 1) % NL;
    const i3 = i * 3;
    lHead[i3] = x; lHead[i3 + 1] = y; lHead[i3 + 2] = z;
    lVel[i3] = vx; lVel[i3 + 1] = vy; lVel[i3 + 2] = vz;
    lLife[i] = life; lMax[i] = life; lLen[i] = len; lMode[i] = mode;
    pickColor(mixT, bright);
    lBase[i3] = cTmp.r; lBase[i3 + 1] = cTmp.g; lBase[i3 + 2] = cTmp.b;
  }
  function spawnWave(x, y, z, r0, r1, life, colorA, colorB, tilt) {
    const w = waves[wCursor]; wCursor = (wCursor + 1) % NW;
    w.life = life; w.max = life; w.r0 = r0; w.r1 = r1; w.px = x; w.py = y; w.pz = z;
    w.shell.material.uniforms.uColor.value.copy(colorA);
    w.disc.material.uniforms.uColor.value.copy(colorB);
    w.disc.rotation.set(-Math.PI / 2 + tilt, 0, tilt * 0.6);
    w.shell.visible = w.disc.visible = true;
  }

  // inward stream: particles on a shell that spiral into the core
  function stream(count, rMin, rMax, speed, bright) {
    for (let k = 0; k < count; k++) {
      randDir();
      const r = rMin + (rMax - rMin) * rnd();
      const x = U.x * r, y = U.y * r, z = U.z * r;
      // tangential swirl around Y plus inward
      const tx = -z, tz = x;
      const sw = 0.35 + rnd() * 0.4;
      spawnPoint(x, y, z,
        -U.x * speed + tx * sw, -U.y * speed, -U.z * speed + tz * sw,
        1.6 + rnd() * 0.8, 1.1 + rnd() * 1.5, 1, 0, rnd() * 0.85, bright);
    }
  }
  function sparks(ox, oy, oz, count, vMin, vMax, life, size, drag, bright, whiteBias) {
    for (let k = 0; k < count; k++) {
      randDir();
      const v = vMin + (vMax - vMin) * Math.pow(rnd(), 0.7);
      const r0 = 1.0 + rnd() * 0.1;
      spawnPoint(ox + U.x * r0, oy + U.y * r0, oz + U.z * r0,
        U.x * v, U.y * v, U.z * v,
        life * (0.5 + rnd() * 0.7), size * (0.6 + rnd() * 0.8), 0, drag,
        Math.min(1, rnd() * 0.9 + whiteBias), bright);
    }
  }
  function streaks(ox, oy, oz, count, bright) {
    // "+flux" readout: light streaks rising from the top of the core
    for (let k = 0; k < count; k++) {
      const a = rnd() * Math.PI * 2;
      const rr = 0.25 + rnd() * 0.7;
      spawnLine(ox + Math.cos(a) * rr, oy + 0.9 + rnd() * 0.3, oz + Math.sin(a) * rr,
        Math.cos(a) * 0.25, 2.2 + rnd() * 1.8, Math.sin(a) * 0.25,
        0.7 + rnd() * 0.5, 0.35 + rnd() * 0.5, 1, 0.5 + rnd() * 0.5, bright);
    }
  }
  function speedLines(count, bright) {
    for (let k = 0; k < count; k++) {
      randDir();
      const r = 7 + rnd() * 6;
      const v = 14 + rnd() * 10;
      spawnLine(U.x * r, U.y * r, U.z * r, -U.x * v, -U.y * v, -U.z * v,
        0.55 + rnd() * 0.3, 0.9 + rnd() * 1.6, 0, rnd(), bright);
    }
  }

  const ORIGIN = { x: 0, y: 0, z: 0 };
  function posOf(p) {
    if (p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number') return p;
    return ORIGIN;
  }

  /** Fire a named effect. kind: pulse|crit|perfect|stage|overdrive|collapse|ascend|buy|streak */
  function burst(kind, worldPos) {
    const o = posOf(worldPos);
    switch (kind) {
      case 'pulse':
        stream(12, 3.2, 5.2, 2.6, 0.9);
        if (rnd() < 0.5) streaks(o.x, o.y, o.z, 1, 1.4);
        break;
      case 'crit':
        sparks(o.x, o.y, o.z, 160, 2.5, 9, 1.0, 2.0, 2.2, 1.1, 0.15);
        streaks(o.x, o.y, o.z, 6, 2.4);
        break;
      case 'perfect':
        sparks(o.x, o.y, o.z, 260, 3.5, 13, 1.2, 2.3, 2.0, 1.5, 0.45);
        streaks(o.x, o.y, o.z, 10, 3.2);
        spawnWave(o.x, o.y, o.z, 1.0, 4.5, 0.55, cWhite, cRim, 0.15);
        break;
      case 'stage':
        sparks(o.x, o.y, o.z, 340, 3, 16, 1.6, 2.4, 1.4, 1.2, 0.3);
        spawnWave(o.x, o.y, o.z, 1.0, 14, 1.6, cAccent, cRim, 0.0);
        spawnWave(o.x, o.y, o.z, 1.0, 9, 1.1, cRim, cAccent, 0.5);
        streaks(o.x, o.y, o.z, 14, 3);
        break;
      case 'overdrive':
        sparks(o.x, o.y, o.z, 200, 4, 14, 1.2, 2.2, 1.6, 1.3, 0.2);
        spawnWave(o.x, o.y, o.z, 1.0, 11, 1.2, cGlow, cAccent, -0.3);
        speedLines(40, 2.2);
        break;
      case 'collapse':
        stream(400, 6, 12, 7, 1.0);
        spawnWave(o.x, o.y, o.z, 12, 0.8, 1.4, cRim, cGlow, 0.2);
        break;
      case 'ascend':
        sparks(o.x, o.y, o.z, 450, 4, 20, 2.0, 2.6, 1.1, 1.5, 0.5);
        spawnWave(o.x, o.y, o.z, 1.0, 18, 2.0, cWhite, cAccent, 0.0);
        spawnWave(o.x, o.y, o.z, 1.0, 12, 1.5, cAccent, cWhite, 0.7);
        break;
      case 'buy':
        stream(30, 2.5, 4, 2.2, 1.6);
        break;
      case 'streak':
        streaks(o.x, o.y, o.z, 3, 2.0);
        break;
      default:
        sparks(o.x, o.y, o.z, 40, 1.5, 5, 0.8, 2.5, 2.5, 1.5, 0.1);
    }
  }

  // ---------------- bus wiring ----------------
  const offs = [];
  function on(evt, fn) {
    if (!bus || typeof bus.on !== 'function') return;
    const off = bus.on(evt, fn);
    offs.push(typeof off === 'function' ? off : () => bus.off && bus.off(evt, fn));
  }
  let pulseBudget = 0;      // throttles auto-pulse storms so the pool is not flushed
  on(EVT.PULSE, () => { if (pulseBudget < 12) { pulseBudget += 1; burst('pulse'); } });
  on(EVT.CRIT, () => burst('crit'));
  on(EVT.PERFECT, () => burst('perfect'));
  on(EVT.STAGE_UP, () => burst('stage'));
  on(EVT.OVERDRIVE_START, () => burst('overdrive'));
  on(EVT.COLLAPSE, () => burst('collapse'));
  on(EVT.ASCEND, () => burst('ascend'));
  on(EVT.BUY, () => burst('buy'));

  // ---------------- per-frame ----------------
  let ambientAcc = 0;
  let speedAcc = 0;
  let disposed = false;

  function num(v, d) { return typeof v === 'number' && Number.isFinite(v) ? v : d; }

  function update(snap, dt) {
    if (disposed) return;
    dt = num(dt, 0);
    if (dt > 0.1) dt = 0.1;
    const s = snap || EMPTY;
    const stage = s.stage || EMPTY;
    setPalette(stage.palette);
    pulseBudget = Math.max(0, pulseBudget - dt * 10);

    const od = num(s.overdriveTimer, 0) > 0;
    const rate = Math.max(0, num(s.rate, 0));
    const combo = Math.max(0, num(s.combo, 0));

    if (dt > 0) {
      // idle feeding trickle: a little life even when nobody clicks, scales with log(rate)
      const perSec = 6 + Math.min(30, Math.log10(1 + rate) * 3) + combo * 0.3 + (od ? 18 : 0);
      ambientAcc += perSec * dt;
      while (ambientAcc >= 1) { ambientAcc -= 1; stream(1, 4, 7, 1.4, 0.55 + (od ? 0.12 : 0)); }
      if (od) {
        speedAcc += 55 * dt;
        while (speedAcc >= 1) { speedAcc -= 1; speedLines(1, 0.85); }   // dimmer: they cross the ring
      } else speedAcc = 0;
    }

    // --- points ---
    for (let i = 0; i < NP; i++) {
      const i3 = i * 3;
      let life = pLife[i];
      if (life <= 0) { if (pSize[i] !== 0) { pSize[i] = 0; } continue; }
      life -= dt;
      let x = pPos[i3], y = pPos[i3 + 1], z = pPos[i3 + 2];
      let vx = pVel[i3], vy = pVel[i3 + 1], vz = pVel[i3 + 2];
      const mode = pMode[i];
      let fade;
      if (mode === 1) {
        // inflow: gravity toward the core, absorbed at the surface
        const r = Math.sqrt(x * x + y * y + z * z) + 1e-4;
        const g = (6 + 18 / (r * r)) * dt;
        vx -= (x / r) * g; vy -= (y / r) * g; vz -= (z / r) * g;
        const damp = Math.exp(-0.6 * dt);
        vx *= damp; vy *= damp; vz *= damp;
        if (r < 1.02) life = 0;
        const nearFade = Math.min(1, (r - 1.0) * 2.5);
        const t = life / pMax[i];
        fade = Math.min(1, (1 - t) * 4) * Math.max(0, nearFade);
      } else {
        const d = Math.exp(-pDrag[i] * dt);
        vx *= d; vy *= d; vz *= d;
        const t = Math.max(0, life / pMax[i]);
        fade = t * t * (3 - 2 * t);
      }
      x += vx * dt; y += vy * dt; z += vz * dt;
      pPos[i3] = x; pPos[i3 + 1] = y; pPos[i3 + 2] = z;
      pVel[i3] = vx; pVel[i3 + 1] = vy; pVel[i3 + 2] = vz;
      pLife[i] = life;
      if (life <= 0) { pSize[i] = 0; continue; }
      pSize[i] = pSize0[i] * (0.35 + 0.65 * fade);
      pCol[i3] = pBase[i3] * fade; pCol[i3 + 1] = pBase[i3 + 1] * fade; pCol[i3 + 2] = pBase[i3 + 2] * fade;
    }
    pPosAttr.needsUpdate = true; pColAttr.needsUpdate = true; pSizeAttr.needsUpdate = true;

    // --- lines ---
    for (let i = 0; i < NL; i++) {
      const i3 = i * 3, i6 = i * 6;
      let life = lLife[i];
      if (life <= 0) {
        if (lCol[i6] !== 0 || lCol[i6 + 1] !== 0 || lCol[i6 + 2] !== 0) {
          for (let k = 0; k < 6; k++) { lCol[i6 + k] = 0; lPos[i6 + k] = 0; }
        }
        continue;
      }
      life -= dt;
      let x = lHead[i3], y = lHead[i3 + 1], z = lHead[i3 + 2];
      const vx = lVel[i3], vy = lVel[i3 + 1], vz = lVel[i3 + 2];
      x += vx * dt; y += vy * dt; z += vz * dt;
      if (lMode[i] === 0) { // speed-line dies when it reaches the core
        const r2 = x * x + y * y + z * z;
        if (r2 < 1.4 * 1.4) life = 0;
      }
      lHead[i3] = x; lHead[i3 + 1] = y; lHead[i3 + 2] = z;
      lLife[i] = life;
      const t = Math.max(0, life / lMax[i]);
      const fade = lMode[i] === 0 ? Math.min(1, (1 - t) * 5) * Math.min(1, t * 3) : t * t;
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-4;
      const len = lLen[i] * (lMode[i] === 1 ? (0.4 + 0.6 * t) : 1);
      lPos[i6] = x; lPos[i6 + 1] = y; lPos[i6 + 2] = z;
      lPos[i6 + 3] = x - (vx / sp) * len; lPos[i6 + 4] = y - (vy / sp) * len; lPos[i6 + 5] = z - (vz / sp) * len;
      const a = life > 0 ? fade : 0;
      lCol[i6] = lBase[i3] * a; lCol[i6 + 1] = lBase[i3 + 1] * a; lCol[i6 + 2] = lBase[i3 + 2] * a;
      lCol[i6 + 3] = 0; lCol[i6 + 4] = 0; lCol[i6 + 5] = 0;     // tail fades to black
    }
    lPosAttr.needsUpdate = true; lColAttr.needsUpdate = true;

    // --- waves ---
    for (let i = 0; i < NW; i++) {
      const w = waves[i];
      if (w.life <= 0) continue;
      w.life -= dt;
      if (w.life <= 0) { w.shell.visible = w.disc.visible = false; continue; }
      const t = 1 - w.life / w.max;                // 0..1
      const e = 1 - Math.pow(1 - t, 3);            // easeOutCubic
      const r = w.r0 + (w.r1 - w.r0) * e;
      const fade = (1 - t) * (1 - t) * Math.min(1, t * 12);
      w.shell.position.set(w.px, w.py, w.pz);
      w.disc.position.set(w.px, w.py, w.pz);
      w.shell.scale.setScalar(r);
      w.disc.scale.setScalar(r * 1.05);
      w.shell.material.uniforms.uFade.value = fade * 0.9;
      w.disc.material.uniforms.uFade.value = fade;
    }
  }

  function setPixelRatio(pr, viewportHeight) {
    pMat.uniforms.uPixelRatio.value = num(pr, 1);
    // world-size sprites: scale against viewport height so they look the same on any screen
    pMat.uniforms.uScale.value = Math.max(20, num(viewportHeight, 900) * 0.055);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const off of offs) { try { off(); } catch (e) { /* ignore */ } }
    offs.length = 0;
    scene.remove(points); scene.remove(lines);
    pGeo.dispose(); pMat.dispose(); lGeo.dispose(); lMat.dispose();
    for (const w of waves) {
      scene.remove(w.shell); scene.remove(w.disc);
      w.shell.material.dispose(); w.disc.material.dispose();
    }
    shellGeo.dispose(); discGeo.dispose();
  }

  return { update, burst, dispose, setPixelRatio };
}
