You are the RENDERER worker on the HYPERNOVA game build. Your job is the thing the player stares
at for an hour. The brief from the player, verbatim: "I want something smooth looking. I don't
want textures like Minecraft, Roblox. I want to be glued to my monitor. AAA worthy."

READ FIRST:
1. docs/INTERFACES.md — section 7 is your contract; sections 1-4 are foundation modules.
2. docs/DESIGN.md — §5 stage evolution and §7 juice are your spec.
3. index.html — the import map for `three` (r186) and `three/addons/` is ALREADY there. Do not
   add another import map. Import as `import * as THREE from 'three';` and
   `import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';` etc.

WRITE THESE THREE FILES, COMPLETE AND RUNNABLE:
  src/render/shaders.js   — coreMaterial(palette), ringMaterial(palette), backgroundMaterial(palette)
  src/render/fx.js        — createFX(three, scene, bus) -> { update(snap, dt), burst(kind, worldPos), dispose() }
  src/render/scene.js     — createScene(canvas, bus) -> { update(snap, dt), resize(w,h), setPaused(bool), dispose() }

ART DIRECTION — this is the whole point, follow it exactly:
- ZERO textures, ZERO image files, ZERO grid/voxel look. Everything is procedural.
- The Core: an icosahedron (subdivided per STAGES[].detail) with a CUSTOM ShaderMaterial that
  (a) displaces vertices with layered 3D simplex/curl-ish noise so it looks like living plasma,
  (b) computes a fresnel rim in palette.rim, (c) mixes palette.core -> palette.glow by noise and
  view angle, (d) has an emissive intensity driven by snap.overdriveTimer/combo. Smooth normals,
  no faceting. Add a slowly counter-rotating inner shell and a thin glass-like outer shell
  (transparent, additive fresnel) so it reads as "polished", not "low-poly".
- The Charge Ring: a torus around the core with a sweeping marker arc; the hit window must be
  VISIBLE as a bright arc segment and the perfect zone as a brighter inner segment. The player
  has to be able to learn the timing by looking.
- Background: a fullscreen gradient shader (palette.bg -> black) plus a parallax starfield of
  additive points that drift; subtle radial vignette. No fog banding.
- Particles (fx.js): additive point sprites drawn as soft radial falloff in the fragment shader
  (gl_PointCoord), NOT textures. Streams flowing INTO the core on every pulse, a burst on CRIT,
  a shockwave ring on STAGE_UP, and speed-lines during OVERDRIVE. Budget <= 4000 particles,
  pooled/reused, no allocation per frame.
- Post: EffectComposer + UnrealBloomPass (strength from snap.stage.bloom, boosted during
  overdrive) + OutputPass. Keep it fast: cap pixel ratio at 1.75.
- Camera: slow auto-orbit; distance lerps toward snap.stage.camDist; dolly-in and screen shake on
  CRIT/OVERDRIVE_START/STAGE_UP (shake decays exponentially). Hit-stop: on PERFECT freeze the
  animation clock ~40ms (do not freeze the game logic — only the visual clock).
- Floating +flux numbers: render as sprite-free DOM? NO — keep it in WebGL: a small pool of
  additive quads is fine, or skip text and use rising light streaks. Prefer streaks (no font work).

HARD RULES:
- Never mutate game state. `update(snap, dt)` reads the snapshot shape from INTERFACES.md §6.
- Must not crash if a snapshot field is missing — code defensively.
- No per-frame `new` allocations inside update(); hoist vectors/colors to module or closure scope.
- Must survive `dispose()` cleanly (dispose geometries/materials/render targets).
- Guard WebGL context creation failure: if `renderer` cannot be created, throw a clear Error.

SELF-TEST (must pass before you finish):
  cd /home/hermes/projects/hypernova
  node --check src/render/shaders.js && node --check src/render/fx.js && node --check src/render/scene.js
  Then a headless smoke test of the module graph (three.js loads in Node 24 as ESM):
  node -e "import('three').then(T=>{const m=new T.ShaderMaterial({});console.log('three ok',T.REVISION)})"
  and
  node -e "Promise.all([import('./src/render/shaders.js'),import('./src/render/fx.js')]).then(([s,f])=>{const T=require('three')||null;console.log(Object.keys(s),Object.keys(f))}).catch(e=>{console.error('FAIL',e.message);process.exit(1)})"
  (if `three` cannot resolve in Node, note it and at minimum pass `node --check` on all three files
  and verify every THREE API you use exists in r186 — check the installed package if needed.)
Report which self-tests actually ran and their real output. Do not claim a test passed if it did not.

Finish by printing the absolute paths you wrote and the word DONE.
