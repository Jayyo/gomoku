// Game page: online rooms (local play lives in local-game.js)
let board = createEmptyBoard();
let roomData = null;
let myRole = null;
let moveCount = 0;
let gameOver = false;
let moveSubscription = null;
let roomSubscription = null;
let tauntSubscription = null;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);

  const mode = params.get('mode');
  if (mode === 'local' || mode === 'ai') {
    LocalGame.start(params);
    return;
  }

  // Online mode
  const roomCode = params.get('room');
  if (!roomCode) {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('leave-btn').addEventListener('click', leaveRoom);
  myRole = localStorage.getItem('omok_player_role');
  const boardEl = document.getElementById('board');
  renderBoard(boardEl, handleCellClick, onHoverEnter, onHoverLeave);
  await loadRoom(roomCode);
});

function onHoverEnter(cell, x, y) {
  if (gameOver || board[y][x] || !roomData || roomData.current_turn !== myRole) return;
  if (roomData.status !== 'playing') return;

  // Renju forbidden check for hover
  if (roomData.rules_type === 'renju' && myRole === 'black') {
    if (Rules.forbiddenReason(board, x, y)) return;
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
    rulesBadge.textContent = room.rules_type === 'renju' ? I18n.t('renju') : I18n.t('freestyle');
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
    showForbiddenMarkers(board);
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

      const winCoords = Rules.winningLine(board, move.x, move.y, roomData.rules_type);
      if (winCoords) {
        gameOver = true;
        drawWinLine(winCoords);
        showWinModal(move.player);
      }

      // Update renju markers
      if (roomData && roomData.rules_type === 'renju') {
        clearForbiddenMarkers();
        if (roomData.current_turn === 'black' && !gameOver) {
          showForbiddenMarkers(board);
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
        clearForbiddenMarkers();
        if (roomData.current_turn === 'black') {
          showForbiddenMarkers(board);
        }
      }
    })
    .subscribe();
}

function setupTaunts(roomId) {
  const nickname = localStorage.getItem('omok_nickname') || '';

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
    const reason = Rules.forbiddenReason(board, x, y);
    if (reason) {
      showToast(forbiddenMessage(reason));
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

  const winCoords = Rules.winningLine(board, x, y, roomData.rules_type);

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
    clearForbiddenMarkers();
    if (nextTurn === 'black') {
      showForbiddenMarkers(board);
    }
  }
}

function updateGameInfo() {
  if (!roomData) return;

  const nickname = localStorage.getItem('omok_nickname') || 'You';
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
  const nickname = localStorage.getItem('omok_nickname') || 'You';
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

// Taunt sending
window.sendTaunt = async function(effectKey, customMsg) {
  if (!roomData) return;
  const nickname = localStorage.getItem('omok_nickname') || '';
  await Taunt.sendTaunt(roomData.id, nickname, effectKey, customMsg);
  showToast('Taunt sent!');
};

window.sendTauntFromModal = function(effectKey) {
  sendTaunt(effectKey);
};

// Enshrine victory
window.enshrineVictory = async function() {
  if (!roomData) return;
  const nickname = localStorage.getItem('omok_nickname') || '';
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
  const storedTokens = JSON.parse(localStorage.getItem('omok_hall_tokens') || '{}');
  storedTokens[entry.id] = token;
  localStorage.setItem('omok_hall_tokens', JSON.stringify(storedTokens));

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
  const nickname = localStorage.getItem('omok_nickname') || '';

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
  localStorage.setItem('omok_player_role', newHostRole);
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
  localStorage.setItem('omok_player_role', 'white');
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
