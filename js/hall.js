// Hall of Fame page
(function() {
  let entries = [];

  document.addEventListener('DOMContentLoaded', async () => {
    if (!db) {
      const listEl = document.getElementById('hall-list');
      if (listEl) listEl.innerHTML = '<p class="empty-msg">Connecting to server...</p>';
      return;
    }
    await loadEntries();
  });

  async function loadEntries() {
    const listEl = document.getElementById('hall-list');
    if (!listEl) return;

    const { data, error } = await db
      .from('hall_of_fame')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      listEl.innerHTML = `<p class="empty-msg">${I18n.t('hall_no_entries')}</p>`;
      return;
    }

    entries = data || [];
    renderEntries();
  }

  function renderEntries() {
    const listEl = document.getElementById('hall-list');
    if (!entries.length) {
      listEl.innerHTML = `<p class="empty-msg">${I18n.t('hall_no_entries')}</p>`;
      return;
    }

    // Get stored tokens for delete capability
    const storedTokens = JSON.parse(localStorage.getItem('omok_hall_tokens') || '{}');

    listEl.innerHTML = entries.map((entry, idx) => {
      const canDelete = storedTokens[entry.id];
      const betHtml = entry.bet_text ? `<div class="hall-bet"><span class="label">${I18n.t('hall_bet')}:</span> ${escapeHtml(entry.bet_text)}</div>` : '';
      const msgHtml = entry.message ? `<div class="hall-message">"${escapeHtml(entry.message)}"</div>` : '';
      const rulesLabel = entry.rules_type === 'renju' ? I18n.t('renju_pro') : I18n.t('freestyle');
      const dateStr = new Date(entry.created_at).toLocaleDateString();

      return `
        <div class="hall-entry" data-id="${entry.id}">
          <div class="hall-header">
            <div class="hall-players">
              <span class="hall-winner-name">${escapeHtml(entry.winner_name)}</span>
              <span class="hall-vs">vs</span>
              <span class="hall-loser-name">${escapeHtml(entry.loser_name)}</span>
            </div>
            <div class="hall-meta">
              <span class="hall-tag">${rulesLabel}</span>
              <span class="hall-tag">${entry.move_count || '?'} ${I18n.t('hall_moves').toLowerCase()}</span>
              <span class="hall-date">${dateStr}</span>
            </div>
          </div>
          ${betHtml}
          ${msgHtml}
          <div class="hall-actions">
            ${entry.replay_data ? `<button class="btn btn-secondary btn-small" onclick="window.hallReplay(${idx})">${I18n.t('hall_replay')}</button>` : ''}
            ${canDelete ? `<button class="btn btn-danger btn-small" onclick="window.hallDelete('${entry.id}')">${I18n.t('hall_delete')}</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Replay animation
  window.hallReplay = function(idx) {
    const entry = entries[idx];
    if (!entry || !entry.replay_data) return;

    const moves = typeof entry.replay_data === 'string' ? JSON.parse(entry.replay_data) : entry.replay_data;
    if (!moves.length) return;

    // Create replay modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal replay-modal">
        <h2>${escapeHtml(entry.winner_name)} vs ${escapeHtml(entry.loser_name)}</h2>
        <div class="replay-board-wrapper">
          <div id="replay-board" class="replay-board"></div>
        </div>
        <div class="replay-controls">
          <span id="replay-counter">0 / ${moves.length}</span>
        </div>
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
          ${I18n.t('back_to_lobby')}
        </button>
      </div>
    `;
    document.body.appendChild(overlay);

    // Render empty board
    const replayBoard = document.getElementById('replay-board');
    replayBoard.innerHTML = '';
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
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
        replayBoard.appendChild(cell);
      }
    }

    // Animate moves
    let i = 0;
    const counter = document.getElementById('replay-counter');
    const interval = setInterval(() => {
      if (i >= moves.length || !document.getElementById('replay-board')) {
        clearInterval(interval);
        return;
      }
      const move = moves[i];
      const cell = replayBoard.querySelector(`.cell[data-x="${move.x}"][data-y="${move.y}"]`);
      if (cell) {
        const dot = cell.querySelector('.dot');
        if (dot) dot.remove();
        // Remove previous last-move
        replayBoard.querySelectorAll('.stone.last-move').forEach(el => el.classList.remove('last-move'));
        const stone = document.createElement('div');
        stone.className = `stone ${move.player} last-move`;
        stone.style.animation = 'stone-drop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        cell.appendChild(stone);
      }
      i++;
      if (counter) counter.textContent = `${i} / ${moves.length}`;
    }, 500);
  };

  // Delete entry
  window.hallDelete = async function(id) {
    const storedTokens = JSON.parse(localStorage.getItem('omok_hall_tokens') || '{}');
    const token = storedTokens[id];
    if (!token) return;

    // Verify token matches
    const { data: entry } = await db
      .from('hall_of_fame')
      .select('winner_token')
      .eq('id', id)
      .single();

    if (!entry || entry.winner_token !== token) {
      showToast('Unauthorized');
      return;
    }

    const { error } = await db
      .from('hall_of_fame')
      .delete()
      .eq('id', id);

    if (error) {
      showToast('Delete failed');
      return;
    }

    // Remove token
    delete storedTokens[id];
    localStorage.setItem('omok_hall_tokens', JSON.stringify(storedTokens));

    // Remove from UI
    entries = entries.filter(e => e.id !== id);
    renderEntries();
    showToast('Deleted');
  };
})();
