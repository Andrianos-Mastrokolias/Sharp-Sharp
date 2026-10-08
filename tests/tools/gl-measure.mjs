// Dev tool: node tests/tools/gl-measure.mjs capture <outDir>
//           node tests/tools/gl-measure.mjs diff <dirA> <dirB> <outDir>
// Starts vite + headless Edge (SwiftShader), renders every level from four
// fixed cameras (gl-harness.html) and writes <level>-<camera>.png plus
// stats.json (renderer.info calls / triangles in view, shadow pass included).
// `diff` compares two capture dirs pixel by pixel.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const VITE_PORT = 5199;
const CDP_PORT = 9334;
const NAMES = ['spawn', 'mid', 'dest', 'side'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const png = (url) => Buffer.from(url.split(',')[1], 'base64');
const dataUrl = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');

const [mode, ...args] = process.argv.slice(2);
if (mode !== 'capture' && mode !== 'diff') {
  console.error('usage: gl-measure.mjs capture <outDir> | diff <dirA> <dirB> <outDir>');
  process.exit(2);
}

const vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', VITE_PORT, '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
await new Promise((resolve) => vite.stdout.on('data', (d) => /localhost/.test(String(d)) && resolve()));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-edge-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1280,720', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });

function cleanup() {
  try { edge.kill(); } catch {}
  try { vite.kill(); } catch {}
}
process.on('exit', cleanup);

let page;
for (let i = 0; i < 60 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!page) await sleep(300);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let nextId = 0;
const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d); };
const send = (method, params = {}) => new Promise((r) => { const id = ++nextId; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expression) => {
  const r = (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result;
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://localhost:${VITE_PORT}/tests/tools/gl-harness.html` });
for (let i = 0; i < 100 && !(await run('window.__ready === true')); i++) await sleep(300);

if (mode === 'capture') {
  const [outDir] = args;
  fs.mkdirSync(outDir, { recursive: true });
  const stats = {};
  for (const level of [1, 2, 3]) {
    const loaded = await run(`window.loadLevel(${level})`);
    for (let c = 0; c < 4; c++) {
      const s = await run(`window.shot(${level}, ${c})`);
      fs.writeFileSync(path.join(outDir, `${level}-${NAMES[c]}.png`), png(s.png));
      stats[`${level}-${NAMES[c]}`] = { calls: s.calls, triangles: s.triangles, collidables: loaded.collidables };
    }
  }
  fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify(stats, null, 1));
  console.log(JSON.stringify(stats));
} else {
  const [a, b, outDir] = args;
  fs.mkdirSync(outDir, { recursive: true });
  const result = {};
  for (const level of [1, 2, 3]) {
    for (const name of NAMES) {
      const key = `${level}-${name}`;
      const r = await run(`window.diff(${JSON.stringify(dataUrl(path.join(a, key + '.png')))}, ${JSON.stringify(dataUrl(path.join(b, key + '.png')))})`);
      fs.writeFileSync(path.join(outDir, key + '-diff.png'), png(r.png));
      delete r.png;
      result[key] = r;
    }
  }
  fs.writeFileSync(path.join(outDir, 'diff.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result));
}

cleanup();
process.exit(0);
