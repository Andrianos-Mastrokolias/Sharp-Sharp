// Uses the existing Edge/CDP infrastructure. Only the temporary served bundle
// receives inspection hooks; production source and the normal dist are unchanged.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'tmp/audio-settings/smoke-dist');
const artifacts = path.join(root, 'tmp/audio-settings');
const edgePath = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!fs.existsSync(edgePath)) throw Error('Set EDGE_PATH to an installed Edge executable.');
const vite = path.join(path.dirname(fileURLToPath(import.meta.resolve('vite/package.json'))), 'bin/vite.js');
const build = spawnSync(process.execPath, [vite, 'build', '--minify=false', '--outDir', output], { cwd: root, encoding: 'utf8' });
if (build.status !== 0) throw Error(build.stdout + build.stderr);
const hooks = `\nwindow.__qa = {
  state: () => ({phase, currentLevel, time: levelManager.getState().time, speed: vehicle.getSpeed(),
    results: results.map(r => ({...r})), volume: audio.volume, audioState: audio.context?.state,
    active: audio.active, voices: audio.voices.size, quality: renderer.getPixelRatio(), engine: audio.engine?.frequency.value, siren: audio.sirenGain?.gain.value, master: audio.master?.gain.value}),
  deliver: () => { const d = LEVELS[currentLevel].destination; taxi.position.set(d.x, 1, d.z); vehicle.speed = 0; levelManager.update(0, 0); },
  capture: () => levelManager.onCaptured(),
  cargoLoss: () => cargoSystem.onCargoLost({remaining: 1}),
};`;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.md': 'text/plain', '.txt': 'text/plain' };
const requests = new Set();
const missing = [];
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const prefix = '/department/sharp-sharp/';
  if (!url.pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
  const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
  const segments = relative.split('/');
  let filename = output;
  for (const segment of segments) {
    if (!segment || segment === '..' || !fs.existsSync(filename) || !fs.statSync(filename).isDirectory() || !fs.readdirSync(filename).includes(segment)) {
      missing.push(url.pathname); response.writeHead(404).end(); return;
    }
    filename = path.join(filename, segment);
  }
  if (!fs.statSync(filename).isFile()) { response.writeHead(404).end(); return; }
  requests.add(relative);
  let body = fs.readFileSync(filename);
  if (/^assets\/index-.*\.js$/.test(relative)) body = Buffer.concat([body, Buffer.from(hooks)]);
  response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream' });
  response.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'member5-edge-'));
const browser = spawn(edgePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--window-size=1280,800', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let debugPort;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { debugPort = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); break; } catch {}
    await sleep(100);
  }
  if (!debugPort) throw Error('Edge did not start its debug endpoint.');
  const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => { socket.onopen = resolve; });
  const pending = new Map();
  const errors = [];
  let id = 0;
  socket.onmessage = event => {
    const result = JSON.parse(event.data);
    if (result.id) { pending.get(result.id)?.(result); pending.delete(result.id); }
    if (result.method === 'Runtime.exceptionThrown') errors.push(result.params.exceptionDetails.text);
    if (result.method === 'Runtime.consoleAPICalled' && result.params.type === 'error') errors.push(result.params.args.map(arg => arg.value ?? arg.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timeout = setTimeout(() => { pending.delete(requestId); reject(Error(`CDP timeout: ${method} ${params.expression ?? ''}; runtime errors: ${errors.join('; ')}`)); }, 45000);
    pending.set(requestId, result => { clearTimeout(timeout); result.error ? reject(Error(JSON.stringify(result.error))) : resolve(result.result); });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const run = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 200; attempt++) { if (await run(expression)) return; await sleep(100); }
    throw Error(`Timed out: ${expression}`);
  };
  const click = async action => {
    const point = await run(`(() => { const r = document.querySelector('[data-action="${action}"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const state = () => run('window.__qa.state()');
  const key = async (code, keyName) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: keyName });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: keyName });
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/department/sharp-sharp/` });
  console.log('Browser launched; waiting for assets and initial rendering.');
  await waitFor('!!window.__qa && !!document.querySelector("[data-action=startGame]") && !document.querySelector(".ss-loading")');
  assert.equal(await run('document.querySelectorAll(".ss-screen").length'), 1);
  console.log('Loading/menu ready; checking preferences and support screens.');
  await click('settings');
  await run(`const volume = document.querySelector('[name=volume]'); volume.value = '25'; volume.dispatchEvent(new Event('input', {bubbles:true})); const quality = document.querySelector('[name=quality]'); quality.value = 'low'; quality.dispatchEvent(new Event('input', {bubbles:true}));`);
  assert.equal((await state()).volume, 0.25);
  assert.equal((await state()).quality, 0.75);
  await send('Page.reload');
  await waitFor('!!window.__qa && !!document.querySelector("[data-action=startGame]") && !document.querySelector(".ss-loading")');
  assert.equal((await state()).volume, 0.25);
  assert.equal((await state()).quality, 0.75);
  await click('settings');
  await run(`const mute = document.querySelector('[name=muted]'); mute.checked = true; mute.dispatchEvent(new Event('input', {bubbles:true}));`);
  assert.equal((await state()).volume, 0);
  await send('Page.reload');
  await waitFor('!!window.__qa && !!document.querySelector("[data-action=startGame]") && !document.querySelector(".ss-loading")');
  assert.equal((await state()).volume, 0);
  await click('settings');
  assert.equal(await run('document.querySelector("[name=muted]").checked'), true);
  await run(`const mute = document.querySelector('[name=muted]'); mute.checked = false; mute.dispatchEvent(new Event('input', {bubbles:true}));`);
  assert.equal((await state()).volume, 0.25);
  await click('closeSettings');
  await click('credits');
  assert.ok(await run('document.querySelector(".ss-panel").textContent.includes("MIT")'));
  await click('backToMenu');
  assert.ok(await run('document.querySelector(".ss-panel").textContent.includes("Mouse drag")'));
  await click('startGame');
  console.log('Checking drive, pause, retry and failures.');
  assert.equal((await state()).phase, 'intro');
  await click('beginLevel');
  await waitFor('window.__qa.state().audioState === "running"');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w' });
  await waitFor('window.__qa.state().speed > 0');
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w' });
  assert.ok((await state()).speed > 0);
  assert.ok((await state()).engine > 45);
  await key('Escape', 'Escape');
  const paused = await state();
  await sleep(250);
  assert.equal((await state()).time, paused.time);
  assert.equal((await state()).active, false);
  await click('settings');
  await click('closeSettings');
  assert.equal((await state()).phase, 'paused');
  await click('resume');
  await run('window.dispatchEvent(new Event("blur"))');
  assert.equal((await state()).phase, 'paused');
  await click('retryLevel');
  assert.equal((await state()).time, 0);
  await click('beginLevel');
  await run('window.__qa.capture(); window.__qa.capture()');
  assert.equal((await state()).phase, 'failed');
  await click('retryLevel');
  await click('beginLevel');
  await run('window.__qa.cargoLoss()');
  assert.equal((await state()).phase, 'failed');
  assert.equal((await state()).voices, 0);
  await click('retryLevel');
  await click('beginLevel');
  for (let level = 1; level <= 3; level++) {
    console.log(`Checking delivery transition for Level ${level}.`);
    assert.equal((await state()).currentLevel, level);
    await run('window.__qa.deliver()');
    assert.equal((await state()).phase, level === 3 ? 'finished' : 'complete');
    if (level === 1) {
      await click('retryLevel');
      await click('beginLevel');
      await run('window.__qa.deliver()');
    }
    if (level < 3) { await click('nextLevel'); await click('beginLevel'); }
  }
  const finished = await state();
  assert.equal(finished.results.length, 3);
  assert.equal(finished.voices, 0);
  await click('playAgain');
  assert.equal((await state()).currentLevel, 1);
  assert.equal((await state()).results.length, 0);
  await click('beginLevel');
  await key('KeyP', 'p');
  await click('mainMenu');
  assert.equal((await state()).phase, 'menu');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('settings');
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifacts, 'settings-mobile.png'), Buffer.from(screenshot.data, 'base64'));
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  const report = { checks: 'loading, nested case-sensitive hosting, settings persistence, credits, controls, drive, pause freeze, resume, blur pause, restart, capture/cargo failures, scripted real delivery triggers 1-2-3, replay, victory, new game', requests: [...requests], finished, errors, missing, limitation: 'Headless Edge with test-only inspection hooks. Deliveries use scripted relocation, not manual route playthrough. Audible quality and Chrome/Ubuntu require manual testing.' };
  fs.writeFileSync(path.join(artifacts, 'smoke-report.json'), JSON.stringify(report, null, 2));
  console.log(`Audio/settings browser smoke passed: ${requests.size} resources; all 3 scripted delivery transitions.`);
} finally {
  socket?.close();
  browser.kill();
  server.close();
  // Edge can hold profile handles briefly; leave temporary profile cleanup to the OS.
}
