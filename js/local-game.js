// Offline games on one device: pass-and-play, or against the computer (js/ai.js).
// Nothing here talks to the server.
const LocalGame = (() => {
  const LEVELS = ['easy', 'normal', 'hard'];
  const MIN_THINK_MS = 350;

  let mode = 'local';
  let rules = 'freestyle';
  let level = 'normal';
  let humanColor = 'black';
  let board = createEmptyBoard();
  let history = [];
  let result = null; // null while playing, then { winner } (winner null for a draw)
  let thinking = false;
  let request = 0; // bumped on restart/undo so a late computer move is ignored

  let worker; // undefined until first use, null if workers are unavailable
  let jobId = 0;

  function start(params) {
    mode = params.get('mode') === 'ai' ? 'ai' : 'local';
    rules = params.get('rules') === 'renju' ? 'renju' : 'freestyle';
    level = LEVELS.includes(params.get('level')) ? params.get('level') : 'normal';
    humanColor = params.get('color') === 'white' ? 'white' : 'black';

    document.getElementById('local-controls').classList.remove('hidden');
    document.getElementById('bet-display').remove();
    document.getElementById('taunt-panel').remove();
    document.getElementById('undo-btn').addEventListener('click', undo);
    document.getElementById('restart-btn').addEventListener('click', restart);
    document.getElementById('leave-btn').addEventListener('click', () => {
      window.location.href = 'index.html';
    });
    document.addEventListener('langchange', updatePanel);

    restart();
  }

  function toMove() {
    return history.length % 2 === 0 ? 'black' : 'white';
  }

  function isHumanTurn() {
    return mode === 'local' || toMove() === humanColor;
  }

  function restart() {
    request++;
    thinking = false;
    board = createEmptyBoard();
    history = [];
    result = null;
    closeResult();
    redraw();
    afterMove();
  }

  function redraw() {
    const svg = document.getElementById('win-line-svg');
    if (svg) svg.remove();
    renderBoard(document.getElementById('board'), onCellClick, onHoverEnter, removeHoverPreview);
    history.forEach((m, i) => placeStoneVisual(m.x, m.y, m.color, i === history.length - 1));
  }

  function onCellClick(x, y) {
    if (result || thinking || !isHumanTurn() || board[y][x]) return;
    const color = toMove();
    if (rules === 'renju' && color === 'black') {
      const reason = Rules.forbiddenReason(board, x, y);
      if (reason) {
        showToast(forbiddenMessage(reason));
        return;
      }
    }
    play(x, y, color);
  }

  function onHoverEnter(cell, x, y) {
    if (result || thinking || !isHumanTurn() || board[y][x]) return;
    if (cell.querySelector('.forbidden-marker')) return;
    showHoverPreview(cell, x, y, board, toMove(), true);
  }

  function play(x, y, color) {
    board[y][x] = color;
    history.push({ x, y, color });
    document.querySelectorAll('.stone.last-move').forEach(el => el.classList.remove('last-move'));
    placeStoneVisual(x, y, color, true);
    Sound.playStone();
    applyImpactEffects(x, y, color, board);

    const line = Rules.winningLine(board, x, y, rules);
    if (line) finish(color, line);
    else if (history.length === BOARD_SIZE * BOARD_SIZE) finish(null, null);
    else afterMove();
  }

  function afterMove() {
    clearForbiddenMarkers();
    updatePanel();
    if (result) return;
    if (rules === 'renju' && toMove() === 'black' && isHumanTurn()) showForbiddenMarkers(board);
    if (!isHumanTurn()) computerTurn();
  }

  async function computerTurn() {
    const id = ++request;
    thinking = true;
    updatePanel();
    const started = Date.now();
    const move = await think(toMove());
    const left = MIN_THINK_MS - (Date.now() - started);
    if (left > 0) await new Promise(resolve => setTimeout(resolve, left));
    if (id !== request) return;
    thinking = false;
    if (move) play(move.x, move.y, toMove());
    else finish(null, null);
  }

  // Ask the worker for a move; fall back to the main thread if workers can't run (e.g. file://)
  function think(color) {
    const job = { board: board.map(row => row.slice()), color, rules, level };
    const direct = () => GomokuAI.chooseMove(job.board, color, { rules, level });

    if (worker === undefined) {
      try {
        worker = new Worker('js/ai-worker.js');
      } catch (e) {
        worker = null;
      }
    }
    if (!worker) return new Promise(resolve => setTimeout(() => resolve(direct()), 0));

    const w = worker;
    const id = ++jobId;
    return new Promise((resolve) => {
      const done = (move) => {
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
        resolve(move);
      };
      const onMessage = (e) => {
        if (e.data.id === id) done(e.data.move);
      };
      const onError = (e) => {
        if (e.preventDefault) e.preventDefault();
        w.terminate();
        worker = null;
        done(direct());
      };
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      w.postMessage({ id, ...job });
    });
  }

  function undo() {
    if (!canUndo()) return;
    request++;
    thinking = false;
    if (mode === 'local') {
      history.pop();
    } else {
      // Take back the computer's reply too, so it is the player's turn again
      while (history.length) {
        const last = history.pop();
        if (last.color === humanColor) break;
      }
    }
    board = createEmptyBoard();
    history.forEach(m => { board[m.y][m.x] = m.color; });
    result = null;
    closeResult();
    redraw();
    afterMove();
  }

  function canUndo() {
    return mode === 'local' ? history.length > 0 : history.some(m => m.color === humanColor);
  }

  function finish(winner, line) {
    result = { winner };
    thinking = false;
    clearForbiddenMarkers();
    updatePanel();
    if (line) drawWinLine(line);

    const humanWon = mode === 'local' ? winner !== null : winner === humanColor;
    if (winner && humanWon) {
      Sound.playWin();
      if (mode === 'ai') showConfetti();
    } else if (winner) {
      Sound.playLose();
    }
    // Let the winning line show before the dialog covers the board
    setTimeout(() => {
      if (result) showResult(winner);
    }, line ? 900 : 0);
  }

  function resultTitle(winner) {
    if (!winner) return I18n.t('draw');
    if (mode === 'ai') return I18n.t(winner === humanColor ? 'you_win' : 'computer_wins');
    return I18n.t(winner === 'black' ? 'black_wins' : 'white_wins');
  }

  function showResult(winner) {
    closeResult();
    const humanLost = mode === 'ai' && winner && winner !== humanColor;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'result-modal';

    const modal = document.createElement('div');
    modal.className = `modal ${winner ? (humanLost ? 'defeat-modal' : 'victory-modal') : ''}`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const title = document.createElement('h2');
    title.className = winner ? (humanLost ? 'defeat-text' : 'victory-text') : '';
    title.textContent = resultTitle(winner);
    const detail = document.createElement('p');
    detail.className = 'result';
    detail.textContent = winner ? I18n.t('moves_played').replace('{n}', history.length) : I18n.t('board_full');

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const again = button(I18n.t('play_again'), 'btn btn-primary btn-glow', restart);
    actions.append(
      again,
      button(I18n.t('view_board'), 'btn btn-secondary', closeResult),
      button(I18n.t('back_to_lobby'), 'btn btn-secondary', () => { window.location.href = 'index.html'; })
    );

    modal.append(title, detail, actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    again.focus();
  }

  function button(label, className, onClick) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  }

  function closeResult() {
    const modal = document.getElementById('result-modal');
    if (modal) modal.remove();
  }

  function playerLabel(color) {
    if (mode === 'local') return I18n.t(color);
    if (color === humanColor) return I18n.t('you');
    return `${I18n.t('computer')} · ${I18n.t('level_' + level)}`;
  }

  function updatePanel() {
    const badge = document.getElementById('rules-badge');
    badge.textContent = rules === 'renju' ? I18n.t('renju') : I18n.t('freestyle');
    badge.className = `rules-badge ${rules}`;
    document.getElementById('black-name').textContent = playerLabel('black');
    document.getElementById('white-name').textContent = playerLabel('white');

    const turn = toMove();
    document.getElementById('black-info').classList.toggle('active', !result && turn === 'black');
    document.getElementById('white-info').classList.toggle('active', !result && turn === 'white');

    const indicator = document.getElementById('turn-indicator');
    if (result) {
      indicator.className = 'turn-indicator';
      indicator.textContent = resultTitle(result.winner);
    } else if (mode === 'ai') {
      indicator.className = `turn-indicator ${thinking ? 'opponent-turn' : 'my-turn'}`;
      indicator.textContent = I18n.t(thinking ? 'thinking' : 'your_turn');
    } else {
      indicator.className = `turn-indicator ${turn}-turn`;
      indicator.textContent = I18n.t(turn === 'black' ? 'black_to_move' : 'white_to_move');
    }
    document.getElementById('undo-btn').disabled = !canUndo();
  }

  return { start };
})();
