// Game logic
const BOARD_SIZE = 15;
const STAR_POINTS = [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];

let board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
let roomData = null;
let myRole = null; // 'black' or 'white'
let moveCount = 0;
let gameOver = false;
let moveSubscription = null;
let roomSubscription = null;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get('room');

  if (!roomCode) {
    window.location.href = 'index.html';
    return;
  }

  myRole = localStorage.getItem('gomoku_player_role');
  renderBoard();
  await loadRoom(roomCode);
});

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;

      // Star points
      if (STAR_POINTS.some(([sx, sy]) => sx === x && sy === y)) {
        cell.classList.add('star-point');
        const dot = document.createElement('div');
        dot.className = 'dot';
        cell.appendChild(dot);
      }

      cell.addEventListener('click', () => handleCellClick(x, y));
      cell.addEventListener('mouseenter', () => showHoverPreview(cell, x, y));
      cell.addEventListener('mouseleave', () => removeHoverPreview(cell));

      boardEl.appendChild(cell);
    }
  }
}

function showHoverPreview(cell, x, y) {
  if (gameOver || board[y][x] || !roomData || roomData.current_turn !== myRole) return;
  if (roomData.status !== 'playing') return;

  const preview = document.createElement('div');
  preview.className = `hover-preview ${myRole}`;
  cell.appendChild(preview);
}

function removeHoverPreview(cell) {
  const preview = cell.querySelector('.hover-preview');
  if (preview) preview.remove();
}

async function loadRoom(code) {
  const { data: room, error } = await db
    .from('rooms')
    .select('*')
    .eq('code', code)
    .single();

  if (error || !room) {
    showToast('Room not found');
    setTimeout(() => window.location.href = 'index.html', 1500);
    return;
  }

  roomData = room;
  updateGameInfo();

  // Load existing moves
  const { data: moves } = await db
    .from('moves')
    .select('*')
    .eq('room_id', room.id)
    .order('move_number', { ascending: true });

  if (moves) {
    moves.forEach(move => {
      board[move.y][move.x] = move.player;
      moveCount = Math.max(moveCount, move.move_number);
      placeStoneVisual(move.x, move.y, move.player, move.move_number === moveCount);
    });
  }

  // Show waiting overlay if needed
  if (room.status === 'waiting') {
    showWaitingOverlay(room.code);
  }

  subscribeToGame(room.id, room.code);
}

function subscribeToGame(roomId, roomCode) {
  // Subscribe to new moves
  moveSubscription = db
    .channel(`moves-${roomId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'moves',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      const move = payload.new;
      if (board[move.y][move.x]) return; // Already placed

      board[move.y][move.x] = move.player;
      moveCount = Math.max(moveCount, move.move_number);

      // Remove last-move highlight from previous
      document.querySelectorAll('.stone.last-move').forEach(el => el.classList.remove('last-move'));
      placeStoneVisual(move.x, move.y, move.player, true);

      // Check win
      if (checkWin(move.x, move.y, move.player)) {
        gameOver = true;
        showWinModal(move.player);
      }
    })
    .subscribe();

  // Subscribe to room changes (guest joining, status changes)
  roomSubscription = db
    .channel(`room-${roomId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'rooms',
      filter: `id=eq.${roomId}`
    }, (payload) => {
      roomData = payload.new;
      updateGameInfo();

      if (roomData.status === 'playing') {
        hideWaitingOverlay();
      }
    })
    .subscribe();
}

async function handleCellClick(x, y) {
  if (gameOver || !roomData || roomData.status !== 'playing') return;
  if (roomData.current_turn !== myRole) {
    showToast("It's not your turn");
    return;
  }
  if (board[y][x]) return; // Already occupied

  // Optimistic update
  board[y][x] = myRole;
  moveCount++;
  document.querySelectorAll('.stone.last-move').forEach(el => el.classList.remove('last-move'));
  placeStoneVisual(x, y, myRole, true);

  const isWin = checkWin(x, y, myRole);

  // Send move to Supabase
  const { error: moveError } = await db
    .from('moves')
    .insert({
      room_id: roomData.id,
      player: myRole,
      x, y,
      move_number: moveCount
    });

  if (moveError) {
    // Rollback
    board[y][x] = null;
    moveCount--;
    removeStoneVisual(x, y);
    showToast('Failed to place stone');
    return;
  }

  // Update room turn
  const nextTurn = myRole === 'black' ? 'white' : 'black';
  const updateData = { current_turn: nextTurn };

  if (isWin) {
    updateData.status = 'finished';
    updateData.winner = myRole;
    gameOver = true;
  } else if (moveCount >= BOARD_SIZE * BOARD_SIZE) {
    updateData.status = 'finished';
    gameOver = true;
  }

  await db
    .from('rooms')
    .update(updateData)
    .eq('id', roomData.id);

  if (isWin) {
    showWinModal(myRole);
  } else if (moveCount >= BOARD_SIZE * BOARD_SIZE) {
    showWinModal(null); // Draw
  }
}

function placeStoneVisual(x, y, player, isLast) {
  const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (!cell) return;

  // Remove hover preview
  const preview = cell.querySelector('.hover-preview');
  if (preview) preview.remove();

  // Remove dot if star point
  const dot = cell.querySelector('.dot');
  if (dot) dot.remove();

  let stone = cell.querySelector('.stone');
  if (!stone) {
    stone = document.createElement('div');
    stone.className = `stone ${player}`;
    cell.appendChild(stone);
  }

  if (isLast) stone.classList.add('last-move');
}

function removeStoneVisual(x, y) {
  const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (!cell) return;
  const stone = cell.querySelector('.stone');
  if (stone) stone.remove();
}

function checkWin(x, y, player) {
  const directions = [[1,0],[0,1],[1,1],[1,-1]];

  for (const [dx, dy] of directions) {
    let count = 1;

    // Forward
    for (let i = 1; i < 5; i++) {
      const nx = x + dx * i;
      const ny = y + dy * i;
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
      if (board[ny][nx] !== player) break;
      count++;
    }

    // Backward
    for (let i = 1; i < 5; i++) {
      const nx = x - dx * i;
      const ny = y - dy * i;
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
      if (board[ny][nx] !== player) break;
      count++;
    }

    if (count >= 5) return true;
  }

  return false;
}

function updateGameInfo() {
  if (!roomData) return;

  const nickname = localStorage.getItem('gomoku_nickname') || 'You';
  const hostName = roomData.host_name || 'Host';
  const guestName = roomData.guest_name || 'Waiting...';

  // Player info
  const blackName = document.getElementById('black-name');
  const whiteName = document.getElementById('white-name');
  const blackInfo = document.getElementById('black-info');
  const whiteInfo = document.getElementById('white-info');
  const turnIndicator = document.getElementById('turn-indicator');

  if (blackName) blackName.textContent = hostName + (myRole === 'black' ? ' (You)' : '');
  if (whiteName) whiteName.textContent = guestName + (myRole === 'white' ? ' (You)' : '');

  if (blackInfo) {
    blackInfo.classList.toggle('active', roomData.current_turn === 'black' && !gameOver);
  }
  if (whiteInfo) {
    whiteInfo.classList.toggle('active', roomData.current_turn === 'white' && !gameOver);
  }

  if (turnIndicator && roomData.status === 'playing' && !gameOver) {
    const isMyTurn = roomData.current_turn === myRole;
    turnIndicator.className = `turn-indicator ${isMyTurn ? 'my-turn' : 'opponent-turn'}`;
    turnIndicator.textContent = isMyTurn ? 'Your Turn!' : "Opponent's Turn";
  }
}

function showWaitingOverlay(code) {
  let overlay = document.getElementById('waiting-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    return;
  }

  overlay = document.createElement('div');
  overlay.id = 'waiting-overlay';
  overlay.className = 'waiting-overlay';
  overlay.innerHTML = `
    <div class="waiting-box">
      <h2>Waiting for opponent...</h2>
      <div class="spinner"></div>
      <p>Share this code with your friend:</p>
      <div class="room-code">${code}</div>
      <button class="copy-btn" onclick="copyCode('${code}')">Copy Code</button>
      <div class="mt-16">
        <button class="btn btn-secondary btn-small" onclick="leaveRoom()">Leave Room</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideWaitingOverlay() {
  const overlay = document.getElementById('waiting-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function showWinModal(winner) {
  const nickname = localStorage.getItem('gomoku_nickname') || 'You';
  let title, result;

  if (!winner) {
    title = 'Draw!';
    result = 'The board is full.';
  } else if (winner === myRole) {
    title = 'You Win!';
    result = 'Congratulations!';
  } else {
    title = 'You Lose';
    result = 'Better luck next time!';
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>${title}</h2>
      <p class="result">${result}</p>
      <button class="btn btn-primary" onclick="window.location.href='index.html'">Back to Lobby</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast('Code copied!');
  }).catch(() => {
    showToast('Copy failed');
  });
}

async function leaveRoom() {
  if (roomData) {
    await db.from('rooms').delete().eq('id', roomData.id);
  }
  window.location.href = 'index.html';
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

// Cleanup on page leave
window.addEventListener('beforeunload', () => {
  if (moveSubscription) moveSubscription.unsubscribe();
  if (roomSubscription) roomSubscription.unsubscribe();
});
