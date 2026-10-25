// One-shot PM data fix: densify the STAGES ladder (measured from tools/curve.js).
import { readFileSync, writeFileSync } from 'node:fs';
const NEW = [0, 120, 700, 4e3, 2.2e4, 1.2e5, 6e5, 3e6, 1.5e7, 7.5e7, 4e8, 2e9, 1e10, 5e10, 2.5e11];
const p = 'src/core/content.js';
let src = readFileSync(p, 'utf8');
const start = src.indexOf('export const STAGES = [');
const end = src.indexOf('\n];', start);
if (start < 0 || end < 0) { console.error('STAGES block not found'); process.exit(1); }
let block = src.slice(start, end);
let i = 0;
block = block.replace(/at: [0-9e.]+,/g, () => {
  if (i >= NEW.length) { console.error('more at: than new values'); process.exit(1); }
  return `at: ${NEW[i++]},`;
});
if (i !== NEW.length) { console.error('replaced ' + i + ' expected ' + NEW.length); process.exit(1); }
writeFileSync(p, src.slice(0, start) + block + src.slice(end));
console.log('rewrote ' + i + ' stage thresholds');
