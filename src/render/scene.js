// HYPERNOVA — scene / camera / post-processing. Renderer-owned.
// Reads the economy snapshot (INTERFACES.md §6). Never mutates game state.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { coreMaterial, ringMaterial, backgroundMaterial } from './shaders.js';
import { createFX } from './fx.js';
import { EVT } from '../core/events.js';
import { TUNE } from '../core/tune.js';
import { clamp, approach } from '../core/math.js';

const TAU = Math.PI * 2;
const MAX_PIXEL_RATIO = 1.75;
const STAR_COUNT = 1200;        // + fx points 2400 + fx lines 160 = 3760 <= 4000
const ORBIT_COUNT = 6;
const RING_RADIUS = 1.9;
const HEX = /^#[0-9a-fA-F]{6}$/;

const EMPTY = Object.freeze({});
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ---------------------------------------------------------------------------
// Starfield: additive soft points in three parallax layers (no textures).
// ---------------------------------------------------------------------------
const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
uniform float uScale;
uniform float uBright;
varying vec3 vColor;
void main(){
  float tw = 0.65 + 0.35 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 37.0);
  vColor = aColor * tw * uBright;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, aSize * uPixelRatio * uScale / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;
const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 6.0) + (1.0 - r2) * 0.15;
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

// Orbit bands: hairline tori with a travelling comet (count reacts to stage/combo/overdrive).
const ORBIT_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const ORBIT_FRAG = /* glsl */ `
uniform float uPhase;
uniform float uAlpha;
uniform vec3 uColor;
varying vec2 vUv;
const float TAU = 6.28318530718;
const float PI = 3.14159265359;
float wrapPi(float a){ return a - TAU * floor((a + PI) / TAU); }
void main(){
  float th = vUv.x * TAU;
  float d = wrapPi(th - uPhase);
  float head = exp(-d * d * 500.0);
  float tail = d < 0.0 ? exp(d * 2.2) : 0.0;
  vec3 c = uColor * (0.04 + tail * 0.55 + head * 5.0) * uAlpha;
  gl_FragColor = vec4(c, 1.0);
}
`;

// Final pass (after OutputPass, i.e. in display space): subtle chromatic aberration on
// big moments + 8-bit dithering so the dark gradients never band.
const FINAL_SHADER = {
  name: 'HypernovaFinal',
  uniforms: { tDiffuse: { value: null }, uAberr: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAberr;
    uniform float uAspect;
    varying vec2 vUv;
    float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main(){
      vec2 dir = vUv - 0.5;
      float r = length(dir * vec2(uAspect, 1.0));
      vec2 off = dir * uAberr * r;
      vec4 c = texture2D(tDiffuse, vUv);
      if (uAberr > 0.00001) {
        c.r = texture2D(tDiffuse, vUv + off).r;
        c.b = texture2D(tDiffuse, vUv - off).b;
      }
      c.rgb += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(c.rgb, 1.0);
    }
  `,
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {EventBus} bus
 */
export function createScene(canvas, bus) {
  if (!canvas) throw new Error('HYPERNOVA createScene: a canvas element is required');

  // ---------------- renderer (guarded) ----------------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
      stencil: false, depth: true,
    });
  } catch (err) {
    throw new Error('HYPERNOVA: WebGL is unavailable — could not create a WebGL2 context (' +
      (err && err.message ? err.message : String(err)) + '). Enable hardware acceleration or try another browser.');
  }
  if (!renderer || !renderer.getContext()) {
    throw new Error('HYPERNOVA: WebGL is unavailable — renderer has no context.');
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);

  const win = typeof window !== 'undefined' ? window : null;
  let pixelRatio = Math.min(MAX_PIXEL_RATIO, (win && win.devicePixelRatio) || 1);
  let width = Math.max(1, canvas.clientWidth || (win ? win.innerWidth : 1280));
  let height = Math.max(1, canvas.clientHeight || (win ? win.innerHeight : 720));

  // ---------------- scene + camera ----------------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 400);
  camera.position.set(0, 1.2, 6);

  // ---------------- shared, smoothly-lerped palette ----------------
  // Every material references these SAME Color objects, so one lerp updates everything.
  const cur = {
    core: new THREE.Color('#ffd9a0'), glow: new THREE.Color('#ff7a1a'), rim: new THREE.Color('#fff3c4'),
    bg: new THREE.Color('#0a0705'), accent: new THREE.Color('#ffb347'),
  };
  const tgt = {
    core: cur.core.clone(), glow: cur.glow.clone(), rim: cur.rim.clone(),
    bg: cur.bg.clone(), accent: cur.accent.clone(),
  };
  const cMarker = new THREE.Color();
  const cWhite = new THREE.Color(1, 1, 1);
  const PKEYS = ['core', 'glow', 'rim', 'bg', 'accent'];

  // ---------------- background ----------------
  const bgGeo = new THREE.PlaneGeometry(2, 2);
  const bgMat = backgroundMaterial(null);
  bgMat.uniforms.uBg.value = cur.bg;
  bgMat.uniforms.uGlow.value = cur.glow;
  bgMat.uniforms.uAccent.value = cur.accent;
  const bg = new THREE.Mesh(bgGeo, bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -1000;
  scene.add(bg);

  // ---------------- starfield ----------------
  const starGroups = [];
  const starMat = new THREE.ShaderMaterial({
    name: 'hypernova.stars',
    uniforms: {
      uTime: { value: 0 }, uPixelRatio: { value: pixelRatio }, uScale: { value: 60 }, uBright: { value: 1 },
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  {
    let s = 1234567;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const layers = [
      { n: Math.floor(STAR_COUNT * 0.5), r0: 60, r1: 90, size: 1.6 },
      { n: Math.floor(STAR_COUNT * 0.32), r0: 32, r1: 55, size: 1.9 },
      { n: STAR_COUNT - Math.floor(STAR_COUNT * 0.5) - Math.floor(STAR_COUNT * 0.32), r0: 16, r1: 30, size: 2.2 },
    ];
    const tint = new THREE.Color();
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const pos = new Float32Array(L.n * 3);
      const colr = new Float32Array(L.n * 3);
      const size = new Float32Array(L.n);
      const phase = new Float32Array(L.n);
      for (let i = 0; i < L.n; i++) {
        const z = rnd() * 2 - 1, a = rnd() * TAU, q = Math.sqrt(1 - z * z);
        const r = L.r0 + (L.r1 - L.r0) * rnd();
        pos[i * 3] = q * Math.cos(a) * r; pos[i * 3 + 1] = z * r * 0.8; pos[i * 3 + 2] = q * Math.sin(a) * r;
        const hot = rnd();
        tint.setHSL(0.55 + rnd() * 0.15 - (hot > 0.85 ? 0.5 : 0), 0.25 + rnd() * 0.35, 0.75);
        const b = 0.15 + Math.pow(rnd(), 6) * 1.6;   // a few bright stars, most faint
        colr[i * 3] = tint.r * b; colr[i * 3 + 1] = tint.g * b; colr[i * 3 + 2] = tint.b * b;
        size[i] = L.size * (0.6 + rnd() * 0.9) * (1 + b * 0.4);
        phase[i] = rnd();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aColor', new THREE.BufferAttribute(colr, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
      const pts = new THREE.Points(g, starMat);
      pts.frustumCulled = false;
      pts.renderOrder = -900;
      pts.userData.speed = 0.004 + li * 0.006;
      starGroups.push(pts);
      scene.add(pts);
    }
  }

  // ---------------- core (body + counter-rotating shell + glass) ----------------
  const geoCache = new Map();
  function sphereGeo(subdiv) {
    let g = geoCache.get(subdiv);
    if (g) return g;
    const ico = new THREE.IcosahedronGeometry(1, subdiv);
    ico.deleteAttribute('normal');
    ico.deleteAttribute('uv');
    g = mergeVertices(ico, 1e-5);   // indexed => ~6x fewer vertex-shader noise evaluations
    ico.dispose();
    g.computeBoundingSphere();
    g.boundingSphere.radius = 1.6;  // displacement headroom
    geoCache.set(subdiv, g);
    return g;
  }
  const subdivFor = (detail) => clamp(16 + Math.round(clamp(num(detail, 1), 0, 8)) * 5, 16, 56);

  const coreGroup = new THREE.Group();
  scene.add(coreGroup);
  const bodyMat = coreMaterial(null, { layer: 'body' });
  const shellMat = coreMaterial(null, { layer: 'shell' });
  const glassMat = coreMaterial(null, { layer: 'glass' });
  for (const m of [bodyMat, shellMat, glassMat]) {
    m.uniforms.uCore.value = cur.core; m.uniforms.uGlow.value = cur.glow;
    m.uniforms.uRim.value = cur.rim; m.uniforms.uAccent.value = cur.accent;
  }
  let curSubdiv = subdivFor(1);
  const body = new THREE.Mesh(sphereGeo(curSubdiv), bodyMat);
  const shell = new THREE.Mesh(sphereGeo(curSubdiv), shellMat);
  const glass = new THREE.Mesh(sphereGeo(30), glassMat);
  shell.scale.setScalar(1.06);
  glass.scale.setScalar(1.22);
  shell.renderOrder = 2; glass.renderOrder = 3;
  coreGroup.add(body); coreGroup.add(shell); coreGroup.add(glass);

  // ---------------- charge ring (always faces the camera so the timing is readable) ----------------
  const ringGeo = new THREE.TorusGeometry(RING_RADIUS, 0.034, 20, 420);
  const ringMat = ringMaterial(null);
  ringMat.uniforms.uBase.value = cur.glow;
  ringMat.uniforms.uWin.value = cur.accent;
  ringMat.uniforms.uPerf.value = cur.rim;
  ringMat.uniforms.uMarker.value = cMarker;
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 5;
  scene.add(ring);

  // ---------------- orbit bands ----------------
  const orbitGeo = new THREE.TorusGeometry(1, 0.0035, 6, 320);
  const orbits = [];
  for (let i = 0; i < ORBIT_COUNT; i++) {
    const mat = new THREE.ShaderMaterial({
      name: 'hypernova.orbit',
      uniforms: { uPhase: { value: i * 1.7 }, uAlpha: { value: 0 }, uColor: { value: i % 2 ? cur.rim : cur.accent } },
      vertexShader: ORBIT_VERT, fragmentShader: ORBIT_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(orbitGeo, mat);
    const r = 2.45 + i * 0.38;
    m.scale.setScalar(r);
    m.rotation.set(Math.PI / 2 + Math.sin(i * 2.3) * 0.6, Math.cos(i * 1.7) * 0.8, i * 0.9);
    m.renderOrder = 4;
    m.userData.speed = (0.9 - i * 0.09) * (i % 2 ? -1 : 1);
    m.visible = false;
    coreGroup.add(m);
    orbits.push(m);
  }

  // ---------------- particles ----------------
  const fx = createFX(THREE, scene, bus);

  // ---------------- post ----------------
  const rt = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, {
    type: THREE.HalfFloatType, samples: 4,
  });
  rt.texture.name = 'hypernova.composer.rt';
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.5, 0.45, 0.85);
  const outputPass = new OutputPass();
  const finalPass = new ShaderPass(FINAL_SHADER);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(outputPass);
  composer.addPass(finalPass);

  // ---------------- juice state ----------------
  const J = { shake: 0, dolly: 0, flash: 0, hitStop: 0, punch: 0, ringHit: 0, ringPerf: 0, bgPulse: 0, aberr: 0 };
  const add = (k, v, cap) => { J[k] = Math.min(cap, J[k] + v); };
  const offs = [];
  function on(evt, fn) {
    if (!bus || typeof bus.on !== 'function') return;
    const off = bus.on(evt, fn);
    offs.push(typeof off === 'function' ? off : () => bus.off && bus.off(evt, fn));
  }
  on(EVT.PULSE, () => { add('punch', 0.03, 0.09); add('flash', 0.1, 0.5); add('bgPulse', 0.08, 0.6); });
  on(EVT.CRIT, () => {
    add('shake', 0.35, 1.5); add('dolly', 0.35, 1.2); add('flash', 0.7, 2.5);
    J.ringHit = 1; add('punch', 0.08, 0.16); add('bgPulse', 0.4, 1); add('aberr', 0.5, 1.5);
  });
  on(EVT.PERFECT, () => {
    J.hitStop = Math.max(J.hitStop, 0.04);          // freeze the VISUAL clock only
    add('shake', 0.5, 1.5); add('dolly', 0.5, 1.2); add('flash', 1.4, 3);
    J.ringPerf = 1; add('punch', 0.1, 0.18); add('aberr', 1.0, 1.5);
  });
  on(EVT.OVERDRIVE_START, () => {
    add('shake', 0.8, 1.6); add('dolly', 1.0, 1.4); add('flash', 1.2, 3); add('bgPulse', 1, 1.5); add('aberr', 1.2, 1.5);
  });
  on(EVT.OVERDRIVE_END, () => { add('flash', 0.3, 3); add('shake', 0.2, 1.5); });
  on(EVT.STAGE_UP, () => {
    add('shake', 1.0, 1.8); add('dolly', 0.8, 1.4); add('flash', 2.0, 3.5); add('bgPulse', 1.2, 1.5); add('aberr', 1.0, 1.5);
  });
  on(EVT.COLLAPSE, () => { add('shake', 1.2, 2); add('flash', 2.5, 3.5); add('aberr', 1.5, 1.5); });
  on(EVT.ASCEND, () => { add('shake', 1.4, 2); add('flash', 3.0, 3.5); add('aberr', 1.5, 1.5); });
  on(EVT.BUY, () => { add('flash', 0.15, 2); add('punch', 0.02, 0.09); });

  // ---------------- context loss ----------------
  let contextLost = false;
  const onLost = (e) => { if (e && e.preventDefault) e.preventDefault(); contextLost = true; };
  const onRestored = () => { contextLost = false; };
  if (canvas.addEventListener) {
    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);
  }

  // ---------------- per-frame scratch (hoisted: zero allocations in update) ----------------
  const vRight = new THREE.Vector3();
  const vUp = new THREE.Vector3();
  let vTime = 0;          // visual clock (hit-stop freezes this)
  let flowT = 0;          // plasma flow clock (speeds up with combo/overdrive, never jumps)
  let realTime = 0;
  let azimuth = 0.6;
  let camDist = 6;
  let odBlend = 0;
  let readyBlend = 1;
  let inWinBlend = 0;
  let bloomStrength = 0.5;
  let comboBlend = 0;
  let stageScale = 1;
  let lastStageIndex = -1;
  let paused = false;
  let disposed = false;
  let firstFrame = true;
  let fov = 45;

  // compare field-by-field against the last seen strings (no per-frame string building)
  const lastPal = { core: '', glow: '', rim: '', bg: '', accent: '' };
  function applyPalette(p, immediate) {
    if (!p) return;
    for (let i = 0; i < PKEYS.length; i++) {
      const k = PKEYS[i];
      const v = p[k];
      if (typeof v !== 'string' || v === lastPal[k]) continue;
      lastPal[k] = v;
      if (HEX.test(v)) tgt[k].set(v);
      if (immediate) cur[k].copy(tgt[k]);
    }
  }

  function update(snap, dt) {
    if (disposed) return;
    const s = snap || EMPTY;
    let realDt = clamp(num(dt, 1 / 60), 0, 0.1);
    realTime += realDt;

    // hit-stop: freeze the visual clock, never the game
    let vdt = realDt;
    if (J.hitStop > 0) { J.hitStop -= realDt; vdt = 0; }
    if (paused) vdt = 0;
    vTime += vdt;

    // ---- read snapshot defensively ----
    const st = s.stage || EMPTY;
    const stageIndex = Math.max(0, Math.floor(num(st.index, 0)));
    const maxCombo = num(TUNE.combo && TUNE.combo.maxCombo, 50) || 50;
    const combo = clamp(num(s.combo, 0), 0, maxCombo);
    const comboN = combo / maxCombo;
    const odActive = num(s.overdriveTimer, 0) > 0;
    const need = num(TUNE.overdrive && TUNE.overdrive.need, 100) || 100;
    const odFill = clamp(num(s.overdrive, 0) / need, 0, 1);
    const ch = s.charge || EMPTY;

    applyPalette(st.palette, firstFrame);
    if (stageIndex !== lastStageIndex) {
      const sub = subdivFor(st.detail);
      if (sub !== curSubdiv) {
        curSubdiv = sub;
        const g = sphereGeo(sub);
        body.geometry = g; shell.geometry = g;
      }
      lastStageIndex = stageIndex;
    }
    if (firstFrame) { camDist = num(st.camDist, 6); }

    // ---- smoothed drivers ----
    const kPal = 1 - Math.exp(-2.2 * realDt);
    for (let i = 0; i < PKEYS.length; i++) cur[PKEYS[i]].lerp(tgt[PKEYS[i]], kPal);
    cMarker.copy(cur.core).lerp(cWhite, 0.45);
    odBlend = approach(odBlend, odActive ? 1 : 0, odActive ? 4 : 1.5, realDt);
    comboBlend = approach(comboBlend, comboN, 6, realDt);
    stageScale = approach(stageScale, 1 + Math.min(stageIndex, 16) * 0.035, 1.5, realDt);

    // juice decay (shake on real time; everything else on visual time)
    J.shake *= Math.exp(-5.5 * realDt);
    J.aberr *= Math.exp(-4 * realDt);
    J.dolly *= Math.exp(-3 * vdt);
    J.flash *= Math.exp(-4.5 * vdt);
    J.punch *= Math.exp(-11 * vdt);
    J.ringHit *= Math.exp(-5 * vdt);
    J.ringPerf *= Math.exp(-4 * vdt);
    J.bgPulse *= Math.exp(-3 * vdt);

    // ---- core ----
    const flowRate = 1 + comboBlend * 1.2 + odBlend * 1.8;
    flowT += vdt * flowRate;
    const spin = 0.12 + comboBlend * 0.55 + odBlend * 0.9;
    body.rotation.y += vdt * spin;
    body.rotation.x = Math.sin(vTime * 0.13) * 0.25;
    shell.rotation.y -= vdt * spin * 0.65;
    shell.rotation.z += vdt * spin * 0.21;
    glass.rotation.y += vdt * 0.05;
    coreGroup.scale.setScalar(stageScale);

    const intensity = 1 + comboBlend * 0.7 + odBlend * 0.45 + Math.min(J.flash, 2) * 0.1;
    const disp = Math.min(0.2, 0.055 + stageIndex * 0.01) + odBlend * 0.06 + J.punch * 0.25;
    const freq = Math.min(2.4, 1.3 + stageIndex * 0.07);
    bodyMat.uniforms.uTime.value = flowT;
    bodyMat.uniforms.uDisplace.value = disp;
    bodyMat.uniforms.uFreq.value = freq;
    bodyMat.uniforms.uPunch.value = J.punch;
    bodyMat.uniforms.uIntensity.value = intensity;
    bodyMat.uniforms.uFlash.value = Math.min(J.flash, 2) * 0.5;
    bodyMat.uniforms.uHeat.value = odBlend;
    shellMat.uniforms.uTime.value = flowT * 0.8;
    shellMat.uniforms.uDisplace.value = disp * 1.4;
    shellMat.uniforms.uFreq.value = freq * 0.8;
    shellMat.uniforms.uPunch.value = J.punch * 1.3;
    shellMat.uniforms.uIntensity.value = intensity;
    shellMat.uniforms.uFlash.value = J.flash;
    shellMat.uniforms.uHeat.value = odBlend;
    shellMat.uniforms.uOpacity.value = 0.55 + comboBlend * 0.35 + odBlend * 0.3;
    glassMat.uniforms.uTime.value = vTime;
    glassMat.uniforms.uPunch.value = J.punch * 0.4;
    glassMat.uniforms.uFlash.value = J.flash;
    glassMat.uniforms.uHeat.value = odBlend;
    glassMat.uniforms.uCharge.value = odFill;
    glassMat.uniforms.uIntensity.value = intensity;

    // ---- orbits: count reacts to stage, combo and overdrive ----
    const orbitSpeed = num(st.orbit, 1);
    const wantOrbits = clamp(1 + Math.floor(stageIndex / 2) + Math.floor(combo / 15) + (odActive ? 2 : 0), 1, ORBIT_COUNT);
    for (let i = 0; i < ORBIT_COUNT; i++) {
      const o = orbits[i];
      const u = o.material.uniforms;
      u.uAlpha.value = approach(u.uAlpha.value, i < wantOrbits ? 1 + odBlend * 0.6 : 0, 3, realDt);
      o.visible = u.uAlpha.value > 0.003;
      u.uPhase.value = (u.uPhase.value + vdt * o.userData.speed * orbitSpeed * (1 + comboBlend + odBlend * 2)) % TAU;
    }

    // ---- charge ring ----
    let ang = num(ch.angle, 0) % TAU;
    if (ang < 0) ang += TAU;
    const window_ = Math.max(0.005, num(ch.window, num(TUNE.charge && TUNE.charge.window, 0.22)));
    const perfectFrac = clamp(num(ch.perfectFrac, num(TUNE.charge && TUNE.charge.perfectFrac, 0.25)), 0, 1);
    const ready = ch.ready === undefined ? true : !!ch.ready;
    let dz = ang; if (dz > Math.PI) dz = TAU - dz;     // |angle to target at 0|
    readyBlend = approach(readyBlend, ready ? 1 : 0, 12, realDt);
    inWinBlend = approach(inWinBlend, ready && dz <= window_ ? 1 : 0, 25, realDt);
    const ru = ringMat.uniforms;
    ru.uTime.value = vTime;
    ru.uAngle.value = ang;
    ru.uWindow.value = window_;
    ru.uPerfect.value = perfectFrac;
    ru.uReady.value = readyBlend;
    ru.uInWindow.value = inWinBlend;
    ru.uHit.value = J.ringHit;
    ru.uPerfHit.value = J.ringPerf;
    ring.scale.setScalar(stageScale * (1 + J.ringPerf * 0.05 + J.ringHit * 0.025));

    // ---- camera: slow orbit, distance lerp, dolly, shake ----
    camDist = approach(camDist, Math.max(2.5, num(st.camDist, 6)), 1.2, realDt);
    azimuth += vdt * 0.05 * orbitSpeed * (1 + odBlend * 2.5);
    const elev = 0.2 + Math.sin(vTime * 0.045) * 0.14;
    const dist = camDist * (1 - 0.12 * Math.min(J.dolly, 1.4)) * (1 - 0.1 * odBlend);
    camera.position.set(
      Math.sin(azimuth) * Math.cos(elev) * dist,
      Math.sin(elev) * dist,
      Math.cos(azimuth) * Math.cos(elev) * dist,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    ring.quaternion.copy(camera.quaternion);           // ring faces the viewer, unrolled
    const targetFov = 45 + odBlend * 8 + Math.min(J.dolly, 1) * -2;
    if (Math.abs(targetFov - fov) > 0.01) {
      fov = approach(fov, targetFov, 5, realDt);
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const sh = J.shake * J.shake;                       // perceptual: quadratic falloff
    if (sh > 1e-5) {
      camera.updateMatrixWorld();
      vRight.setFromMatrixColumn(camera.matrixWorld, 0);
      vUp.setFromMatrixColumn(camera.matrixWorld, 1);
      const t = realTime;
      const amp = 0.16 * sh * (camDist / 6);
      const sx = (Math.sin(t * 47.0) + Math.sin(t * 31.7 + 1.3) * 0.6) * amp;
      const sy = (Math.sin(t * 53.3 + 0.7) + Math.sin(t * 27.1 + 2.1) * 0.6) * amp;
      camera.position.addScaledVector(vRight, sx).addScaledVector(vUp, sy);
      camera.rotateZ(Math.sin(t * 39.0) * 0.012 * sh);
    }

    // ---- background + stars ----
    bgMat.uniforms.uTime.value = vTime;
    bgMat.uniforms.uPulse.value = J.bgPulse + Math.min(J.flash, 2) * 0.1;
    bgMat.uniforms.uHeat.value = odBlend;
    bgMat.uniforms.uOffset.value.set(Math.sin(azimuth) * 0.05, elev * 0.05);
    starMat.uniforms.uTime.value = vTime;
    starMat.uniforms.uBright.value = 1 + odBlend * 0.5;
    for (let i = 0; i < starGroups.length; i++) {
      const g = starGroups[i];
      g.rotation.y += vdt * g.userData.speed * (1 + odBlend * 6);
      g.rotation.x = Math.sin(vTime * 0.01 + i) * 0.05;
    }

    // ---- particles ----
    fx.update(s, vdt);

    // ---- post ----
    const bloomBase = num(st.bloom, 0.35);
    const bTarget = 0.2 + bloomBase * 0.9 + odBlend * 0.3 + Math.min(J.flash, 2.5) * 0.1;
    bloomStrength = approach(bloomStrength, bTarget, 8, realDt);
    bloom.strength = bloomStrength;
    bloom.radius = 0.42 + odBlend * 0.2;
    finalPass.uniforms.uAberr.value = 0.004 * J.aberr + 0.0025 * odBlend;

    firstFrame = false;
    if (!contextLost) composer.render(realDt);
  }

  function resize(w, h) {
    if (disposed) return;
    width = Math.max(1, Math.floor(num(w, canvas.clientWidth || width)));
    height = Math.max(1, Math.floor(num(h, canvas.clientHeight || height)));
    pixelRatio = Math.min(MAX_PIXEL_RATIO, (win && win.devicePixelRatio) || 1);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const aspect = width / height;
    bgMat.uniforms.uAspect.value = aspect;
    finalPass.uniforms.uAspect.value = aspect;
    starMat.uniforms.uPixelRatio.value = pixelRatio;
    starMat.uniforms.uScale.value = Math.max(20, height * 0.06);
    if (fx.setPixelRatio) fx.setPixelRatio(pixelRatio, height);
  }

  function setPaused(b) { paused = !!b; }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const off of offs) { try { off(); } catch (e) { /* ignore */ } }
    offs.length = 0;
    if (canvas.removeEventListener) {
      canvas.removeEventListener('webglcontextlost', onLost, false);
      canvas.removeEventListener('webglcontextrestored', onRestored, false);
    }
    fx.dispose();
    const geos = new Set();
    const mats = new Set();
    scene.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    });
    for (const g of geoCache.values()) geos.add(g);
    geoCache.clear();
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    renderPass.dispose(); bloom.dispose(); outputPass.dispose(); finalPass.dispose();
    composer.dispose();      // disposes rt (renderTarget1) + its clone
    renderer.dispose();
  }

  resize(width, height);
  return { update, resize, setPaused, dispose };
}
