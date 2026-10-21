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

let winLineCoords = null;

// Neon line over the winning stones (SVG overlay on top of the board)
function drawWinLine(coords) {
  clearWinLine();
  const boardEl = document.getElementById('board');
  if (!boardEl || !coords || coords.length < 5) return;
  winLineCoords = coords;

  const sorted = [...coords].sort((a, b) => a.x - b.x || a.y - b.y);
  const start = sorted[0];
  const end = sorted[sorted.length - 1];

  // clientWidth includes the padding, so take it out before dividing into cells
  const size = boardEl.clientWidth;
  const padding = parseFloat(getComputedStyle(boardEl).paddingLeft) || 0;
  const cell = (size - padding * 2) / BOARD_SIZE;
  const center = i => padding + i * cell + cell / 2;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'win-line-svg';
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
  // userSpaceOnUse: a horizontal or vertical line has a zero-height bounding box,
  // and a filter region based on it would hide the line completely
  svg.innerHTML = `
    <defs>
      <filter id="win-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${size}" height="${size}">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <line x1="${center(start.x)}" y1="${center(start.y)}" x2="${center(end.x)}" y2="${center(end.y)}"
      stroke="#22D3EE" stroke-width="4" stroke-linecap="round"
      filter="url(#win-glow)" opacity="0.9">
      <animate attributeName="stroke-width" values="4;8;4" dur="1.5s" repeatCount="indefinite"/>
    </line>
  `;
  boardEl.parentElement.appendChild(svg);

  coords.forEach(({ x, y }) => {
    const stone = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"] .stone`);
    if (stone) stone.classList.add('winning-stone');
  });
}

function clearWinLine() {
  winLineCoords = null;
  const svg = document.getElementById('win-line-svg');
  if (svg) svg.remove();
}

// The board is sized in vw, so redraw the line when the window changes size
window.addEventListener('resize', () => {
  if (winLineCoords) drawWinLine(winLineCoords);
});

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

// Random 6-character room code without look-alike characters (no I, O, 0, 1)
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

// Returns { count, coords } for the longest consecutive chain including (x, y) for given player
function getMaxConsecutive(x, y, player, boardState) {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  let bestCount = 1;
  let bestCoords = [{ x, y }];

  for (const [dx, dy] of directions) {
    const coords = [{ x, y }];

    // Forward
    for (let i = 1; i < BOARD_SIZE; i++) {
      const nx = x + dx * i;
      const ny = y + dy * i;
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
      if (boardState[ny][nx] !== player) break;
      coords.push({ x: nx, y: ny });
    }

    // Backward
    for (let i = 1; i < BOARD_SIZE; i++) {
      const nx = x - dx * i;
      const ny = y - dy * i;
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
      if (boardState[ny][nx] !== player) break;
      coords.push({ x: nx, y: ny });
    }

    if (coords.length > bestCount) {
      bestCount = coords.length;
      bestCoords = coords;
    }
  }

  return { count: bestCount, coords: bestCoords };
}

// Apply visual + audio impact effects based on consecutive stone count
function applyImpactEffects(x, y, player, boardState) {
  const { count, coords } = getMaxConsecutive(x, y, player, boardState);
  const boardEl = document.getElementById('board');

  // Determine impact level: 1=normal, 2=3-chain, 3=4-chain, 4=5+ (win)
  let level = 1;
  if (count >= 5) level = 4;
  else if (count === 4) level = 3;
  else if (count === 3) level = 2;

  // Play impact sound
  Sound.playImpact(level);

  // Add ripple to placed stone (always)
  const placedStone = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"] .stone`);
  if (placedStone) {
    placedStone.classList.add('impact-ripple');
    setTimeout(() => placedStone.classList.remove('impact-ripple'), 700);
  }

  if (level >= 2) {
    // Add chain-glow to all stones in the chain
    coords.forEach(({ x: cx, y: cy }) => {
      const stone = document.querySelector(`.cell[data-x="${cx}"][data-y="${cy}"] .stone`);
      if (stone) {
        stone.classList.add('chain-glow');
        setTimeout(() => stone.classList.remove('chain-glow'), 1800);
      }
    });

    // Add board impact class
    if (boardEl) {
      const impactClass = `impact-${level}`;
      boardEl.classList.remove('impact-2', 'impact-3', 'impact-4');
      // Force reflow to restart animation
      void boardEl.offsetWidth;
      boardEl.classList.add(impactClass);
      setTimeout(() => boardEl.classList.remove(impactClass), level === 4 ? 800 : 600);
    }
  }

  // Level 4 (win): massive effects
  if (level === 4) {
    // Screen flash
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 500);

    // Shockwave ring from winning stone
    const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    if (cell) {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const ring = document.createElement('div');
          ring.className = 'shockwave-ring';
          ring.style.left = '50%';
          ring.style.top = '50%';
          cell.appendChild(ring);
          setTimeout(() => ring.remove(), 900);
        }, i * 200);
      }
    }

    // Winning neon pulse on all 5 stones
    coords.forEach(({ x: cx, y: cy }) => {
      const stone = document.querySelector(`.cell[data-x="${cx}"][data-y="${cy}"] .stone`);
      if (stone) {
        stone.classList.add('winning-impact-stone');
        setTimeout(() => stone.classList.remove('winning-impact-stone'), 4000);
      }
    });
  }
}

function showConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  const colors = ['#22D3EE', '#10B981', '#F59E0B', '#A855F7', '#EF4444', '#EC4899'];

  for (let i = 0; i < 60; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDuration = (2 + Math.random() * 3) + 's';
    confetti.style.animationDelay = Math.random() * 2 + 's';
    confetti.style.width = (6 + Math.random() * 8) + 'px';
    confetti.style.height = (6 + Math.random() * 8) + 'px';
    confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(confetti);
  }

  document.body.appendChild(container);
  setTimeout(() => container.remove(), 5000);
}
