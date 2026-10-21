// Lobby page
let nickname = localStorage.getItem('omok_nickname') || '';
let roomSubscription = null;

document.addEventListener('DOMContentLoaded', () => {
  const nicknameInput = document.getElementById('nickname');
  const createBtn = document.getElementById('create-btn');
  const joinCodeInput = document.getElementById('join-code');
  const joinBtn = document.getElementById('join-btn');
  const localBtn = document.getElementById('local-btn');

  if (nickname) nicknameInput.value = nickname;

  nicknameInput.addEventListener('input', (e) => {
    nickname = e.target.value.trim();
    localStorage.setItem('omok_nickname', nickname);
  });

  // Create button opens modal
  createBtn.addEventListener('click', () => {
    if (!nickname) {
      showToast(I18n.t('enter_nickname'));
      return;
    }
    document.getElementById('create-modal').classList.remove('hidden');
  });

  // Modal create button
  document.getElementById('modal-create-btn').addEventListener('click', createRoom);

  joinBtn.addEventListener('click', () => {
    const code = joinCodeInput.value.trim().toUpperCase();
    if (code) joinRoom(code);
  });

  joinCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const code = joinCodeInput.value.trim().toUpperCase();
      if (code) joinRoom(code);
    }
  });

  // Local play button
  if (localBtn) {
    localBtn.addEventListener('click', () => {
      const rules = document.getElementById('local-rules').value;
      window.location.href = `game.html?mode=local&rules=${rules}`;
    });
  }

  // Close modal on outside click
  document.getElementById('create-modal').addEventListener('click', (e) => {
    if (e.target.classList.contains('create-modal-overlay')) {
      e.target.classList.add('hidden');
    }
  });

  if (!db) {
    document.getElementById('room-list').innerHTML = '<p class="empty-msg">Connecting to server...</p>';
    return;
  }

  loadRooms();
  subscribeToRooms();
});

// generateCode() is now in shared.js

async function createRoom() {
  if (!nickname) {
    showToast(I18n.t('enter_nickname'));
    return;
  }

  const rulesType = document.getElementById('modal-rules').value;
  const betText = document.getElementById('modal-bet').value.trim() || null;
  const code = generateCode();

  // Try with new columns first, fallback to base columns
  let insertData = { code, host_name: nickname, status: 'waiting', rules_type: rulesType, bet_text: betText };
  let { data, error } = await db.from('rooms').insert(insertData).select().single();

  if (error && error.message && error.message.includes('schema cache')) {
    // DB missing new columns - retry with base columns only
    insertData = { code, host_name: nickname, status: 'waiting' };
    ({ data, error } = await db.from('rooms').insert(insertData).select().single());
    if (!error) {
      // Store rules/bet locally for game page
      localStorage.setItem('omok_rules_type', rulesType);
      if (betText) localStorage.setItem('omok_bet_text', betText);
    }
  }

  if (error) {
    if (error.code === '23505') {
      return createRoom();
    }
    showToast(I18n.t('failed_create') + ': ' + error.message);
    return;
  }

  localStorage.setItem('omok_player_role', 'black');
  document.getElementById('create-modal').classList.add('hidden');
  window.location.href = `game.html?room=${code}`;
}

async function joinRoom(code) {
  if (!nickname) {
    showToast(I18n.t('enter_nickname'));
    return;
  }

  const { data: room, error: fetchError } = await db
    .from('rooms')
    .select('*')
    .eq('code', code)
    .single();

  if (fetchError || !room) {
    showToast(I18n.t('room_not_found'));
    return;
  }

  if (room.status !== 'waiting') {
    showToast(I18n.t('room_in_game'));
    return;
  }

  if (room.host_name === nickname) {
    showToast(I18n.t('same_name'));
    return;
  }

  // If there's a bet, need to show agreement first
  if (room.bet_text) {
    showBetAgreement(room);
    return;
  }

  await doJoinRoom(room);
}

function showBetAgreement(room) {
  const overlay = document.createElement('div');
  overlay.className = 'bet-agree-overlay';
  overlay.innerHTML = `
    <div class="bet-agree-box">
      <h2 style="color:var(--accent);font-family:var(--font-heading);margin-bottom:16px;">⚔ ${I18n.t('bet_label')}</h2>
      <div class="bet-display">${escapeHtml(room.bet_text)}</div>
      <label class="checkbox-group mt-16">
        <input type="checkbox" id="bet-agree-check">
        <span data-i18n="bet_agreed">${I18n.t('bet_agreed')}</span>
      </label>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-primary" id="bet-agree-btn" disabled style="flex:1">${I18n.t('join_btn')}</button>
        <button class="btn btn-secondary" onclick="this.closest('.bet-agree-overlay').remove()" style="flex:1">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const checkbox = overlay.querySelector('#bet-agree-check');
  const agreeBtn = overlay.querySelector('#bet-agree-btn');

  checkbox.addEventListener('change', () => {
    agreeBtn.disabled = !checkbox.checked;
  });

  agreeBtn.addEventListener('click', async () => {
    overlay.remove();
    await doJoinRoom(room, true);
  });
}

async function doJoinRoom(room, betAgreed = false) {
  const updateData = { guest_name: nickname, status: 'playing' };
  if (betAgreed) updateData.bet_agreed = true;

  let { error: updateError } = await db
    .from('rooms')
    .update(updateData)
    .eq('id', room.id);

  // Fallback if bet_agreed column doesn't exist
  if (updateError && updateError.message && updateError.message.includes('schema cache')) {
    ({ error: updateError } = await db
      .from('rooms')
      .update({ guest_name: nickname, status: 'playing' })
      .eq('id', room.id));
  }

  if (updateError) {
    showToast(I18n.t('failed_join') + ': ' + updateError.message);
    return;
  }

  localStorage.setItem('omok_player_role', 'white');
  window.location.href = `game.html?room=${room.code}`;
}

async function loadRooms() {
  const roomListEl = document.getElementById('room-list');

  const { data: rooms, error } = await db
    .from('rooms')
    .select('*')
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    roomListEl.innerHTML = `<p class="empty-msg">${I18n.t('no_rooms')}</p>`;
    return;
  }

  renderRooms(rooms);
}

function renderRooms(rooms) {
  const roomListEl = document.getElementById('room-list');

  if (!rooms || rooms.length === 0) {
    roomListEl.innerHTML = `<p class="empty-msg">${I18n.t('no_rooms')}</p>`;
    return;
  }

  roomListEl.innerHTML = rooms.map(room => {
    const rulesLabel = room.rules_type ? (room.rules_type === 'renju' ? I18n.t('renju_pro') : I18n.t('freestyle')) : I18n.t('freestyle');
    const betIcon = room.bet_text ? ' ⚔' : '';
    return `
      <div class="room-item">
        <div class="room-info">
          <span class="status-dot waiting"></span>
          <span>${escapeHtml(room.host_name)}${betIcon}</span>
          <span class="room-code-tag">${room.code}</span>
          <span class="room-rules-tag">${rulesLabel}</span>
        </div>
        <button class="btn btn-primary btn-small" onclick="joinRoom('${room.code}')">${I18n.t('join_btn')}</button>
      </div>
    `;
  }).join('');
}

function subscribeToRooms() {
  roomSubscription = db
    .channel('rooms-lobby')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
      loadRooms();
    })
    .subscribe();
}
