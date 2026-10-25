// HYPERNOVA — procedural shader materials. Renderer-owned.
// ZERO textures: every pixel here is computed from noise, fresnel and gradients.
import * as THREE from 'three';

const DEFAULT_PALETTE = {
  core: '#ffd9a0', glow: '#ff7a1a', rim: '#fff3c4', bg: '#0a0705', accent: '#ffb347',
};

function col(palette, key) {
  const c = new THREE.Color(DEFAULT_PALETTE[key]);
  const v = palette && typeof palette[key] === 'string' ? palette[key] : null;
  if (v && /^#[0-9a-fA-F]{6}$/.test(v)) c.set(v);
  return c;
}

// ---------------------------------------------------------------------------
// GLSL: 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT) + helpers.
// ---------------------------------------------------------------------------
const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

// Interleaved gradient noise — used for dithering so dark gradients never band.
const IGN_GLSL = /* glsl */ `
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

// ---------------------------------------------------------------------------
// CORE — three layers share one vertex program:
//   layer 0 = BODY  : opaque living plasma, displaced by layered noise, smooth normals
//   layer 1 = SHELL : wispy additive corona (counter-rotated by scene.js)
//   layer 2 = GLASS : thin polished outer shell, additive fresnel + specular glint
// ---------------------------------------------------------------------------
const CORE_VERT = /* glsl */ `
uniform float uTime;
uniform float uDisplace;
uniform float uFreq;
uniform float uFlow;
uniform float uPunch;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vObj;
varying float vDisp;
${NOISE_GLSL}
// layered (fbm-ish) noise with a domain warp so the surface "boils" instead of sliding
float field(vec3 n){
  vec3 q = n * uFreq;
  float t = uTime * uFlow;
  vec3 warp = vec3(snoise(q + vec3(0.0, t, 0.0)), snoise(q + vec3(5.2, -t, 1.3)), 0.0) * 0.35;
  float a = snoise(q + warp + vec3(0.0, t * 0.6, 0.0));
  float b = snoise(q * 2.07 + warp * 1.7 + vec3(3.7, -t * 0.9, 1.1));
  return a * 0.8 + b * 0.2;
}
vec3 displaced(vec3 n){ return n * (1.0 + field(n) * uDisplace + uPunch); }
void main(){
  vec3 n0 = normalize(position);
  float d = field(n0);
  vec3 p = n0 * (1.0 + d * uDisplace + uPunch);
  // finite-difference normal of the displaced surface => smooth shading, no faceting
  vec3 helper = abs(n0.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t = normalize(cross(n0, helper));
  vec3 b = cross(n0, t);
  float e = 0.012;
  vec3 p1 = displaced(normalize(n0 + t * e));
  vec3 p2 = displaced(normalize(n0 + b * e));
  vec3 nrm = normalize(cross(p1 - p, p2 - p));
  if (dot(nrm, n0) < 0.0) nrm = -nrm;
  vDisp = d;
  vObj = n0;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vPosW = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * nrm);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const CORE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;   // emissive drive (combo / overdrive)
uniform float uFlash;       // transient hit flash
uniform float uHeat;        // 0..1 overdrive heat
uniform float uCharge;      // 0..1 overdrive meter fill
uniform float uOpacity;
uniform vec3 uCore;
uniform vec3 uGlow;
uniform vec3 uRim;
uniform vec3 uAccent;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vObj;
varying float vDisp;
${NOISE_GLSL}
void main(){
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 N = normalize(vNormalW);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  float t = uTime;
#if LAYER == 0
  // ---- BODY ----
  // large slow convection cells, warped by a second octave
  float n1 = snoise(vObj * 1.8 + vec3(t * 0.16, -t * 0.12, t * 0.07)) * 0.5 + 0.5;
  float n2 = snoise(vObj * 4.6 + vec3(-t * 0.27, t * 0.11, n1 * 1.8)) * 0.5 + 0.5;
  float n3 = snoise(vObj * 11.0 + vec3(n2 * 2.0, -t * 0.4, t * 0.3)) * 0.5 + 0.5;
  // thin hot filaments (ridged noise)
  float ridge = 1.0 - abs(snoise(vObj * 3.3 + vec3(n1 * 1.2, t * 0.22, -t * 0.15)));
  float veins = pow(ridge, 16.0);
  float heat = clamp(vDisp * 1.3 + 0.5, 0.0, 1.0);
  // core -> glow by noise and view angle: bright, hot face; deeper glow colour toward the limb
  float m = clamp(n1 * 0.5 + n2 * 0.3 + n3 * 0.12 + ndv * 0.35 - 0.2, 0.0, 1.0);
  vec3 deep = uGlow * 0.18;
  vec3 mid = uGlow * 0.55;
  vec3 hot = uCore * 0.85;
  vec3 colr = mix(deep, mid, smoothstep(0.1, 0.55, m));
  colr = mix(colr, hot, smoothstep(0.5, 0.95, m));
  colr *= 0.45 + 0.75 * heat;
  colr += mix(uCore, vec3(1.0), 0.3) * veins * (0.35 + uHeat * 0.5 + uIntensity * 0.15);
  colr += uAccent * pow(n3, 6.0) * 0.12;
  // limb: darken, then a thin fresnel rim in palette.rim
  colr *= mix(0.55, 1.0, pow(ndv, 0.6));
  colr += uRim * fres * (0.55 + uIntensity * 0.3 + uHeat * 0.6);
  colr *= 0.6 + 0.4 * uIntensity;
  // overdrive heat raises CONTRAST, not just level: cool cells sink, hot cells and veins climb,
  // so the convection pattern stays readable at the peak
  colr *= mix(1.0, 0.45 + 1.1 * m, uHeat * 0.7);
  colr += mix(uCore, vec3(1.0), 0.3) * veins * uHeat * 0.35;
  colr += mix(uRim, vec3(1.0), 0.5) * uFlash * (0.15 + fres * 0.8);
  // soft knee (hue-preserving): nothing runs away to a flat white plateau before tonemapping
  float pk = max(colr.r, max(colr.g, colr.b));
  if (pk > 1.0) colr *= (1.0 + (pk - 1.0) / (1.0 + (pk - 1.0) * 1.2)) / pk;
  gl_FragColor = vec4(colr, 1.0);
#elif LAYER == 1
  // ---- SHELL (wispy corona) ----
  float w1 = snoise(vObj * 3.1 + vec3(0.0, -t * 0.35, t * 0.2)) * 0.5 + 0.5;
  float w2 = snoise(vObj * 7.7 + vec3(t * 0.4, w1 * 2.0, 0.0)) * 0.5 + 0.5;
  float wisp = smoothstep(0.52, 0.92, w1 * 0.7 + w2 * 0.35);
  float edge = 0.25 + fres * 1.6;
  vec3 colr = mix(uGlow, uAccent, w2) * wisp * edge * (0.12 + uIntensity * 0.18 + uHeat * 0.4);
  colr += uRim * uFlash * fres * 0.6;
  gl_FragColor = vec4(colr * uOpacity, 1.0);
#else
  // ---- GLASS (polished outer shell) ----
  float rimF = pow(1.0 - ndv, 5.0);
  vec3 L1 = normalize(vec3(0.55, 0.75, 0.6));
  vec3 L2 = normalize(vec3(-0.7, -0.2, 0.5));
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, L1), 0.0), 220.0) * 1.6 + pow(max(dot(R, L2), 0.0), 90.0) * 0.3;
  float sweep = smoothstep(0.985, 1.0, sin(dot(vObj, vec3(0.6, 0.8, 0.0)) * 3.0 - t * 0.7)) * rimF;
  vec3 colr = uRim * rimF * (0.35 + uCharge * 0.5 + uHeat * 0.5)
            + vec3(1.0) * spec * 0.45
            + uAccent * sweep * 0.6;
  // full overdrive meter: the glass "breathes" to say READY
  colr += uAccent * rimF * step(0.999, uCharge) * (0.2 + 0.2 * sin(t * 6.0));
  colr += uRim * uFlash * rimF * 0.5;
  gl_FragColor = vec4(colr * uOpacity, 1.0);
#endif
}
`;

/**
 * Core plasma material.
 * @param {object} palette  STAGES[].palette
 * @param {object} [opts]   { layer: 'body' | 'shell' | 'glass' }  (optional; default 'body')
 */
export function coreMaterial(palette, opts = {}) {
  const layerName = opts && opts.layer ? opts.layer : 'body';
  const layer = layerName === 'shell' ? 1 : layerName === 'glass' ? 2 : 0;
  const uniforms = {
    uTime: { value: 0 },
    uDisplace: { value: layer === 0 ? 0.08 : layer === 1 ? 0.12 : 0.012 },
    uFreq: { value: layer === 0 ? 1.5 : layer === 1 ? 1.1 : 0.8 },
    uFlow: { value: layer === 0 ? 0.22 : 0.3 },
    uPunch: { value: 0 },
    uIntensity: { value: 1 },
    uFlash: { value: 0 },
    uHeat: { value: 0 },
    uCharge: { value: 0 },
    uOpacity: { value: 1 },
    uCore: { value: col(palette, 'core') },
    uGlow: { value: col(palette, 'glow') },
    uRim: { value: col(palette, 'rim') },
    uAccent: { value: col(palette, 'accent') },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'hypernova.core.' + layerName,
    uniforms,
    vertexShader: CORE_VERT,
    fragmentShader: CORE_FRAG,
    defines: { LAYER: layer },
    transparent: layer !== 0,
    depthWrite: layer === 0,
    blending: layer === 0 ? THREE.NormalBlending : THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  return mat;
}

// ---------------------------------------------------------------------------
// CHARGE RING — torus in its local XY plane. Game angle 0 (the target) is drawn at
// 12 o'clock; the marker sweeps CLOCKWISE as snap.charge.angle increases.
//   visible base track  |  FAT bright HIT WINDOW arc  |  white PERFECT core  |  bead marker
// The vertex shader swells the tube where it matters (the hit arc ~2x, the marker ~3x), so the
// two things the player must track read by SHAPE as well as by brightness. A dark backing band
// (ringBackingMaterial) is drawn under the ring so it separates from nebula, orbits and halo.
// ---------------------------------------------------------------------------
const RING_COMMON = /* glsl */ `
uniform float uAngle;      // marker angle (rad, already wrapped to 0..2pi)
uniform float uWindow;     // half-width of hit window (rad)
uniform float uRadius;     // torus major radius (matches the geometry)
const float TAU = 6.28318530718;
const float PI = 3.14159265359;
float wrapPi(float a){ return a - TAU * floor((a + PI) / TAU); }
// game angle of a torus u coordinate: 0 at top, clockwise
float gameAngle(float u){ return PI * 0.5 - u * TAU; }
float arcMask(float dz){ return 1.0 - smoothstep(uWindow - 0.02, uWindow + 0.02, dz); }
float beadMask(float dm){ return exp(-dm * dm * 420.0); }
vec3 swollen(vec3 p, float u, float k){
  float th = u * TAU;
  vec3 c = vec3(cos(th), sin(th), 0.0) * uRadius;      // tube centre line
  return c + (p - c) * k;
}
`;

const RING_VERT = /* glsl */ `
${RING_COMMON}
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main(){
  vUv = uv;
  float g = gameAngle(uv.x);
  float k = 1.0 + 0.9 * arcMask(abs(wrapPi(g))) + 1.9 * beadMask(wrapPi(g - uAngle));
  vec3 p = swollen(position, uv.x, k);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vPosW = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const RING_FRAG = /* glsl */ `
${RING_COMMON}
uniform float uTime;
uniform float uPerfect;    // perfectFrac
uniform float uReady;      // 0..1 (eased)
uniform float uInWindow;   // 0..1 marker currently inside the window
uniform float uHit;        // flash after a successful fire
uniform float uPerfHit;    // flash after a perfect
uniform float uOpacity;
uniform vec3 uBase;
uniform vec3 uWin;
uniform vec3 uPerf;
uniform vec3 uMarker;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main(){
  vec3 V = normalize(cameraPosition - vPosW);
  float ndv = clamp(abs(dot(normalize(vNormalW), V)), 0.0, 1.0);
  float tubeCore = pow(ndv, 1.4);          // neon-tube: bright centre line, soft edges
  float g = gameAngle(vUv.x);
  float dz = abs(wrapPi(g));
  float win  = arcMask(dz);
  float pw   = uWindow * uPerfect;
  float perf = 1.0 - smoothstep(pw - 0.008, pw + 0.008, dz);
  float edge = exp(-pow((dz - uWindow) * 70.0, 2.0));          // crisp window boundaries
  float dm = wrapPi(g - uAngle);           // <0 behind the marker
  float head = beadMask(dm);
  float gap = exp(-pow((abs(dm) - 0.075) * 34.0, 2.0));        // dark notches either side of the bead
  float tail = dm < 0.0 ? exp(dm * 3.2) : 0.0;                  // fading comet tail
  float ready = mix(0.5, 1.0, uReady);
  float breathe = 0.88 + 0.12 * sin(uTime * 3.0);
  float body = 0.4 + 0.6 * tubeCore;
  vec3 c = uBase * 0.14 * body;                                          // visible track
  c += uWin  * win  * (0.8 + 0.7 * uInWindow) * body * breathe;          // HIT window arc
  c += mix(uPerf, vec3(1.0), 0.5) * perf * (0.9 + 0.9 * uInWindow) * body; // PERFECT core
  c += mix(uWin, vec3(1.0), 0.5) * edge * 0.9;                           // window end caps
  c *= ready;
  c *= 1.0 - 0.85 * gap;                                                 // carve the notches
  c += uMarker * tail * 0.45 * uReady * body;
  c += mix(uMarker, vec3(1.0), 0.6) * head * (2.2 + 1.2 * uInWindow) * body; // bead marker
  c += mix(uWin, vec3(1.0), 0.4) * uHit * (0.25 + win * 1.2);
  c += vec3(1.0) * uPerfHit * (0.4 + perf * 2.5);
  gl_FragColor = vec4(c * uOpacity, 1.0);
}
`;

export function ringMaterial(palette) {
  const base = col(palette, 'glow');
  const win = col(palette, 'accent');
  const perf = col(palette, 'rim');
  const marker = col(palette, 'core').lerp(new THREE.Color(1, 1, 1), 0.35);
  return new THREE.ShaderMaterial({
    name: 'hypernova.ring',
    uniforms: {
      uTime: { value: 0 },
      uAngle: { value: Math.PI },
      uWindow: { value: 0.22 },
      uRadius: { value: 1.9 },
      uPerfect: { value: 0.25 },
      uReady: { value: 1 },
      uInWindow: { value: 0 },
      uHit: { value: 0 },
      uPerfHit: { value: 0 },
      uOpacity: { value: 1 },
      uBase: { value: base },
      uWin: { value: win },
      uPerf: { value: perf },
      uMarker: { value: marker },
    },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const RING_BACK_VERT = /* glsl */ `
${RING_COMMON}
uniform float uWiden;      // backing band is this much fatter than the lit tube
varying float vFade;
void main(){
  float g = gameAngle(uv.x);
  float k = (1.0 + 0.9 * arcMask(abs(wrapPi(g))) + 1.9 * beadMask(wrapPi(g - uAngle))) * uWiden;
  vec3 p = swollen(position, uv.x, k);
  vFade = 1.0;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}
`;
const RING_BACK_FRAG = /* glsl */ `
uniform float uAlpha;
varying float vFade;
void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, uAlpha * vFade); }
`;

/**
 * Dark backing band for the charge ring (normal blending, drawn just before the ring).
 * @param {object} [shared] ringMaterial().uniforms — angle/window/radius are SHARED so the
 *   backing swells under the hit arc and the marker exactly like the lit tube.
 */
export function ringBackingMaterial(shared) {
  const u = shared || {};
  return new THREE.ShaderMaterial({
    name: 'hypernova.ringBacking',
    uniforms: {
      uAngle: u.uAngle || { value: Math.PI },
      uWindow: u.uWindow || { value: 0.22 },
      uRadius: u.uRadius || { value: 1.9 },
      uWiden: { value: 1.7 },
      uAlpha: { value: 0.6 },
    },
    vertexShader: RING_BACK_VERT,
    fragmentShader: RING_BACK_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------------------
// BACKGROUND — fullscreen quad (PlaneGeometry(2,2)) drawn at the far plane.
// Radial gradient palette.bg -> black, faint drifting nebula, halo behind the core,
// vignette, and dithering so the dark gradient never bands.
// (The parallax starfield is a separate additive Points layer built in scene.js.)
// ---------------------------------------------------------------------------
const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const BG_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAspect;
uniform float uPulse;      // transient brightening on hits
uniform float uHeat;       // overdrive
uniform vec2 uOffset;      // tiny parallax offset from camera orbit
uniform vec3 uBg;
uniform vec3 uGlow;
uniform vec3 uAccent;
varying vec2 vUv;
${IGN_GLSL}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float r = length(p);
  vec2 q = p + uOffset;
  // base gradient: palette.bg (lifted) in the middle -> black at the edges
  vec3 c = mix(uBg * 2.4, vec3(0.0), smoothstep(0.0, 1.05, r));
  // nebula
  float n1 = fbm(q * 1.7 + vec2(uTime * 0.010, -uTime * 0.006));
  float n2 = fbm(q * 3.3 - vec2(n1 * 1.4) + vec2(-uTime * 0.013, uTime * 0.008));
  float neb = pow(clamp(n2, 0.0, 1.0), 3.2);
  c += mix(uGlow, uAccent, n1) * neb * 0.16 * (1.0 - smoothstep(0.15, 1.2, r)) * (1.0 + uHeat * 1.2);
  // halo behind the core
  c += uGlow * exp(-r * r * 7.0) * (0.06 + uPulse * 0.35 + uHeat * 0.12);
  // vignette
  c *= mix(1.0, 0.25, smoothstep(0.35, 1.15, r));
  // dither (pre-tonemap, scaled to luminance so it vanishes where it is not needed)
  float d = ign(gl_FragCoord.xy) - 0.5;
  c += d * (0.0025 + max(c.r, max(c.g, c.b)) * 0.02);
  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
}
`;

export function backgroundMaterial(palette) {
  return new THREE.ShaderMaterial({
    name: 'hypernova.background',
    uniforms: {
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uPulse: { value: 0 },
      uHeat: { value: 0 },
      uOffset: { value: new THREE.Vector2() },
      uBg: { value: col(palette, 'bg') },
      uGlow: { value: col(palette, 'glow') },
      uAccent: { value: col(palette, 'accent') },
    },
    vertexShader: BG_VERT,
    fragmentShader: BG_FRAG,
    depthTest: false,
    depthWrite: false,
  });
}
