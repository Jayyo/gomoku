// Lobby page
let nickname = '';
let roomSubscription = null;
let onlineState = 'checking';

function loadNickname() {
  try {
    return localStorage.getItem('omok_nickname') || '';
  } catch (e) {
    return '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupOfflineModes();

  const nicknameInput = document.getElementById('nickname');
  const joinCodeInput = document.getElementById('join-code');
  nickname = loadNickname();
  nicknameInput.value = nickname;
  nicknameInput.addEventListener('input', () => {
    nickname = nicknameInput.value.trim();
    try {
      localStorage.setItem('omok_nickname', nickname);
    } catch (e) {
      // not saved, still usable for this page
    }
  });

  // Invite links look like index.html?join=ABC234
  const invited = new URLSearchParams(window.location.search).get('join');
  if (invited && ROOM_CODE_PATTERN.test(invited.toUpperCase())) {
    joinCodeInput.value = invited.toUpperCase();
    document.querySelector('.section-title').scrollIntoView({ block: 'start' });
  }

  document.getElementById('create-btn').addEventListener('click', () => {
    if (!nickname) {
      showToast(I18n.t('enter_nickname'));
      nicknameInput.focus();
      return;
    }
    document.getElementById('create-modal').classList.remove('hidden');
  });
  document.getElementById('modal-create-btn').addEventListener('click', createRoom);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeCreateModal);
  document.getElementById('create-modal').addEventListener('click', (e) => {
    if (e.target.id === 'create-modal') closeCreateModal();
  });

  const submitJoin = () => {
    const code = joinCodeInput.value.trim().toUpperCase();
    if (code) joinRoom(code);
  };
  document.getElementById('join-btn').addEventListener('click', submitJoin);
  joinCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitJoin();
  });

  document.addEventListener('langchange', () => {
    setOnlineState(onlineState);
    if (onlineState === 'ready') loadRooms();
  });

  setOnlineState('checking');
  Online.connect().then((client) => {
    if (!client) {
      setOnlineState('offline');
      return;
    }
    setOnlineState('ready');
    loadRooms();
    subscribeToRooms();
  });
});

// Computer and pass-and-play games need no server
function setupOfflineModes() {
  const fields = { level: 'ai-level', color: 'ai-color', rules: 'ai-rules', localRules: 'local-rules' };
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('omok_offline_settings')) || {};
  } catch (e) {
    saved = {};
  }
  for (const [key, id] of Object.entries(fields)) {
    const select = document.getElementById(id);
    if (saved[key] && [...select.options].some(o => o.value === saved[key])) select.value = saved[key];
  }
  const save = () => {
    const values = {};
    for (const [key, id] of Object.entries(fields)) values[key] = document.getElementById(id).value;
    try {
      localStorage.setItem('omok_offline_settings', JSON.stringify(values));
    } catch (e) {
      // settings just won't be remembered
    }
    return values;
  };

  document.getElementById('ai-start').addEventListener('click', () => {
    const v = save();
    const color = v.color === 'random' ? (Math.random() < 0.5 ? 'black' : 'white') : v.color;
    window.location.href = `game.html?mode=ai&level=${v.level}&color=${color}&rules=${v.rules}`;
  });
  document.getElementById('local-start').addEventListener('click', () => {
    const v = save();
    window.location.href = `game.html?mode=local&rules=${v.localRules}`;
  });
}

// 'checking' | 'ready' | 'offline'
function setOnlineState(state) {
  onlineState = state;
  const status = document.getElementById('online-status');
  const controls = ['nickname', 'create-btn', 'join-code', 'join-btn'].map(id => document.getElementById(id));
  controls.forEach((el) => { el.disabled = state !== 'ready'; });
  document.getElementById('online-section').classList.toggle('is-offline', state === 'offline');

  if (state === 'checking') {
    status.textContent = I18n.t('online_checking');
    status.className = 'online-status checking';
    setRoomListMessage(I18n.t('loading_rooms'));
  } else if (state === 'offline') {
    status.textContent = I18n.t('online_unavailable');
    status.className = 'online-status offline';
    setRoomListMessage(I18n.t('online_unavailable_short'));
  } else {
    status.textContent = '';
    status.className = 'online-status hidden';
  }
}

function setRoomListMessage(text) {
  const p = document.createElement('p');
  p.className = 'empty-msg';
  p.textContent = text;
  document.getElementById('room-list').replaceChildren(p);
}

function closeCreateModal() {
  document.getElementById('create-modal').classList.add('hidden');
}

async function createRoom() {
  if (!db) return;
  if (!nickname) {
    showToast(I18n.t('enter_nickname'));
    return;
  }
  const button = document.getElementById('modal-create-btn');
  const rulesType = document.getElementById('modal-rules').value;
  const betText = document.getElementById('modal-bet').value.trim() || null;

  button.disabled = true;
  let created = null;
  let lastError = null;
  // A clash on the random code is unlikely, but try a few
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const { data, error } = await db
      .from('rooms')
      .insert({ code: generateCode(), host_name: nickname, host_role: 'black', rules_type: rulesType, bet_text: betText })
      .select('code')
      .single();
    if (!error) created = data;
    else if (error.code !== '23505') {
      lastError = error;
      break;
    }
  }
  button.disabled = false;

  if (!created) {
    console.error(lastError);
    showToast(I18n.t('failed_create'));
    return;
  }
  Seat.set(created.code, 'host');
  closeCreateModal();
  window.location.href = `game.html?room=${created.code}`;
}

async function joinRoom(code) {
  if (!db) return;
  if (!nickname) {
    showToast(I18n.t('enter_nickname'));
    document.getElementById('nickname').focus();
    return;
  }
  if (!ROOM_CODE_PATTERN.test(code)) {
    showToast(I18n.t('room_not_found'));
    return;
  }

  const { data: room, error } = await db
    .from('rooms')
    .select('id, code, host_name, status, bet_text')
    .eq('code', code)
    .maybeSingle();

  if (error || !room) {
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

  if (room.bet_text) showBetAgreement(room);
  else await takeSeat(room, false);
}

function showBetAgreement(room) {
  const overlay = document.createElement('div');
  overlay.className = 'bet-agree-overlay';

  const box = document.createElement('div');
  box.className = 'bet-agree-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');

  const title = document.createElement('h2');
  title.className = 'bet-agree-title';
  title.textContent = `⚔ ${I18n.t('bet_title')}`;
  const bet = document.createElement('div');
  bet.className = 'bet-display';
  bet.textContent = room.bet_text;

  const label = document.createElement('label');
  label.className = 'checkbox-group mt-16';
  const check = document.createElement('input');
  check.type = 'checkbox';
  const text = document.createElement('span');
  text.textContent = I18n.t('bet_agreed');
  label.append(check, text);

  const actions = document.createElement('div');
  actions.className = 'flex gap-8 mt-16';
  const join = document.createElement('button');
  join.type = 'button';
  join.className = 'btn btn-primary flex-1';
  join.textContent = I18n.t('join_btn');
  join.disabled = true;
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn-secondary flex-1';
  cancel.textContent = I18n.t('cancel');
  actions.append(join, cancel);

  box.append(title, bet, label, actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  check.addEventListener('change', () => { join.disabled = !check.checked; });
  cancel.addEventListener('click', () => overlay.remove());
  join.addEventListener('click', async () => {
    overlay.remove();
    await takeSeat(room, true);
  });
}

async function takeSeat(room, betAgreed) {
  // Only succeeds while the room is still waiting, so two guests can't both get in
  const { data, error } = await db
    .from('rooms')
    .update({ guest_name: nickname, status: 'playing', bet_agreed: betAgreed })
    .eq('id', room.id)
    .eq('status', 'waiting')
    .select('code');

  if (error) {
    console.error(error);
    showToast(I18n.t('failed_join'));
    return;
  }
  if (!data || !data.length) {
    showToast(I18n.t('room_in_game'));
    return;
  }
  Seat.set(room.code, 'guest');
  window.location.href = `game.html?room=${room.code}`;
}

async function loadRooms() {
  const { data: rooms, error } = await db
    .from('rooms')
    .select('id, code, host_name, rules_type, bet_text')
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    setRoomListMessage(I18n.t('rooms_failed'));
    return;
  }
  renderRooms(rooms);
}

function renderRooms(rooms) {
  if (!rooms || rooms.length === 0) {
    setRoomListMessage(I18n.t('no_rooms'));
    return;
  }

  const items = rooms.map((room) => {
    const item = document.createElement('div');
    item.className = 'room-item';

    const info = document.createElement('div');
    info.className = 'room-info';
    const dot = document.createElement('span');
    dot.className = 'status-dot waiting';
    const host = document.createElement('span');
    host.textContent = room.host_name + (room.bet_text ? ' ⚔' : '');
    const code = document.createElement('span');
    code.className = 'room-code-tag';
    code.textContent = room.code;
    const rules = document.createElement('span');
    rules.className = 'room-rules-tag';
    rules.textContent = I18n.t(room.rules_type === 'renju' ? 'renju' : 'freestyle');
    info.append(dot, host, code, rules);

    const join = document.createElement('button');
    join.type = 'button';
    join.className = 'btn btn-primary btn-small';
    join.textContent = I18n.t('join_btn');
    join.addEventListener('click', () => joinRoom(room.code));

    item.append(info, join);
    return item;
  });
  document.getElementById('room-list').replaceChildren(...items);
}

function subscribeToRooms() {
  roomSubscription = db
    .channel('rooms-lobby')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => loadRooms())
    .subscribe();
}

window.addEventListener('beforeunload', () => {
  if (roomSubscription) db.removeChannel(roomSubscription);
});
