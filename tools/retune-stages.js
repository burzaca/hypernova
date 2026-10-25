// One-shot PM data fix: set the STAGES ladder from the measured curve (tools/curve.js at 6 CPS,
// the researched average human click rate — see tune.js `sim`). Target arc at 6 CPS:
// first form in ~15 s, then a form every 2-5 minutes, final form at ~35-40 minutes.
import { readFileSync, writeFileSync } from 'node:fs';
const NEW = [0, 9e4, 5e5, 1.5e6, 5e6, 2.5e7, 9e7, 1.8e8, 3.5e8, 7e8, 1.5e9, 6e9, 1e11, 1e12, 4e12];
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
