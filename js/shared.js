// Board rendering and helpers shared by the game pages
const BOARD_SIZE = Rules.SIZE;
const STAR_POINTS = [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];

function renderBoard(boardEl, onCellClick, onMouseEnter, onMouseLeave) {
  boardEl.innerHTML = '';
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;

      if (STAR_POINTS.some(([sx, sy]) => sx === x && sy === y)) {
        cell.classList.add('star-point');
        const dot = document.createElement('div');
        dot.className = 'dot';
        cell.appendChild(dot);
      }

      cell.addEventListener('click', () => onCellClick(x, y));
      if (onMouseEnter) cell.addEventListener('mouseenter', () => onMouseEnter(cell, x, y));
      if (onMouseLeave) cell.addEventListener('mouseleave', () => onMouseLeave(cell));

      boardEl.appendChild(cell);
    }
  }
}

function placeStoneVisual(x, y, player, isLast) {
  const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (!cell) return;

  const preview = cell.querySelector('.hover-preview');
  if (preview) preview.remove();

  const dot = cell.querySelector('.dot');
  if (dot) dot.remove();

  // Remove forbidden marker if any
  const forbidden = cell.querySelector('.forbidden-marker');
  if (forbidden) forbidden.remove();

  let stone = cell.querySelector('.stone');
  if (!stone) {
    stone = document.createElement('div');
    stone.className = `stone ${player}`;
    cell.appendChild(stone);

    // Ripple animation
    stone.style.animation = 'stone-drop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
  }

  if (isLast) stone.classList.add('last-move');
}

function removeStoneVisual(x, y) {
  const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (!cell) return;
  const stone = cell.querySelector('.stone');
  if (stone) stone.remove();
}

// Draw neon laser win line via SVG overlay
function drawWinLine(coords) {
  if (!coords || coords.length < 5) return;

  // Sort coords to find endpoints
  const sorted = [...coords].sort((a, b) => a.x - b.x || a.y - b.y);
  const start = sorted[0];
  const end = sorted[sorted.length - 1];

  const boardEl = document.getElementById('board');
  if (!boardEl) return;

  const rect = boardEl.getBoundingClientRect();
  const cellSize = rect.width / BOARD_SIZE;
  const padding = parseFloat(getComputedStyle(boardEl).padding) || 16;

  // Create SVG overlay
  let svg = document.getElementById('win-line-svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'win-line-svg';
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
    boardEl.parentElement.style.position = 'relative';
    boardEl.parentElement.appendChild(svg);
  }

  const x1 = padding + start.x * cellSize + cellSize / 2;
  const y1 = padding + start.y * cellSize + cellSize / 2;
  const x2 = padding + end.x * cellSize + cellSize / 2;
  const y2 = padding + end.y * cellSize + cellSize / 2;

  // Scale to SVG viewBox
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);

  svg.innerHTML = `
    <defs>
      <filter id="glow">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="#22D3EE" stroke-width="4" stroke-linecap="round"
      filter="url(#glow)" opacity="0.9">
      <animate attributeName="stroke-width" values="4;8;4" dur="1.5s" repeatCount="indefinite"/>
    </line>
  `;

  // Also highlight winning stones
  coords.forEach(({x, y}) => {
    const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"] .stone`);
    if (cell) cell.classList.add('winning-stone');
  });
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showHoverPreview(cell, x, y, board, currentPlayer, canPlay) {
  if (!canPlay || board[y][x]) return;
  const preview = document.createElement('div');
  preview.className = `hover-preview ${currentPlayer}`;
  cell.appendChild(preview);
}

function removeHoverPreview(cell) {
  const preview = cell.querySelector('.hover-preview');
  if (preview) preview.remove();
}

function createEmptyBoard() {
  return Rules.createBoard();
}

const FORBIDDEN_KEYS = {
  'double-three': 'forbidden_33',
  'double-four': 'forbidden_44',
  overline: 'forbidden_overline',
};

function forbiddenMessage(reason) {
  return I18n.t(FORBIDDEN_KEYS[reason] || 'forbidden_move');
}

// Renju: mark the points Black can't play. Call when it is Black's turn.
function showForbiddenMarkers(board) {
  clearForbiddenMarkers();
  for (const { x, y, reason } of Rules.forbiddenPoints(board)) {
    const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    if (!cell || cell.querySelector('.stone')) continue;
    const marker = document.createElement('div');
    marker.className = 'forbidden-marker';
    marker.textContent = '✕';
    marker.title = forbiddenMessage(reason);
    cell.appendChild(marker);
  }
}

function clearForbiddenMarkers() {
  document.querySelectorAll('.forbidden-marker').forEach(el => el.remove());
}

// Generate a random 6-char room code (shared between lobby and game)
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
