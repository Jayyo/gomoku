// Lobby logic
let nickname = localStorage.getItem('gomoku_nickname') || '';
let roomSubscription = null;

document.addEventListener('DOMContentLoaded', () => {
  const nicknameInput = document.getElementById('nickname');
  const createBtn = document.getElementById('create-btn');
  const joinCodeInput = document.getElementById('join-code');
  const joinBtn = document.getElementById('join-btn');
  const roomListEl = document.getElementById('room-list');

  if (nickname) nicknameInput.value = nickname;

  nicknameInput.addEventListener('input', (e) => {
    nickname = e.target.value.trim();
    localStorage.setItem('gomoku_nickname', nickname);
  });

  createBtn.addEventListener('click', createRoom);
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

  loadRooms();
  subscribeToRooms();
});

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function createRoom() {
  if (!nickname) {
    showToast('Please enter your nickname first');
    return;
  }

  const code = generateCode();

  const { data, error } = await db
    .from('rooms')
    .insert({ code, host_name: nickname, status: 'waiting' })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      // Duplicate code, retry
      return createRoom();
    }
    showToast('Failed to create room: ' + error.message);
    return;
  }

  localStorage.setItem('gomoku_player_role', 'black');
  window.location.href = `game.html?room=${code}`;
}

async function joinRoom(code) {
  if (!nickname) {
    showToast('Please enter your nickname first');
    return;
  }

  const { data: room, error: fetchError } = await db
    .from('rooms')
    .select('*')
    .eq('code', code)
    .single();

  if (fetchError || !room) {
    showToast('Room not found');
    return;
  }

  if (room.status !== 'waiting') {
    showToast('This room is already in a game');
    return;
  }

  if (room.host_name === nickname) {
    showToast('Cannot join your own room with the same name');
    return;
  }

  const { error: updateError } = await db
    .from('rooms')
    .update({ guest_name: nickname, status: 'playing' })
    .eq('id', room.id);

  if (updateError) {
    showToast('Failed to join room: ' + updateError.message);
    return;
  }

  localStorage.setItem('gomoku_player_role', 'white');
  window.location.href = `game.html?room=${code}`;
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
    roomListEl.innerHTML = '<p style="color:var(--text-dim)">Failed to load rooms</p>';
    return;
  }

  renderRooms(rooms);
}

function renderRooms(rooms) {
  const roomListEl = document.getElementById('room-list');

  if (!rooms || rooms.length === 0) {
    roomListEl.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:20px">No open rooms. Create one!</p>';
    return;
  }

  roomListEl.innerHTML = rooms.map(room => `
    <div class="room-item">
      <div class="room-info">
        <span class="status-dot waiting"></span>
        <span>${escapeHtml(room.host_name)}</span>
        <span class="room-code-tag">${room.code}</span>
      </div>
      <button class="btn btn-primary btn-small" onclick="joinRoom('${room.code}')">Join</button>
    </div>
  `).join('');
}

function subscribeToRooms() {
  roomSubscription = db
    .channel('rooms-lobby')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
      loadRooms();
    })
    .subscribe();
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
