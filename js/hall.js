// Hall of Fame page: games that winners chose to keep, with replays
(function () {
  const COLUMNS = 'id, winner_name, loser_name, winner_role, move_count, rules_type, bet_text, replay_data, message, created_at';
  let entries = [];
  let state = 'loading';

  document.addEventListener('DOMContentLoaded', async () => {
    document.addEventListener('langchange', render);
    render();
    if (!(await Online.connect())) {
      state = 'offline';
      render();
      return;
    }
    const { data, error } = await db
      .from('hall_of_fame')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .limit(50);
    state = error ? 'error' : 'ready';
    entries = data || [];
    render();
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function storedTokens() {
    try {
      return JSON.parse(localStorage.getItem('omok_hall_tokens') || '{}');
    } catch (e) {
      return {};
    }
  }

  function render() {
    const list = document.getElementById('hall-list');
    const messages = {
      loading: 'loading',
      offline: 'online_unavailable',
      error: 'hall_failed',
    };
    if (state !== 'ready' || !entries.length) {
      list.replaceChildren(el('p', 'empty-msg', I18n.t(messages[state] || 'hall_no_entries')));
      return;
    }

    const tokens = storedTokens();
    list.replaceChildren(...entries.map((entry) => {
      const item = el('div', 'hall-entry');
      const header = el('div', 'hall-header');
      const players = el('div', 'hall-players');
      players.append(
        el('span', 'hall-winner-name', entry.winner_name),
        el('span', 'hall-vs', 'vs'),
        el('span', 'hall-loser-name', entry.loser_name)
      );
      const meta = el('div', 'hall-meta');
      meta.append(
        el('span', 'hall-tag', I18n.t(entry.rules_type === 'renju' ? 'renju' : 'freestyle')),
        el('span', 'hall-tag', I18n.t('hall_moves').replace('{n}', entry.move_count || '?')),
        el('span', 'hall-date', new Date(entry.created_at).toLocaleDateString(I18n.getLang()))
      );
      header.append(players, meta);
      item.append(header);

      if (entry.bet_text) {
        const bet = el('div', 'hall-bet');
        bet.append(el('span', 'label', `${I18n.t('hall_bet')}: `), document.createTextNode(entry.bet_text));
        item.append(bet);
      }
      if (entry.message) item.append(el('div', 'hall-message', `"${entry.message}"`));

      const actions = el('div', 'hall-actions');
      if (Array.isArray(entry.replay_data) && entry.replay_data.length) {
        const replay = el('button', 'btn btn-secondary btn-small', I18n.t('hall_replay'));
        replay.type = 'button';
        replay.addEventListener('click', () => showReplay(entry));
        actions.append(replay);
      }
      if (tokens[entry.id]) {
        const remove = el('button', 'btn btn-danger btn-small', I18n.t('hall_delete'));
        remove.type = 'button';
        remove.addEventListener('click', () => deleteEntry(entry.id));
        actions.append(remove);
      }
      item.append(actions);
      return item;
    }));
  }

  function showReplay(entry) {
    const moves = entry.replay_data.filter(m =>
      Number.isInteger(m.x) && Number.isInteger(m.y) && (m.player === 'black' || m.player === 'white'));

    const overlay = el('div', 'modal-overlay');
    const modal = el('div', 'modal replay-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const wrapper = el('div', 'replay-board-wrapper');
    const boardEl = el('div', 'replay-board');
    wrapper.append(boardEl);
    const counter = el('div', 'replay-controls', `0 / ${moves.length}`);
    const close = el('button', 'btn btn-secondary', I18n.t('close'));
    close.type = 'button';
    modal.append(el('h2', '', `${entry.winner_name} vs ${entry.loser_name}`), wrapper, counter, close);
    overlay.append(modal);
    document.body.append(overlay);

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const cell = el('div', 'cell');
        cell.dataset.x = x;
        cell.dataset.y = y;
        if (STAR_POINTS.some(([sx, sy]) => sx === x && sy === y)) {
          cell.classList.add('star-point');
          cell.append(el('div', 'dot'));
        }
        boardEl.append(cell);
      }
    }

    let i = 0;
    const timer = setInterval(() => {
      if (i >= moves.length || !overlay.isConnected) {
        clearInterval(timer);
        return;
      }
      const move = moves[i];
      const cell = boardEl.querySelector(`.cell[data-x="${move.x}"][data-y="${move.y}"]`);
      if (cell) {
        const dot = cell.querySelector('.dot');
        if (dot) dot.remove();
        boardEl.querySelectorAll('.stone.last-move').forEach(s => s.classList.remove('last-move'));
        const stone = el('div', `stone ${move.player} last-move`);
        stone.style.animation = 'stone-drop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        cell.append(stone);
      }
      i++;
      counter.textContent = `${i} / ${moves.length}`;
    }, 500);

    close.addEventListener('click', () => {
      clearInterval(timer);
      overlay.remove();
    });
  }

  async function deleteEntry(id) {
    const tokens = storedTokens();
    if (!tokens[id] || !window.confirm(I18n.t('hall_confirm_delete'))) return;

    // The server checks the token; it can't be read back from the table
    const { data, error } = await db.rpc('delete_hall_entry', { entry_id: id, token: tokens[id] });
    if (error || !data) {
      showToast(I18n.t('hall_delete_failed'));
      return;
    }
    delete tokens[id];
    try {
      localStorage.setItem('omok_hall_tokens', JSON.stringify(tokens));
    } catch (e) {
      // ignore
    }
    entries = entries.filter(e => e.id !== id);
    render();
    showToast(I18n.t('hall_deleted'));
  }
})();
