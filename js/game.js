// Game logic for MOKU.IO - Online mode
let board = createEmptyBoard();
let roomData = null;
let myRole = null;
let moveCount = 0;
let gameOver = false;
let moveSubscription = null;
let roomSubscription = null;
let tauntSubscription = null;
// isLocalMode is defined in config.js (single source of truth)

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

document.addEventListener('DOMContentLoaded', async () => {
  I18n.init();

  const params = new URLSearchParams(window.location.search);

  // Check if local mode - redirect to local game page
  if (params.get('mode') === 'local') {
    // Load local game script dynamically
    const script = document.createElement('script');
    script.src = 'js/local-game.js';
    document.body.appendChild(script);
    // isLocalMode already true via config.js

    // Setup local mode UI
    const gameInfo = document.querySelector('.game-info');
    if (gameInfo) {
      const rulesBadge = document.getElementById('rules-badge');
      const rules = params.get('rules') || 'freestyle';
      if (rulesBadge) {
        rulesBadge.textContent = rules === 'renju' ? I18n.t('renju_pro') : I18n.t('freestyle');
        rulesBadge.className = `rules-badge ${rules}`;
      }

      // Update player names for local mode
      const blackName = document.getElementById('black-name');
      const whiteName = document.getElementById('white-name');
      if (blackName) blackName.textContent = I18n.t('black');
      if (whiteName) whiteName.textContent = I18n.t('white');

      // Add restart button
      const leaveBtn = gameInfo.querySelector('.btn-secondary');
      if (leaveBtn) {
        const restartBtn = document.createElement('button');
        restartBtn.className = 'btn btn-primary btn-small mt-8';
        restartBtn.style.width = '100%';
        restartBtn.textContent = I18n.t('restart');
        restartBtn.id = 'restart-btn';
        restartBtn.onclick = () => { if (window.restartLocalGame) window.restartLocalGame(); };
        leaveBtn.parentNode.insertBefore(restartBtn, leaveBtn);
      }

      // Hide taunt panel in local mode
      const tauntPanel = document.getElementById('taunt-panel');
      if (tauntPanel) tauntPanel.remove();

      // Hide bet display
      const betDisplay = document.getElementById('bet-display');
      if (betDisplay) betDisplay.remove();
    }
    return;
  }

  // Online mode
  const roomCode = params.get('room');
  if (!roomCode) {
    window.location.href = 'index.html';
    return;
  }

  myRole = localStorage.getItem('gomoku_player_role');
  const boardEl = document.getElementById('board');
  renderBoard(boardEl, handleCellClick, onHoverEnter, onHoverLeave);
  await loadRoom(roomCode);
});

function onHoverEnter(cell, x, y) {
  if (gameOver || board[y][x] || !roomData || roomData.current_turn !== myRole) return;
  if (roomData.status !== 'playing') return;

  // Renju forbidden check for hover
  if (roomData.rules_type === 'renju' && myRole === 'black') {
    if (Renju.isForbiddenMove(x, y, board)) return;
  }

  const preview = document.createElement('div');
  preview.className = `hover-preview ${myRole}`;
  cell.appendChild(preview);
}

function onHoverLeave(cell) {
  removeHoverPreview(cell);
}

async function loadRoom(code) {
  if (!db) {
    showToast('Database connection failed');
    setTimeout(() => window.location.href = 'index.html', 1500);
    return;
  }

  const { data: room, error } = await db
    .from('rooms')
    .select('*')
    .eq('code', code)
    .single();

  if (error || !room) {
    showToast(I18n.t('room_not_found'));
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

  // Show rules badge
  const rulesBadge = document.getElementById('rules-badge');
  if (rulesBadge) {
    rulesBadge.textContent = room.rules_type === 'renju' ? I18n.t('renju_pro') : I18n.t('freestyle');
    rulesBadge.className = `rules-badge ${room.rules_type || 'freestyle'}`;
  }

  // Show bet if exists
  if (room.bet_text) {
    const betDisplay = document.getElementById('bet-display');
    const betContent = document.getElementById('bet-content');
    if (betDisplay && betContent) {
      betDisplay.classList.remove('hidden');
      betContent.textContent = room.bet_text;
    }
  }

  // Renju markers
  if (room.rules_type === 'renju' && room.current_turn === 'black' && room.status === 'playing') {
    Renju.markForbiddenMoves(board);
  }

  subscribeToGame(room.id, room.code);
  setupTaunts(room.id);
}

function subscribeToGame(roomId, roomCode) {
  moveSubscription = db
    .channel(`moves-${roomId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'moves',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      const move = payload.new;
      if (board[move.y][move.x]) return;

      board[move.y][move.x] = move.player;
      moveCount = Math.max(moveCount, move.move_number);

      document.querySelectorAll('.stone.last-move').forEach(el => el.classList.remove('last-move'));
      placeStoneVisual(move.x, move.y, move.player, true);
      Sound.playStone();

      // Apply impact effects for incoming moves
      applyImpactEffects(move.x, move.y, move.player, board);

      const winCoords = checkWinWithCoords(move.x, move.y, move.player, board);
      if (winCoords) {
        gameOver = true;
        drawWinLine(winCoords);
        showWinModal(move.player);
      }

      // Update renju markers
      if (roomData && roomData.rules_type === 'renju') {
        Renju.clearForbiddenMarkers();
        if (roomData.current_turn === 'black' && !gameOver) {
          Renju.markForbiddenMoves(board);
        }
      }
    })
    .subscribe();

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

      // Check for rematch
      if (roomData.rematch_code && gameOver) {
        showRematchNotification(roomData.rematch_code);
      }

      // Update renju markers on turn change
      if (roomData.rules_type === 'renju' && roomData.status === 'playing' && !gameOver) {
        Renju.clearForbiddenMarkers();
        if (roomData.current_turn === 'black') {
          Renju.markForbiddenMoves(board);
        }
      }
    })
    .subscribe();
}

function setupTaunts(roomId) {
  const nickname = localStorage.getItem('gomoku_nickname') || '';

  // Subscribe to incoming taunts
  try {
    tauntSubscription = Taunt.subscribeTaunts(roomId, nickname, (taunt) => {
      Taunt.play(taunt.taunt_type, taunt.sender, taunt.message);
    });
  } catch (e) {
    console.warn('Taunt subscription failed:', e);
    tauntSubscription = null;
  }
}

async function handleCellClick(x, y) {
  if (isLocalMode) return; // Handled by local-game.js
  if (gameOver || !roomData || roomData.status !== 'playing') return;
  if (roomData.current_turn !== myRole) {
    showToast(I18n.t('not_your_turn'));
    return;
  }
  if (board[y][x]) return;

  // Renju check
  if (roomData.rules_type === 'renju' && myRole === 'black') {
    if (Renju.isForbiddenMove(x, y, board)) {
      showToast(I18n.t('forbidden_move'));
      return;
    }
  }

  // Optimistic update
  board[y][x] = myRole;
  moveCount++;
  document.querySelectorAll('.stone.last-move').forEach(el => el.classList.remove('last-move'));
  placeStoneVisual(x, y, myRole, true);
  Sound.playStone();

  // Apply impact effects based on consecutive chain length
  applyImpactEffects(x, y, myRole, board);

  const winCoords = checkWinWithCoords(x, y, myRole, board);

  const { error: moveError } = await db
    .from('moves')
    .insert({
      room_id: roomData.id,
      player: myRole,
      x, y,
      move_number: moveCount
    });

  if (moveError) {
    board[y][x] = null;
    moveCount--;
    removeStoneVisual(x, y);
    showToast(I18n.t('failed_place'));
    return;
  }

  const nextTurn = myRole === 'black' ? 'white' : 'black';
  const updateData = { current_turn: nextTurn };

  if (winCoords) {
    updateData.status = 'finished';
    updateData.winner = myRole;
    gameOver = true;
  } else if (moveCount >= BOARD_SIZE * BOARD_SIZE) {
    updateData.status = 'finished';
    gameOver = true;
  }

  const { error: roomUpdateError } = await db
    .from('rooms')
    .update(updateData)
    .eq('id', roomData.id);

  if (roomUpdateError) {
    // Move was inserted but room update failed - revert local state
    board[y][x] = null;
    moveCount--;
    gameOver = false;
    removeStoneVisual(x, y);
    showToast(I18n.t('failed_place'));
    return;
  }

  if (winCoords) {
    drawWinLine(winCoords);
    showWinModal(myRole);
  } else if (moveCount >= BOARD_SIZE * BOARD_SIZE) {
    showWinModal(null);
  }

  // Update renju markers
  if (roomData.rules_type === 'renju' && !gameOver) {
    Renju.clearForbiddenMarkers();
    if (nextTurn === 'black') {
      Renju.markForbiddenMoves(board);
    }
  }
}

function updateGameInfo() {
  if (!roomData) return;

  const nickname = localStorage.getItem('gomoku_nickname') || 'You';
  const hostName = roomData.host_name || 'Host';
  const guestName = roomData.guest_name || I18n.t('waiting');

  const blackName = document.getElementById('black-name');
  const whiteName = document.getElementById('white-name');
  const blackInfo = document.getElementById('black-info');
  const whiteInfo = document.getElementById('white-info');
  const turnIndicator = document.getElementById('turn-indicator');

  if (blackName) blackName.textContent = hostName + (myRole === 'black' ? ' ' + I18n.t('you_suffix') : '');
  if (whiteName) whiteName.textContent = guestName + (myRole === 'white' ? ' ' + I18n.t('you_suffix') : '');

  if (blackInfo) blackInfo.classList.toggle('active', roomData.current_turn === 'black' && !gameOver);
  if (whiteInfo) whiteInfo.classList.toggle('active', roomData.current_turn === 'white' && !gameOver);

  if (turnIndicator && roomData.status === 'playing' && !gameOver) {
    const isMyTurn = roomData.current_turn === myRole;
    turnIndicator.className = `turn-indicator ${isMyTurn ? 'my-turn' : 'opponent-turn'}`;
    turnIndicator.textContent = isMyTurn ? I18n.t('your_turn') : I18n.t('opponent_turn');
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
      <h2 data-i18n="waiting_title">${I18n.t('waiting_title')}</h2>
      <div class="spinner"></div>
      <p data-i18n="share_code">${I18n.t('share_code')}</p>
      <div class="room-code">${code}</div>
      <button class="copy-btn" onclick="copyCode('${code}')" data-i18n="copy_code">${I18n.t('copy_code')}</button>
      <div class="mt-16">
        <button class="btn btn-secondary btn-small" onclick="leaveRoom()" data-i18n="leave_room">${I18n.t('leave_room')}</button>
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
  let title, result, modalClass, titleClass, isWinner;

  if (!winner) {
    title = I18n.t('draw');
    result = I18n.t('board_full');
    modalClass = '';
    titleClass = '';
    isWinner = false;
  } else if (winner === myRole) {
    title = I18n.t('victory');
    result = I18n.t('congratulations');
    modalClass = 'victory-modal';
    titleClass = 'victory-text';
    isWinner = true;
    Sound.playWin();
    showConfetti();
  } else {
    title = I18n.t('defeat');
    result = I18n.t('better_luck');
    modalClass = 'defeat-modal';
    titleClass = 'defeat-text';
    isWinner = false;
    Sound.playLose();
  }

  // Build bet display
  let betHtml = '';
  if (roomData && roomData.bet_text && winner) {
    if (winner === myRole) {
      betHtml = `
        <div class="you-owe-display">
          <div class="owe-label">${I18n.t('you_owe')}</div>
          <div class="owe-content">${escapeHtml(roomData.bet_text)}</div>
        </div>`;
    } else {
      betHtml = `
        <div class="you-owe-display">
          <div class="owe-label">${I18n.t('you_owe')}</div>
          <div class="owe-content">${escapeHtml(roomData.bet_text)}</div>
        </div>`;
    }
  }

  // Taunt panel for winner
  let tauntHtml = '';
  if (isWinner) {
    const effects = Taunt.getEffectList();
    const tauntBtns = effects.map(e =>
      `<button class="taunt-btn" onclick="sendTauntFromModal('${e.key}')">${e.name}</button>`
    ).join('');
    tauntHtml = `
      <div class="taunt-panel" style="border:none;padding-top:12px;">
        <h4 style="color:var(--accent);font-family:var(--font-heading);">${I18n.t('taunt_title')}</h4>
        <div class="taunt-grid">${tauntBtns}</div>
      </div>`;
  }

  // Enshrine button for winner
  let enshrineHtml = '';
  if (isWinner) {
    enshrineHtml = `
      <div class="enshrine-section">
        <input type="text" id="enshrine-msg" placeholder="${I18n.t('enshrine_message')}" maxlength="100">
        <button class="btn btn-primary btn-small" onclick="enshrineVictory()" style="width:100%">${I18n.t('enshrine_submit')}</button>
      </div>`;
  }

  // Defeat actions
  let actionHtml = '';
  if (isWinner) {
    actionHtml = `
      <div class="modal-actions">
        <button class="btn btn-primary btn-glow" onclick="requestRematch()">${I18n.t('rematch')}</button>
        <button class="btn btn-secondary" onclick="window.location.href='index.html'">${I18n.t('back_to_lobby')}</button>
      </div>`;
  } else if (winner) {
    actionHtml = `
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="window.location.href='index.html'" id="defeat-accept-btn" disabled>${I18n.t('accept_defeat')}</button>
        <button class="btn btn-danger" onclick="window.location.href='index.html'" id="defeat-rage-btn" disabled>${I18n.t('rage_quit')}</button>
      </div>
      <span class="defeat-countdown" id="defeat-countdown">5...</span>`;
  } else {
    actionHtml = `
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="requestRematch()">${I18n.t('rematch')}</button>
        <button class="btn btn-secondary" onclick="window.location.href='index.html'">${I18n.t('back_to_lobby')}</button>
      </div>`;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${modalClass}">
      <h2 class="${titleClass}">${title}</h2>
      <p class="result">${result}</p>
      ${betHtml}
      ${tauntHtml}
      ${enshrineHtml}
      ${actionHtml}
    </div>
  `;
  document.body.appendChild(overlay);

  // 5-second forced wait countdown for the loser
  if (winner && winner !== myRole) {
    let countdown = 5;
    const countdownEl = document.getElementById('defeat-countdown');
    const acceptBtn = document.getElementById('defeat-accept-btn');
    const rageBtn = document.getElementById('defeat-rage-btn');

    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdownEl) {
        if (countdown > 0) {
          countdownEl.textContent = `${countdown}...`;
        } else {
          countdownEl.remove();
          if (acceptBtn) {
            acceptBtn.disabled = false;
          }
          if (rageBtn) {
            rageBtn.disabled = false;
          }
          clearInterval(countdownInterval);
        }
      } else {
        clearInterval(countdownInterval);
      }
    }, 1000);
  }

  // Also show taunt panel in sidebar for winner
  if (isWinner) {
    const sidePanel = document.getElementById('taunt-panel');
    if (sidePanel) {
      sidePanel.classList.remove('hidden');
      const grid = document.getElementById('taunt-grid');
      if (grid) {
        const effects = Taunt.getEffectList();
        grid.innerHTML = effects.map(e =>
          `<button class="taunt-btn" onclick="sendTaunt('${e.key}')">${e.name}</button>`
        ).join('');
      }

      // Custom taunt
      const sendBtn = document.getElementById('taunt-send-btn');
      if (sendBtn) {
        sendBtn.onclick = () => {
          const input = document.getElementById('taunt-custom-input');
          if (input && input.value.trim()) {
            const effectKey = Taunt.getRandomEffect();
            sendTaunt(effectKey, input.value.trim());
            input.value = '';
          }
        };
      }
    }
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

// Taunt sending
window.sendTaunt = async function(effectKey, customMsg) {
  if (!roomData) return;
  const nickname = localStorage.getItem('gomoku_nickname') || '';
  await Taunt.sendTaunt(roomData.id, nickname, effectKey, customMsg);
  showToast('Taunt sent!');
};

window.sendTauntFromModal = function(effectKey) {
  sendTaunt(effectKey);
};

// Enshrine victory
window.enshrineVictory = async function() {
  if (!roomData) return;
  const nickname = localStorage.getItem('gomoku_nickname') || '';
  const msgInput = document.getElementById('enshrine-msg');
  const message = msgInput ? msgInput.value.trim() : '';

  // Get all moves for replay
  const { data: moves } = await db
    .from('moves')
    .select('x, y, player, move_number')
    .eq('room_id', roomData.id)
    .order('move_number', { ascending: true });

  // Generate token
  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);

  const loserName = myRole === 'black' ? roomData.guest_name : roomData.host_name;

  const { data: entry, error } = await db
    .from('hall_of_fame')
    .insert({
      room_id: roomData.id,
      winner_name: nickname,
      loser_name: loserName || 'Unknown',
      winner_role: myRole,
      move_count: moveCount,
      rules_type: roomData.rules_type || 'freestyle',
      bet_text: roomData.bet_text,
      replay_data: moves || [],
      message: message,
      winner_token: token
    })
    .select()
    .single();

  if (error) {
    showToast('Failed to enshrine');
    return;
  }

  // Store token locally for delete capability
  const storedTokens = JSON.parse(localStorage.getItem('moku_hall_tokens') || '{}');
  storedTokens[entry.id] = token;
  localStorage.setItem('moku_hall_tokens', JSON.stringify(storedTokens));

  showToast(I18n.t('enshrine') + '!');

  // Disable button
  const btn = document.querySelector('.enshrine-section .btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '✓';
  }
};

// Rematch
window.requestRematch = async function() {
  if (!roomData) return;
  const nickname = localStorage.getItem('gomoku_nickname') || '';

  // Create new room with swapped roles
  const newCode = generateCode();
  const newHostRole = myRole === 'black' ? 'white' : 'black';

  const { data, error } = await db
    .from('rooms')
    .insert({
      code: newCode,
      host_name: nickname,
      host_role: newHostRole,
      status: 'waiting',
      rules_type: roomData.rules_type,
      bet_text: roomData.bet_text
    })
    .select()
    .single();

  if (error) {
    showToast('Failed to create rematch');
    return;
  }

  // Save rematch code to old room
  await db
    .from('rooms')
    .update({ rematch_code: newCode })
    .eq('id', roomData.id);

  // Navigate
  localStorage.setItem('gomoku_player_role', newHostRole);
  window.location.href = `game.html?room=${newCode}`;
};

function showRematchNotification(rematchCode) {
  // Only show for the loser / non-initiator
  if (document.getElementById('rematch-notification')) return;

  const notif = document.createElement('div');
  notif.id = 'rematch-notification';
  notif.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:250;';
  notif.innerHTML = `
    <div class="card" style="text-align:center;border-color:var(--accent);box-shadow:var(--glow-cyan);">
      <p style="margin-bottom:12px;font-weight:600;">${I18n.t('rematch_offer')}</p>
      <button class="btn btn-primary btn-glow" onclick="acceptRematch('${rematchCode}')">${I18n.t('rematch_accept')}</button>
    </div>
  `;
  document.body.appendChild(notif);
}

window.acceptRematch = function(code) {
  localStorage.setItem('gomoku_player_role', 'white');
  window.location.href = `game.html?room=${code}`;
};

function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast(I18n.t('code_copied'));
  }).catch(() => {
    showToast(I18n.t('copy_failed'));
  });
}

async function leaveRoom() {
  if (roomData && roomData.id && !isLocalMode && db) {
    await db.from('rooms').delete().eq('id', roomData.id);
  }
  window.location.href = 'index.html';
}

// Cleanup on page leave
window.addEventListener('beforeunload', () => {
  try {
    if (moveSubscription) moveSubscription.unsubscribe();
    if (roomSubscription) roomSubscription.unsubscribe();
    if (tauntSubscription) tauntSubscription.unsubscribe();
  } catch (e) {
    // Ignore cleanup errors on page exit
  }
});
