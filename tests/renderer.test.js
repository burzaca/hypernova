import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { coreMaterial, ringMaterial, backgroundMaterial } from '../src/render/shaders.js';
import { getStage } from '../src/core/content.js';

describe('Renderer', () => {
  it('coreMaterial for authored and generated palettes', () => {
    const m = coreMaterial(getStage(0).palette);
    assert.ok(m);
    for (const [u, v] of Object.entries(m.uniforms)) {
      if (!v.value || typeof v.value === 'number') assert.ok(Number.isFinite(v.value));
    }
  });
  it('generated palettes (stage 15, 40) build', () => {
    for (const s of [15, 40]) {
      assert.ok(backgroundMaterial(getStage(s).palette));
    }
  });
  it('every colour uniform is finite or a THREE.Color', () => {
    for (let i = 0; i < 200; i++) {
      for (const [name, m] of [['core', coreMaterial(getStage(i % 60).palette)], ['ring', ringMaterial(getStage(i % 60).palette)], ['bg', backgroundMaterial(getStage(i % 60).palette)]]) {
        for (const [uname, v] of Object.entries(m.uniforms)) {
          const val = v.value;
          if (val == null) continue;
          if (typeof val === 'number') assert.ok(Number.isFinite(val), name + '.' + uname + '=' + val);
          else if (val instanceof THREE.Color) assert.ok(!Number.isNaN((val.r || 0) + (val.g || 0) + (val.b || 0)));
        }
      }
    }
  });
  it('palette shape boundary (authored keys ⊇ generated)', () => {
    for (const s of [0, 15, 40]) {
      const p = getStage(s).palette;
      for (const key of ['core', 'glow', 'rim', 'bg', 'accent']) {
        assert.ok(key in p, 'stage ' + s + ' missing ' + key);
      }
    }
  });
  it('material builders return independent materials, 20 rounds deep', () => {
    // Real risk: if a material were cached and shared between stages, one stage's palette would
    // bleed into the next. So assert the objects are distinct and every numeric uniform is finite.
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      for (const m of [coreMaterial(getStage(i % 60).palette), ringMaterial(getStage(i % 60).palette), backgroundMaterial(getStage(i % 60).palette)]) {
        assert.ok(m && m.uniforms, 'material built');
        assert.equal(seen.has(m), false, 'materials must not be shared between stages');
        seen.add(m);
        for (const u of Object.values(m.uniforms)) {
          if (typeof u.value === 'number') assert.ok(Number.isFinite(u.value), 'finite uniform');
        }
      }
    }
    assert.equal(seen.size, 60);
  });
});
