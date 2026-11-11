import { attachDragHaptics, attachTapHaptics, canVibrate, tick, usesSwitchHaptics } from '../src/haptics.js';

const $ = (selector) => document.querySelector(selector);
const STEP = 28; // px per step on the drag pads
const LENGTHS = [4, 6, 8, 10, 12, 15, 18, 22, 28, 35];
const started = performance.now();
const logEl = $('#log');
const lastEl = $('#last');
let pulseMs = 18;

function log(text) {
  const item = document.createElement('li');
  item.textContent = `${((performance.now() - started) / 1000).toFixed(1)}s  ${text}`;
  logEl.append(item);
  logEl.scrollTop = logEl.scrollHeight;
  lastEl.textContent = `最近 (last): ${text}`;
  renderEnv();
}

function makeSwitch() {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  return input;
}

// Environment.
const coarse = globalThis.matchMedia?.('(any-pointer: coarse)').matches ?? false;
const switchProp = typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype;
function envRows() {
  return [
    ['UA', navigator.userAgent],
    ['typeof navigator.vibrate', typeof navigator.vibrate],
    ["'switch' in HTMLInputElement.prototype", String(switchProp)],
    ['(any-pointer: coarse)', String(coarse)],
    ['canVibrate', String(canVibrate)],
    ['usesSwitchHaptics', String(usesSwitchHaptics)],
    ['userActivation.hasBeenActive', String(navigator.userActivation?.hasBeenActive ?? 'n/a')],
  ];
}
function renderEnv() {
  $('#env').replaceChildren(...envRows().flatMap(([key, value]) => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = key;
    dd.textContent = value;
    return [dt, dd];
  }));
}
$('#env-line').textContent = `此浏览器 (this browser)：Vibration API ${canVibrate ? '有 (yes)' : '无 (no)'} · switch 触感方案 (switch technique) ${usesSwitchHaptics ? '适用 (applies)' : '不适用 (n/a)'}`;
renderEnv();

// "Your result" selector on every test row.
const VERDICTS = [['', '未试 (not tried)'], ['ticked', '有震感 (ticked)'], ['silent', '无 (silent)'], ['unsure', '不确定 (unsure)']];
for (const row of document.querySelectorAll('.row[data-row]')) {
  const label = document.createElement('label');
  label.className = 'verdict';
  label.textContent = '你的结果 (your result)';
  const select = document.createElement('select');
  select.dataset.verdict = row.dataset.row;
  for (const [value, text] of VERDICTS) select.append(new Option(text, value));
  select.addEventListener('change', () => log(`结果 (result) ${row.dataset.row}: ${select.value || '—'}`));
  label.append(select);
  row.append(label);
}

// Row A: a visible switch, tapped by the finger.
$('#a-switch').addEventListener('change', (event) => {
  log(`A: change → checked=${event.target.checked} (isTrusted=${event.isTrusted})`);
});

// Row B: a fresh hidden switch in a label, clicked from script, then removed.
$('#b-button').addEventListener('click', () => {
  const label = document.createElement('label');
  label.className = 'offscreen';
  label.setAttribute('aria-hidden', 'true');
  const input = makeSwitch();
  label.append(input);
  document.body.append(label);
  label.click();
  const { checked } = input;
  label.remove();
  log(`B: label.click() → checked=${checked}（已移除 / removed）`);
});

// Row C: a persistent off-screen label + switch, clicked from script.
const cLabel = document.createElement('label');
cLabel.className = 'offscreen';
cLabel.setAttribute('aria-hidden', 'true');
const cInput = makeSwitch();
cLabel.append(cInput);
document.body.append(cLabel);
$('#c-button').addEventListener('click', () => {
  cLabel.click();
  log(`C: label.click() → checked=${cInput.checked}`);
});

// Row D: a hidden switch, input.click().
const dInput = makeSwitch();
dInput.className = 'offscreen';
dInput.setAttribute('aria-hidden', 'true');
document.body.append(dInput);
$('#d-button').addEventListener('click', () => {
  dInput.click();
  log(`D: input.click() → checked=${dInput.checked}`);
});

// Row F: a transparent real switch over a number.
let fCount = 0;
$('#f-switch').addEventListener('change', (event) => {
  fCount += 1;
  $('#f-number').textContent = String(fCount);
  log(`F: change → checked=${event.target.checked} (isTrusted=${event.isTrusted})`);
});

// Row T: attachTapHaptics on a button; tick() covers Android.
const tButton = $('#t-button');
const tap = attachTapHaptics(tButton);
let tCount = 0;
tButton.addEventListener('click', (event) => {
  tCount += 1;
  $('#t-count').textContent = String(tCount);
  const result = tick();
  const via = event.isTrusted ? '' : '，由 switch 转发 (forwarded by the switch)';
  log(`T: click #${tCount} (isTrusted=${event.isTrusted}${via}); tick() → ${result}`);
});
log(`attachTapHaptics → ${tap ? 'switch' : 'null（此浏览器不适用 / not applicable here）'}`);

// Drag pads: a ruler that follows the finger; one step every STEP px.
function mountPad(pad, { name, touchAction, haptics, pulse }) {
  pad.style.touchAction = touchAction;
  const surface = haptics ? haptics.input : pad;
  const posEl = pad.querySelector('.pad-pos');
  const countEl = pad.querySelector('.pad-count');
  let total = 0;
  let drag = null;
  surface.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, step: 0, steps: 0, moved: false, results: {} };
  });
  addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > 6) drag.moved = true;
    pad.style.backgroundPosition = `calc(50% + ${dx}px) 0`;
    const step = Math.round(dx / STEP);
    if (step === drag.step) return;
    drag.step = step;
    drag.steps += 1;
    total += 1;
    pad.dataset.count = String(total);
    posEl.textContent = String(step);
    countEl.textContent = `步数 (steps) ${total}`;
    const result = String(pulse());
    drag.results[result] = (drag.results[result] ?? 0) + 1;
  }, { capture: true, passive: true });
  const finish = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { moved, steps, results } = drag;
    drag = null;
    pad.style.backgroundPosition = '';
    posEl.textContent = '0';
    const returned = Object.entries(results).map(([value, count]) => `${value}×${count}`).join(', ');
    const how = haptics ? 'switch' : 'tick()';
    if (event.type === 'pointercancel') log(`${name}: pointercancel（页面接管了触摸 / the page took the touch）, ${steps} 步 (steps)`);
    else if (!moved) log(`${name}: 轻点 (tap)`);
    else log(`${name}: ${steps} 步 (steps), ${how}${returned ? ` → ${returned}` : ''}`);
  };
  addEventListener('pointerup', finish, { capture: true });
  addEventListener('pointercancel', finish, { capture: true });
}

// The iOS pads. attachDragHaptics comes before the pad's own move listener (see haptics.js).
for (const [id, name, touchAction] of [['#pad-none', 'P1', 'none'], ['#pad-pany', 'P2', 'pan-y']]) {
  const pad = $(id);
  const haptics = attachDragHaptics(pad, { touchAction });
  mountPad(pad, { name, touchAction, haptics, pulse: () => (haptics ? haptics.tick() ?? 'requested' : tick()) });
  log(`${name} attachDragHaptics(${touchAction}) → ${haptics ? 'switch' : 'null（用 tick() / uses tick()）'}`);
}

// Android rows: single pulses and a pattern.
for (const button of document.querySelectorAll('button[data-pattern]')) {
  const parts = button.dataset.pattern.split(',').map(Number);
  const pattern = parts.length === 1 ? parts[0] : parts;
  button.addEventListener('click', () => {
    const result = tick(pattern);
    const call = `vibrate(${JSON.stringify(pattern)})`;
    log(canVibrate ? `${call} → ${result}` : `${call}: navigator.vibrate 不存在 (unavailable) → ${result}`);
  });
}

// Pulse lengths, and a pad that ticks with the chosen one.
const lengthsEl = $('#lengths');
for (const ms of LENGTHS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', 'radio');
  button.dataset.ms = String(ms);
  button.textContent = `${ms} ms`;
  button.addEventListener('click', () => {
    pulseMs = ms;
    for (const other of lengthsEl.children) {
      const on = other === button;
      other.classList.toggle('is-on', on);
      other.setAttribute('aria-checked', String(on));
    }
    const result = tick(ms);
    log(`选中 (selected) ${ms} ms; vibrate(${ms}) → ${canVibrate ? result : `${result}（不可用 / unavailable）`}`);
  });
  const on = ms === pulseMs;
  button.classList.toggle('is-on', on);
  button.setAttribute('aria-checked', String(on));
  lengthsEl.append(button);
}
mountPad($('#pad-pulse'), { name: 'LEN 拖动板 (pad)', touchAction: 'none', haptics: null, pulse: () => `vibrate(${pulseMs}) ${tick(pulseMs)}` });

// Report.
function report() {
  const lines = [
    'web-haptics-field-notes test page',
    `date: ${new Date().toISOString().slice(0, 10)}`,
    'phone model: ',
    'OS version: ',
    'browser / in-app browser: ',
    ...envRows().map(([key, value]) => `${key}: ${value}`),
    '',
    'results:',
    ...[...document.querySelectorAll('select[data-verdict]')].map((select) => `  ${select.dataset.verdict}: ${select.value || 'not tried'}`),
    `selected pulse length: ${pulseMs} ms`,
    '',
    'log:',
    ...[...logEl.children].map((item) => `  ${item.textContent}`),
  ];
  return lines.join('\n');
}

$('#copy').addEventListener('click', async () => {
  const text = report();
  const area = $('#report');
  area.hidden = false;
  area.value = text;
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    area.focus();
    area.select();
  }
  log(copied ? '结果已复制 (report copied)' : '无法自动复制，请手动复制下面的文本 (copy the text below by hand)');
});

$('#clear').addEventListener('click', () => {
  logEl.replaceChildren();
  log('记录已清空 (log cleared)');
});
