// Build a late-game save for visual checks: deep stage, overdrive charged.
import { createState, tick, snapshot, save } from '../src/core/economy.js';
import { EventBus } from '../src/core/events.js';
import { writeFileSync } from 'node:fs';

const bus = new EventBus();
const s = createState(9);
s.lifetimeFlux = 1e19;
for (let i = 0; i < 600; i++) tick(s, 0.1, bus);
s.overdrive = 100;
const snap = snapshot(s);
writeFileSync('/tmp/hn-late.json', save(s));
console.log('stage', snap.stage.index, snap.stage.name, 'bloom', snap.stage.bloom, 'overdrive', snap.overdrive);
