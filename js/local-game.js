// Local play mode for MOKU.IO - no Supabase needed
(function() {
  let board = createEmptyBoard();
  let currentTurn = 'black';
  let moveCount = 0;
  let gameOver = false;
  let rulesType = 'freestyle'; // 'freestyle' or 'renju'

  function init() {
    // Get rules from URL params
    const params = new URLSearchParams(window.location.search);
    rulesType = params.get('rules') || 'freestyle';

    const boardEl = document.getElementById('board');
    renderBoard(boardEl, handleCellClick, onHoverEnter, onHoverLeave);
    updateUI();

    // Restart button
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', restart);
    }

    // Rules display
    const rulesDisplay = document.getElementById('rules-display');
    if (rulesDisplay) {
      rulesDisplay.textContent = rulesType === 'renju' ? I18n.t('renju_pro') : I18n.t('freestyle');
    }

    // Show forbidden moves for renju
    if (rulesType === 'renju' && currentTurn === 'black') {
      Renju.markForbiddenMoves(board);
    }
  }

  // Run immediately if DOM already loaded (dynamic script injection), otherwise wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function handleCellClick(x, y) {
    if (gameOver) return;
    if (board[y][x]) return;

    // Renju check
    if (rulesType === 'renju' && currentTurn === 'black') {
      if (Renju.isForbiddenMove(x, y, board)) {
        showToast(I18n.t('forbidden_move'));
        return;
      }
    }

    board[y][x] = currentTurn;
    moveCount++;

    document.querySelectorAll('.stone.last-move').forEach(el => el.classList.remove('last-move'));
    placeStoneVisual(x, y, currentTurn, true);
    Sound.playStone();

    const winCoords = checkWinWithCoords(x, y, currentTurn, board);
    if (winCoords) {
      gameOver = true;
      drawWinLine(winCoords);
      showLocalWinModal(currentTurn);
      Sound.playWin();
      if (rulesType === 'renju') Renju.clearForbiddenMarkers();
      return;
    }

    if (moveCount >= BOARD_SIZE * BOARD_SIZE) {
      gameOver = true;
      showLocalWinModal(null);
      return;
    }

    currentTurn = currentTurn === 'black' ? 'white' : 'black';
    updateUI();

    // Update forbidden moves for renju
    if (rulesType === 'renju') {
      Renju.clearForbiddenMarkers();
      if (currentTurn === 'black') {
        Renju.markForbiddenMoves(board);
      }
    }
  }

  function onHoverEnter(cell, x, y) {
    if (gameOver || board[y][x]) return;
    const preview = document.createElement('div');
    preview.className = `hover-preview ${currentTurn}`;
    cell.appendChild(preview);
  }

  function onHoverLeave(cell) {
    removeHoverPreview(cell);
  }

  function updateUI() {
    const blackInfo = document.getElementById('black-info');
    const whiteInfo = document.getElementById('white-info');
    const turnIndicator = document.getElementById('turn-indicator');

    if (blackInfo) blackInfo.classList.toggle('active', currentTurn === 'black' && !gameOver);
    if (whiteInfo) whiteInfo.classList.toggle('active', currentTurn === 'white' && !gameOver);

    if (turnIndicator && !gameOver) {
      turnIndicator.className = 'turn-indicator';
      turnIndicator.classList.add(currentTurn === 'black' ? 'black-turn' : 'white-turn');
      turnIndicator.textContent = `${currentTurn === 'black' ? I18n.t('black') : I18n.t('white')} - ${I18n.t('your_turn')}`;
    }
  }

  function showLocalWinModal(winner) {
    let title, subtitle;
    if (!winner) {
      title = I18n.t('draw');
      subtitle = I18n.t('board_full');
    } else {
      title = (winner === 'black' ? I18n.t('black') : I18n.t('white')) + ' ' + I18n.t('victory');
      subtitle = I18n.t('congratulations');
    }

    const overlay = document.createElement('div');
    overlay.className = `modal-overlay ${winner ? (winner === 'black' ? 'win-black' : 'win-white') : ''}`;
    overlay.innerHTML = `
      <div class="modal ${winner ? 'victory-modal' : ''}">
        <h2 class="${winner ? 'victory-text' : ''}">${title}</h2>
        <p class="result">${subtitle}</p>
        <div class="modal-actions">
          <button class="btn btn-primary btn-glow" onclick="location.reload()">
            ${I18n.t('restart')}
          </button>
          <button class="btn btn-secondary" onclick="window.location.href='index.html'">
            ${I18n.t('back_to_lobby')}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function restart() {
    board = createEmptyBoard();
    currentTurn = 'black';
    moveCount = 0;
    gameOver = false;

    // Remove win line
    const svg = document.getElementById('win-line-svg');
    if (svg) svg.remove();

    // Remove modal
    const modal = document.querySelector('.modal-overlay');
    if (modal) modal.remove();

    // Re-render board
    const boardEl = document.getElementById('board');
    renderBoard(boardEl, handleCellClick, onHoverEnter, onHoverLeave);
    updateUI();

    if (rulesType === 'renju') {
      Renju.markForbiddenMoves(board);
    }
  }

  // Expose restart globally
  window.restartLocalGame = restart;
})();
