// Draws the small example boards on the rules page.
// data-rows holds one string per row: b = black, w = white, x = forbidden point, . = empty
document.querySelectorAll('.mini-board[data-rows]').forEach((boardEl) => {
  const rows = boardEl.dataset.rows.trim().split(/\s+/);
  boardEl.style.gridTemplateColumns = `repeat(${rows[0].length}, 22px)`;

  rows.forEach((row) => {
    for (const ch of row) {
      const cell = document.createElement('div');
      cell.className = 'mini-cell';
      if (ch === 'b' || ch === 'w') {
        const stone = document.createElement('div');
        stone.className = `mini-stone ${ch === 'b' ? 'black' : 'white'}`;
        cell.appendChild(stone);
      } else if (ch === 'x') {
        const mark = document.createElement('span');
        mark.className = 'mini-mark';
        mark.textContent = '✕';
        cell.appendChild(mark);
      }
      boardEl.appendChild(cell);
    }
  });
});
