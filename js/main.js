/* ===== Block Puzzle — логика ===== */
'use strict';

const SIZE = 8;
const PALETTE = ['#00f0ff', '#4dff9e', '#ffe14d', '#e64dff', '#ffb100', '#ff4d6a', '#7d9bff'];

/* Формы: [rows] — 1 = клетка. В духе классики (без поворотов). */
const SHAPES = [
  [[1]],
  [[1, 1]], [[1], [1]],
  [[1, 1, 1]], [[1], [1], [1]],
  [[1, 1, 1, 1]], [[1], [1], [1], [1]],
  [[1, 1, 1, 1, 1]], [[1], [1], [1], [1], [1]],
  [[1, 1], [1, 1]],
  [[1, 1, 1], [1, 1, 1]],
  [[1, 0], [1, 1]], [[1, 1], [1, 0]], [[0, 1], [1, 1]], [[1, 1], [0, 1]],
  [[1, 1], [1, 0], [0, 1]], [[1, 1], [0, 1], [1, 0]], [[0, 1], [1, 1], [1, 0]], [[1, 0], [1, 1], [0, 1]],
  [[1, 1, 0], [0, 1, 1]], [[0, 1, 1], [1, 1, 0]], [[1, 0, 0], [1, 1, 1]], [[1, 1, 1], [0, 0, 1]],
  [[1, 1, 1], [1, 0, 0]], [[0, 1, 1], [1, 1, 1]], [[1, 1, 1], [0, 1, 1]], [[0, 1, 0], [1, 1, 1]],
  [[1, 1, 0], [1, 0, 1], [0, 1, 1]],
];

const $ = (s) => document.querySelector(s);
const boardEl = $('#board');
const boardWrap = $('#boardWrap');
const ghostEl = $('#ghost');
const trayEl = $('#tray');

let grid = [];          // SIZE x SIZE: null | {c: colorIndex}
let pieces = [];        // 3 шт: {shape, ci}
let lastColors = new Map(); // индекс клетки -> цвет последнего блока (для анимации очистки)
let busy = false;       // пока идут анимации очистки
let playing = false;
let drag = null;        // {slot, r, c, dx, dy}

/* ===== Инициализация ===== */
function freshGrid() {
  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}
function randomPiece() {
  const shape = SHAPES[(Math.random() * SHAPES.length) | 0];
  const ci = (Math.random() * PALETTE.length) | 0;
  return { shape, ci };
}
function freshPieces() {
  pieces = [randomPiece(), randomPiece(), randomPiece()];
}

function canPlaceAt(shape, r, c) {
  for (let i = 0; i < shape.length; i++) {
    const row = shape[i];
    for (let j = 0; j < row.length; j++) {
      if (!row[j]) continue;
      const rr = r + i, cc = c + j;
      if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE) return false;
      if (grid[rr][cc]) return false;
    }
  }
  return true;
}
function canPlaceAny(shape) {
  for (let r = 0; r <= SIZE - shape.length; r++)
    for (let c = 0; c <= SIZE - shape[0].length; c++)
      if (canPlaceAt(shape, r, c)) return true;
  return false;
}

/* ===== Рендер ===== */
function buildBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.r = r;
      d.dataset.c = c;
      boardEl.appendChild(d);
    }
}
function renderBoard() {
  const cells = boardEl.children;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const el = cells[r * SIZE + c];
      const v = grid[r][c];
      el.classList.toggle('filled', !!v);
      el.style.setProperty('--pc', v ? PALETTE[v.c] : '');
    }
}
function renderTray(spawnIdx) {
  for (let i = 0; i < 3; i++) {
    const slot = trayEl.children[i];
    const mini = slot.querySelector('.mini');
    const p = pieces[i];
    if (!p) { mini.innerHTML = ''; slot.classList.add('unusable'); continue; }
    slot.classList.remove('unusable');
    mini.className = 'mini' + (i === spawnIdx ? ' spawn' : '');
    const gap = 3;
    const sr2 = slot.getBoundingClientRect();
    const maxSide = Math.max(p.shape.length, p.shape[0].length);
    const s = Math.max(10, Math.floor((Math.min(sr2.width, sr2.height) * 0.62 - gap * (maxSide - 1)) / maxSide));
    mini.style.gridTemplateColumns = `repeat(${p.shape[0].length}, ${s}px)`;
    mini.style.gridTemplateRows = `repeat(${p.shape.length}, ${s}px)`;
    mini.style.gap = gap + 'px';
    mini.innerHTML = '';
    for (const row of p.shape)
      for (const v of row) {
        const i2 = document.createElement('i');
        if (v) i2.style.setProperty('--pc', PALETTE[p.ci]);
        else i2.className = 'off';
        mini.appendChild(i2);
      }
  }
  updateUsability();
}
function updateUsability() {
  for (let i = 0; i < 3; i++) {
    const slot = trayEl.children[i];
    const p = pieces[i];
    slot.classList.toggle('unusable', !p || !canPlaceAny(p.shape));
  }
}

/* Подсветка превью на доске */
function setPreview(shape, r, c, valid) {
  boardEl.querySelectorAll('.preview,.bad').forEach((e) => e.classList.remove('preview', 'bad'));
  if (!valid) return;
  for (let i = 0; i < shape.length; i++)
    for (let j = 0; j < shape[i].length; j++) {
      if (!shape[i][j]) continue;
      boardEl.children[(r + i) * SIZE + (c + j)].classList.add('preview');
    }
}

/* ===== Призрак ===== */
function cellMetrics() {
  const first = boardEl.children[0].getBoundingClientRect();
  const second = boardEl.children[1].getBoundingClientRect();
  const cs = first.width;
  const step = second.left - first.left;
  return { cs, step, originX: first.left, originY: first.top };
}
function buildGhost(shape, ci) {
  const { cs, step } = cellMetrics();
  ghostEl.style.gridTemplateColumns = `repeat(${shape[0].length}, ${cs}px)`;
  ghostEl.style.gridTemplateRows = `repeat(${shape.length}, ${cs}px)`;
  ghostEl.innerHTML = '';
  for (const row of shape)
    for (const v of row) {
      const i = document.createElement('i');
      i.className = v ? 'on' : 'off';
      if (v) i.style.setProperty('--pc', PALETTE[ci]);
      ghostEl.appendChild(i);
    }
}
function ghostTarget() {
  const { cs, step, originX, originY } = cellMetrics();
  if (!drag) return null;
  const c = Math.round((drag.x - originX) / step);
  const r = Math.round((drag.y - originY) / step);
  return { r, c };
}
function moveGhostTo(px, py) {
  const { cs, step } = cellMetrics();
  const p = pieces[drag.slot];
  const w = p.shape[0].length * step - (step - cs);
  const h = p.shape.length * step - (step - cs);
  drag.x = px - w / 2;
  drag.y = py - h / 2 - drag.lift;
  ghostEl.style.transform = `translate(${drag.x}px, ${drag.y}px)`;
  const t = ghostTarget();
  const valid = t && canPlaceAt(p.shape, t.r, t.c);
  if (drag.hover && valid) setPreview(p.shape, t.r, t.c, true);
  else if (drag.hover) setPreview(p.shape, t.r, t.c, false);
  if (!drag.hover && valid) setPreview(p.shape, t.r, t.c, true);
  drag.hover = valid ? t : null;
}

/* ===== Установка ===== */
function placePiece(slot, r, c) {
  const p = pieces[slot];
  for (let i = 0; i < p.shape.length; i++)
    for (let j = 0; j < p.shape[i].length; j++)
      if (p.shape[i][j]) {
        grid[r + i][c + j] = { c: p.ci };
        lastColors.set((r + i) * SIZE + (c + j), PALETTE[p.ci]);
      }
  pieces[slot] = randomPiece();
  renderBoard();
  renderTray(slot);
  clearLines();
}
function clearLines() {
  const rows = [], cols = [];
  for (let r = 0; r < SIZE; r++) if (grid[r].every(Boolean)) rows.push(r);
  for (let c = 0; c < SIZE; c++) if (grid.every((row) => row[c])) cols.push(c);
  if (!rows.length && !cols.length) { endTurn(); return; }
  busy = true;
  boardWrap.classList.remove('pop');
  void boardWrap.offsetWidth;
  boardWrap.classList.add('pop');
  const cells = boardEl.children;
  const zapped = new Set();
  rows.forEach((r) => { for (let c = 0; c < SIZE; c++) zapped.add(r * SIZE + c); });
  cols.forEach((c) => { for (let r = 0; r < SIZE; r++) zapped.add(r * SIZE + c); });
  // пустые клетки — СРАЗУ; цветные блоки остаются оверлеем (.zap), гаснущим поверх
  zapped.forEach((i) => { grid[(i / SIZE) | 0][i % SIZE] = null; });
  renderBoard();
  zapped.forEach((i) => {
    const el = cells[i];
    const color = lastColors.get(i) || PALETTE[0];
    el.style.setProperty('--pc', color);
    el.classList.add('zap');
  });
  setTimeout(() => {
    zapped.forEach((i) => {
      cells[i].classList.remove('zap');
      cells[i].style.removeProperty('--pc');
    });
    busy = false;
    endTurn();
  }, 320);
}
function endTurn() {
  updateUsability();
  if (playing && !pieces.some((p) => p && canPlaceAny(p.shape))) {
    playing = false;
    setTimeout(() => $('#overOverlay').classList.remove('hidden'), 420);
  }
}

/* ===== Drag & drop (pointer events) ===== */
function startDrag(e, slotIdx) {
  if (busy || !playing) return;
  const p = pieces[slotIdx];
  if (!p || !canPlaceAny(p.shape)) return;
  e.preventDefault();
  drag = { slot: slotIdx, x: 0, y: 0, hover: null, lift: e.pointerType === 'mouse' ? 14 : 96 };
  buildGhost(p.shape, p.ci);
  ghostEl.classList.add('on');
  trayEl.children[slotIdx].classList.add('dragging');
  moveGhostTo(e.clientX, e.clientY);
  window.addEventListener('pointermove', onDragMove, { passive: false });
  window.addEventListener('pointerup', onDragEnd, { once: true });
  window.addEventListener('pointercancel', onDragEnd, { once: true });
}
function onDragMove(e) {
  if (!drag) return;
  e.preventDefault();
  moveGhostTo(e.clientX, e.clientY);
}
function onDragEnd(e) {
  window.removeEventListener('pointermove', onDragMove);
  ghostEl.classList.remove('on');
  ghostEl.innerHTML = '';
  if (drag) {
    trayEl.children[drag.slot].classList.remove('dragging');
    if (drag.hover) {
      placePiece(drag.slot, drag.hover.r, drag.hover.c);
    } else {
      boardWrap.classList.remove('shake');
      void boardWrap.offsetWidth;
      boardWrap.classList.add('shake');
    }
  }
  setPreview([], 0, 0, false);
  drag = null;
}
trayEl.addEventListener('pointerdown', (e) => {
  const slot = e.target.closest('.tray-slot');
  if (!slot) return;
  startDrag(e, +slot.dataset.idx);
});

/* ===== Управление ===== */
function newGame() {
  freshGrid();
  freshPieces();
  buildBoard();
  renderBoard();
  renderTray(-1);
  busy = false;
  playing = true;
  $('#overOverlay').classList.add('hidden');
  $('#startOverlay').classList.add('hidden');
}

$('#startBtn').addEventListener('click', newGame);
$('#againBtn').addEventListener('click', newGame);

/* Новая игра с подтверждением вторым тапом */
let newArm = null;
$('#newBtn').addEventListener('click', () => {
  if (!playing) return;
  if (newArm) {
    clearTimeout(newArm);
    newArm = null;
    newGame();
  } else {
    const btn = $('#newBtn');
    btn.classList.add('armed');
    newArm = setTimeout(() => { btn.classList.remove('armed'); newArm = null; }, 2000);
  }
});

/* Тема */
const themeBtn = $('#themeBtn');
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === 'light' ? '🌙' : '☀️';
  $('#metaTheme').content = t === 'light' ? '#e8f1f8' : '#040a16';
  try { localStorage.setItem('bp-theme', t); } catch (_) {}
}
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(cur);
});
applyTheme((() => { try { return localStorage.getItem('bp-theme') || 'dark'; } catch (_) { return 'dark'; } })());

/* ===== Установка PWA (паттерн 3inarow) ===== */
let installEvt = null;
let standalone = matchMedia('(display-mode: standalone)').matches ||
  (navigator.standalone !== undefined && navigator.standalone);
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
});
function showInstallTip() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $('#installTipText').textContent = isIOS
    ? 'Нажмите «Поделиться» в Safari, затем «На экран Домой».'
    : 'Откройте меню браузера (⋮) → «Установить приложение» / «Добавить на главный экран».';
  $('#installTip').classList.remove('hidden');
}
function updateInstallBtn() {
  if (standalone || (matchMedia('(display-mode: standalone)').matches)) {
    $('#installBtn').style.display = 'none';
  }
}
$('#installBtn').addEventListener('click', () => {
  if (installEvt) {
    installEvt.prompt();
    installEvt.userChoice.then(() => { installEvt = null; });
  } else {
    showInstallTip();
  }
});
$('#installTipClose').addEventListener('click', () => $('#installTip').classList.add('hidden'));
updateInstallBtn();

/* ===== Старт ===== */
freshGrid();
freshPieces();
buildBoard();
renderBoard();
renderTray(-1);

/* Service worker (офлайн) */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    // если обновлённый SW получил контроль — перезагрузить страницу один раз
    // (sessionStorage не сбрасывается на reload — цикл исключён)
    let didRefresh = false;
    try { didRefresh = sessionStorage.getItem('bp-sw-refresh') === '1'; } catch (_) {}
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (didRefresh) return;
      try { sessionStorage.setItem('bp-sw-refresh', '1'); } catch (_) {}
      location.reload();
    });
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // при наличии новой версии — обновляемся немедленно
      reg.update().catch(() => {});
    }).catch(() => {});
  });
}
