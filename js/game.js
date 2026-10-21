// Game page. Offline games go to LocalGame (local-game.js); this file handles online rooms.
// The moves table is the source of truth: whose turn it is follows from the number of moves,
// and both players detect the end of the game from the same moves.

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  if (mode === 'local' || mode === 'ai') {
    LocalGame.start(params);
    return;
  }
  OnlineGame.start((params.get('room') || '').toUpperCase());
});

const OnlineGame = (() => {
  let room = null;
  let seat = null; // 'host', 'guest', or null when watching
  let myRole = null;
  let board = createEmptyBoard();
  let moves = [];
  let result = null; // { winner, reason } once the game is over
  let pending = false;
  let syncing = null; // promise while moves are being reloaded
  let syncAgain = false;
  let buffered = []; // realtime moves that arrive during a reload
  let channels = [];
  let rematchTaken = false;

  // ---- setup ----
  async function start(code) {
    document.getElementById('leave-btn').addEventListener('click', leaveRoom);
    document.addEventListener('langchange', updatePanel);
    window.addEventListener('beforeunload', () => {
      if (db) channels.forEach(ch => db.removeChannel(ch));
    });
    // Realtime can miss events while a phone sleeps; catch up when the tab comes back
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && room) refresh();
    });
    renderBoard(document.getElementById('board'), handleCellClick, onHoverEnter, removeHoverPreview);

    if (!ROOM_CODE_PATTERN.test(code)) {
      showNotice('room_not_found', null);
      return;
    }
    setIndicator(I18n.t('connecting'), '');
    if (!(await Online.connect())) {
      showNotice('online_unavailable_title', 'online_unavailable');
      return;
    }

    const { data, error } = await db.from('rooms').select('*').eq('code', code).maybeSingle();
    if (error || !data) {
      showNotice('room_not_found', null);
      return;
    }
    room = data;
    seat = Seat.get(code);
    myRole = seat ? roleOf(seat) : null;

    subscribe();
    await sync(false);
    setupTaunts();
    if (room.status === 'waiting') showWaitingOverlay();
    if (room.bet_text) {
      document.getElementById('bet-content').textContent = room.bet_text;
      document.getElementById('bet-display').classList.remove('hidden');
    }
  }

  function roleOf(s) {
    return s === 'host' ? room.host_role : Rules.opponent(room.host_role);
  }

  function nameOf(role) {
    return role === room.host_role ? room.host_name : room.guest_name;
  }

  function myName() {
    if (!seat) return null;
    return seat === 'host' ? room.host_name : room.guest_name;
  }

  function turn() {
    return moves.length % 2 === 0 ? 'black' : 'white';
  }

  function subscribe() {
    channels.push(db
      .channel(`moves-${room.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moves', filter: `room_id=eq.${room.id}` },
        payload => applyMove(payload.new, true))
      .subscribe());
    channels.push(db
      .channel(`room-${room.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        payload => onRoomUpdate(payload.new))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        () => { if (seat !== 'host') showNotice('room_closed', null); })
      // Anything that happened before the channel was ready (or while it was reconnecting) is fetched here
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh();
      }));
  }

  async function refresh() {
    const { data, error } = await db.from('rooms').select('*').eq('id', room.id).maybeSingle();
    if (error) return;
    if (!data) {
      if (seat !== 'host') showNotice('room_closed', null);
      return;
    }
    onRoomUpdate(data);
    await sync(false);
  }

  // Rooms only move forward (waiting -> playing -> finished, guest and rematch code set once),
  // so an update that isn't ahead of what we have is a stale response and is dropped
  const STATUS_ORDER = { waiting: 0, playing: 1, finished: 2 };
  function isAhead(next, current) {
    const a = STATUS_ORDER[next.status];
    const b = STATUS_ORDER[current.status];
    if (a !== b) return a > b;
    return (!current.guest_name && !!next.guest_name) || (!current.rematch_code && !!next.rematch_code);
  }

  // Reload all moves from the server (start-up, reconnects, gaps, failed inserts).
  // Moves that arrive meanwhile are buffered and applied afterwards, and a reload requested
  // during another one runs again once it finishes. `live` is false when catching up, so
  // an old result doesn't replay its sounds.
  function sync(live = true) {
    if (syncing) {
      syncAgain = true;
      return syncing;
    }
    syncing = (async () => {
      let data = null;
      do {
        syncAgain = false;
        const res = await db
          .from('moves')
          .select('x, y, player, move_number')
          .eq('room_id', room.id)
          .order('move_number', { ascending: true });
        if (res.error) {
          showToast(I18n.t('sync_failed'));
          return;
        }
        data = res.data;
      } while (syncAgain);
      rebuild(data, live);
    })().finally(() => {
      syncing = null;
      const late = buffered.splice(0).sort((a, b) => a.move_number - b.move_number);
      late.forEach(m => applyMove(m, live));
      updatePanel();
      offerRematchIfAny();
    });
    return syncing;
  }

  function rebuild(data, live) {
    board = createEmptyBoard();
    moves = [];
    renderBoard(document.getElementById('board'), handleCellClick, onHoverEnter, removeHoverPreview);
    clearWinLine();
    for (const m of data) {
      if (m.move_number !== moves.length + 1) break;
      board[m.y][m.x] = m.player;
      moves.push(m);
    }
    moves.forEach((m, i) => placeStoneVisual(m.x, m.y, m.player, i === moves.length - 1));

    const last = moves[moves.length - 1];
    const line = last && Rules.winningLine(board, last.x, last.y, room.rules_type);
    if (line && result) drawWinLine(line);
    else if (line) finish(last.player, line, 'five', live);
    else if (moves.length === BOARD_SIZE * BOARD_SIZE && !result) finish(null, null, 'draw', live);
    else if (room.status === 'finished' && !result) finish(room.winner, null, room.winner ? 'forfeit' : 'draw', live);
  }

  // ---- moves ----
  function applyMove(m, animate) {
    if (syncing) {
      buffered.push(m);
      return;
    }
    if (m.move_number <= moves.length) return;
    if (m.move_number !== moves.length + 1 || board[m.y][m.x]) {
      sync();
      return;
    }
    board[m.y][m.x] = m.player;
    moves.push({ x: m.x, y: m.y, player: m.player, move_number: m.move_number });

    const ghost = document.querySelector('.stone.pending');
    if (ghost) ghost.remove();
    document.querySelectorAll('.stone.last-move').forEach(el => el.classList.remove('last-move'));
    placeStoneVisual(m.x, m.y, m.player, true);
    if (animate) {
      Sound.playStone();
      applyImpactEffects(m.x, m.y, m.player, board);
    }

    const line = Rules.winningLine(board, m.x, m.y, room.rules_type);
    if (line) finish(m.player, line, 'five', true);
    else if (moves.length === BOARD_SIZE * BOARD_SIZE) finish(null, null, 'draw', true);
    else updatePanel();
  }

  async function handleCellClick(x, y) {
    if (pending || syncing || result || !room || room.status !== 'playing' || !myRole) return;
    if (turn() !== myRole) {
      showToast(I18n.t('not_your_turn'));
      return;
    }
    if (board[y][x]) return;
    if (room.rules_type === 'renju' && myRole === 'black') {
      const reason = Rules.forbiddenReason(board, x, y);
      if (reason) {
        showToast(forbiddenMessage(reason));
        return;
      }
    }

    // One move at a time; the stone shows faded until the server accepts it
    pending = true;
    const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    removeHoverPreview(cell);
    const ghost = document.createElement('div');
    ghost.className = `stone ${myRole} pending`;
    cell.appendChild(ghost);

    const move = { room_id: room.id, player: myRole, x, y, move_number: moves.length + 1 };
    const { error } = await db.from('moves').insert(move);
    pending = false;
    if (error) {
      ghost.remove();
      console.error(error);
      showToast(I18n.t('failed_place'));
      sync();
      return;
    }
    applyMove(move, true);
  }

  function onHoverEnter(cell, x, y) {
    if (pending || result || !room || room.status !== 'playing' || turn() !== myRole || board[y][x]) return;
    if (room.rules_type === 'renju' && myRole === 'black' && cell.querySelector('.forbidden-marker')) return;
    showHoverPreview(cell, x, y, board, myRole, true);
  }

  // ---- room changes ----
  function onRoomUpdate(next) {
    if (!isAhead(next, room)) return;
    const before = room;
    room = next;
    if (before.status === 'waiting' && room.status === 'playing') {
      hideWaitingOverlay();
      Sound.playStone();
    }
    if (room.status === 'finished' && !result) {
      // Finished without a five on our board: the other player left, or we missed a move.
      // sync() finishes the game from the room row if the moves don't decide it.
      sync(true);
    }
    offerRematchIfAny();
    updatePanel();
  }

  function offerRematchIfAny() {
    if (result && myRole && room.rematch_code && !rematchTaken) showRematchOffer(room.rematch_code);
  }

  async function recordResult(winner) {
    if (room.status !== 'playing') return;
    // Either player may record it; the first update wins, later ones match no row
    const { error } = await db
      .from('rooms')
      .update({ status: 'finished', winner })
      .eq('id', room.id)
      .eq('status', 'playing');
    if (error) console.error(error);
  }

  function finish(winner, line, reason, live) {
    result = { winner, reason };
    clearForbiddenMarkers();
    if (line) drawWinLine(line);
    updatePanel();
    if (reason !== 'forfeit' && myRole) recordResult(winner);
    if (live) setTimeout(() => showResultModal(true), line ? 700 : 0);
    else showResultModal(false);
  }

  // ---- panel ----
  function setIndicator(text, cls) {
    const el = document.getElementById('turn-indicator');
    el.textContent = text;
    el.className = `turn-indicator ${cls}`;
  }

  function updatePanel() {
    if (!room) return;
    const badge = document.getElementById('rules-badge');
    badge.textContent = I18n.t(room.rules_type === 'renju' ? 'renju' : 'freestyle');
    badge.className = `rules-badge ${room.rules_type}`;

    for (const role of ['black', 'white']) {
      const name = nameOf(role) || I18n.t('waiting');
      document.getElementById(`${role}-name`).textContent = name + (role === myRole ? ` ${I18n.t('you_suffix')}` : '');
      document.getElementById(`${role}-info`).classList.toggle('active', !result && room.status === 'playing' && turn() === role);
    }

    if (result) {
      setIndicator(resultText(), '');
    } else if (room.status === 'waiting') {
      setIndicator(I18n.t('waiting_title'), '');
    } else if (!myRole) {
      setIndicator(I18n.t(turn() === 'black' ? 'black_to_move' : 'white_to_move'), `${turn()}-turn`);
    } else {
      const mine = turn() === myRole;
      setIndicator(I18n.t(mine ? 'your_turn' : 'opponent_turn'), mine ? 'my-turn' : 'opponent-turn');
    }

    clearForbiddenMarkers();
    if (!result && room.status === 'playing' && room.rules_type === 'renju' && turn() === 'black' && myRole === 'black') {
      showForbiddenMarkers(board);
    }
  }

  function resultText() {
    if (!result.winner) return I18n.t('draw');
    if (!myRole) return I18n.t(result.winner === 'black' ? 'black_wins' : 'white_wins');
    return I18n.t(result.winner === myRole ? 'victory' : 'defeat');
  }

  // ---- overlays ----
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, className, onClick) {
    const node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function showNotice(titleKey, bodyKey) {
    document.querySelectorAll('.waiting-overlay').forEach(node => node.remove());
    setIndicator('', '');
    const overlay = el('div', 'waiting-overlay');
    const box = el('div', 'waiting-box');
    box.setAttribute('role', 'alertdialog');
    box.append(el('h2', '', I18n.t(titleKey)));
    if (bodyKey) box.append(el('p', 'notice-text', I18n.t(bodyKey)));
    const actions = el('div', 'modal-actions mt-16');
    actions.append(
      button(I18n.t('vs_computer'), 'btn btn-primary', () => { window.location.href = 'game.html?mode=ai&level=normal&color=black&rules=freestyle'; }),
      button(I18n.t('back_to_lobby'), 'btn btn-secondary', () => { window.location.href = 'index.html'; })
    );
    box.append(actions);
    overlay.append(box);
    document.body.append(overlay);
  }

  function showWaitingOverlay() {
    if (document.getElementById('waiting-overlay')) return;
    const overlay = el('div', 'waiting-overlay');
    overlay.id = 'waiting-overlay';
    const box = el('div', 'waiting-box');
    box.append(el('h2', '', I18n.t('waiting_title')), el('div', 'spinner'));

    if (seat === 'host') {
      const invite = new URL(`index.html?join=${room.code}`, window.location.href).href;
      box.append(
        el('p', '', I18n.t('share_code')),
        el('div', 'room-code', room.code),
        button(I18n.t('copy_code'), 'copy-btn', () => copy(room.code)),
        button(I18n.t('copy_link'), 'copy-btn', () => copy(invite))
      );
    }
    const leave = el('div', 'mt-16');
    leave.append(button(I18n.t('leave_room'), 'btn btn-secondary btn-small', leaveRoom));
    box.append(leave);
    overlay.append(box);
    document.body.append(overlay);
  }

  function hideWaitingOverlay() {
    const overlay = document.getElementById('waiting-overlay');
    if (overlay) overlay.remove();
  }

  function copy(text) {
    navigator.clipboard.writeText(text)
      .then(() => showToast(I18n.t('copied')))
      .catch(() => showToast(I18n.t('copy_failed')));
  }

  function showResultModal(live) {
    if (document.getElementById('result-modal')) return;
    const { winner, reason } = result;
    const iWon = myRole && winner === myRole;
    const iLost = myRole && winner && winner !== myRole;

    const overlay = el('div', 'modal-overlay');
    overlay.id = 'result-modal';
    const modal = el('div', `modal ${iWon ? 'victory-modal' : iLost ? 'defeat-modal' : ''}`);
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.append(el('h2', iWon ? 'victory-text' : iLost ? 'defeat-text' : '', resultText()));

    let detail = I18n.t('moves_played').replace('{n}', moves.length);
    if (!winner) detail = I18n.t('board_full');
    else if (reason === 'forfeit') detail = I18n.t(iWon ? 'opponent_left' : 'forfeited');
    else if (iWon) detail = I18n.t('congratulations');
    else if (iLost) detail = I18n.t('better_luck');
    modal.append(el('p', 'result', detail));

    // The bet: the loser owes it, the winner gets to see that
    if (room.bet_text && (iWon || iLost)) {
      const owe = el('div', 'you-owe-display');
      owe.append(el('div', 'owe-label', I18n.t(iWon ? 'they_owe_you' : 'you_owe')), el('div', 'owe-content', room.bet_text));
      modal.append(owe);
    }

    if (iWon) {
      const taunts = el('div', 'taunt-panel modal-taunts');
      taunts.append(el('h4', '', I18n.t('taunt_title')));
      const grid = el('div', 'taunt-grid');
      Taunt.getEffectList().forEach(e => grid.append(button(e.name, 'taunt-btn', () => sendTaunt(e.key))));
      taunts.append(grid);
      modal.append(taunts);

      const enshrine = el('div', 'enshrine-section');
      const input = el('input');
      input.type = 'text';
      input.maxLength = 100;
      input.placeholder = I18n.t('enshrine_message');
      const submit = button(I18n.t('enshrine_submit'), 'btn btn-primary btn-small btn-block', () => enshrineVictory(input, submit));
      enshrine.append(input, submit);
      modal.append(enshrine);
      showSideTaunts();
      if (live) {
        Sound.playWin();
        showConfetti();
      }
    } else if (iLost && live) {
      Sound.playLose();
    }

    const actions = el('div', 'modal-actions');
    if (iLost) {
      // The loser's buttons unlock after a short countdown
      const accept = button(I18n.t('accept_defeat'), 'btn btn-secondary', () => { window.location.href = 'index.html'; });
      const rage = button(I18n.t('rage_quit'), 'btn btn-danger', () => { window.location.href = 'index.html'; });
      accept.disabled = true;
      rage.disabled = true;
      const countdown = el('span', 'defeat-countdown', '5...');
      actions.append(accept, rage);
      modal.append(actions, countdown);
      let left = 5;
      const timer = setInterval(() => {
        left--;
        if (left > 0) {
          countdown.textContent = `${left}...`;
          return;
        }
        clearInterval(timer);
        countdown.remove();
        accept.disabled = false;
        rage.disabled = false;
      }, 1000);
    } else {
      if (myRole) actions.append(button(I18n.t('rematch'), 'btn btn-primary btn-glow', requestRematch));
      actions.append(button(I18n.t('view_board'), 'btn btn-secondary', () => overlay.remove()));
      actions.append(button(I18n.t('back_to_lobby'), 'btn btn-secondary', () => { window.location.href = 'index.html'; }));
      modal.append(actions);
    }

    overlay.append(modal);
    document.body.append(overlay);
  }

  // ---- taunts ----
  function setupTaunts() {
    try {
      // Taunts only exist after the game; anything else is ignored
      const channel = Taunt.subscribeTaunts(room.id, myName() || '', (t) => {
        if (result) Taunt.play(t.taunt_type, t.sender, t.message);
      });
      if (channel) channels.push(channel);
    } catch (e) {
      console.warn('Taunt subscription failed:', e);
    }
  }

  function showSideTaunts() {
    const panel = document.getElementById('taunt-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    const grid = document.getElementById('taunt-grid');
    grid.replaceChildren(...Taunt.getEffectList().map(e => button(e.name, 'taunt-btn', () => sendTaunt(e.key))));
    const input = document.getElementById('taunt-custom-input');
    document.getElementById('taunt-send-btn').onclick = () => {
      const text = input.value.trim();
      if (!text) return;
      sendTaunt(Taunt.getRandomEffect(), text);
      input.value = '';
    };
  }

  async function sendTaunt(effectKey, message) {
    const { error } = await Taunt.sendTaunt(room.id, myName(), effectKey, message);
    showToast(I18n.t(error ? 'taunt_failed' : 'taunt_sent'));
  }

  // ---- hall of fame ----
  function randomToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  async function enshrineVictory(input, submit) {
    submit.disabled = true;
    const token = randomToken();
    const { data, error } = await db
      .from('hall_of_fame')
      .insert({
        room_id: room.id,
        winner_name: myName(),
        loser_name: nameOf(Rules.opponent(myRole)),
        winner_role: myRole,
        move_count: moves.length,
        rules_type: room.rules_type,
        bet_text: room.bet_text,
        replay_data: moves,
        message: input.value.trim() || null,
        winner_token: token,
      })
      .select('id')
      .single();

    if (error) {
      console.error(error);
      submit.disabled = false;
      showToast(I18n.t(error.code === '23505' ? 'already_enshrined' : 'enshrine_failed'));
      return;
    }
    try {
      const tokens = JSON.parse(localStorage.getItem('omok_hall_tokens') || '{}');
      tokens[data.id] = token;
      localStorage.setItem('omok_hall_tokens', JSON.stringify(tokens));
    } catch (e) {
      // without the token the entry just can't be deleted from this browser later
    }
    submit.textContent = '✓';
    showToast(I18n.t('enshrined'));
  }

  // ---- rematch / leaving ----
  async function requestRematch() {
    if (room.rematch_code) {
      acceptRematch(room.rematch_code);
      return;
    }
    rematchTaken = true;
    // Colors swap in the rematch
    let created = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      const { data, error } = await db
        .from('rooms')
        .insert({
          code: generateCode(),
          host_name: myName(),
          host_role: Rules.opponent(myRole),
          rules_type: room.rules_type,
          bet_text: room.bet_text,
        })
        .select('id, code')
        .single();
      if (!error) created = data;
      else if (error.code !== '23505') break;
    }
    if (!created) {
      rematchTaken = false;
      showToast(I18n.t('rematch_failed'));
      return;
    }

    const { data: linked } = await db
      .from('rooms')
      .update({ rematch_code: created.code })
      .eq('id', room.id)
      .is('rematch_code', null)
      .select('rematch_code');
    if (!linked || !linked.length) {
      // The other player asked first: drop ours and join theirs
      await db.from('rooms').delete().eq('id', created.id).eq('status', 'waiting');
      const { data: latest } = await db.from('rooms').select('rematch_code').eq('id', room.id).maybeSingle();
      if (latest && latest.rematch_code) acceptRematch(latest.rematch_code);
      return;
    }
    window.location.href = Seat.url(created.code, 'host');
  }

  function showRematchOffer(code) {
    if (document.getElementById('rematch-notification')) return;
    const box = el('div', 'card rematch-offer');
    box.id = 'rematch-notification';
    box.append(el('p', '', I18n.t('rematch_offer')), button(I18n.t('rematch_accept'), 'btn btn-primary btn-glow', () => acceptRematch(code)));
    document.body.append(box);
  }

  async function acceptRematch(code) {
    rematchTaken = true;
    const { data, error } = await db
      .from('rooms')
      .update({ guest_name: myName(), status: 'playing', bet_agreed: !!room.bet_text })
      .eq('code', code)
      .eq('status', 'waiting')
      .select('code');
    if (error || !data || !data.length) {
      rematchTaken = false;
      showToast(I18n.t('rematch_failed'));
      return;
    }
    window.location.href = Seat.url(code, 'guest');
  }

  async function leaveRoom() {
    if (db && room) {
      if (room.status === 'waiting' && seat === 'host') {
        await db.from('rooms').delete().eq('id', room.id).eq('status', 'waiting');
      } else if (room.status === 'playing' && myRole && !result) {
        if (!window.confirm(I18n.t('confirm_forfeit'))) return;
        await db
          .from('rooms')
          .update({ status: 'finished', winner: Rules.opponent(myRole) })
          .eq('id', room.id)
          .eq('status', 'playing');
      }
    }
    window.location.href = 'index.html';
  }

  return { start };
})();
