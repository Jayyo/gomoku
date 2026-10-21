// Renju forbidden move detection
// Forbidden moves (for black only): double-three, double-four, overline (6+)
const Renju = (() => {

  function countLine(x, y, dx, dy, player, board) {
    // Count consecutive stones in one direction
    let count = 0;
    let nx = x + dx, ny = y + dy;
    while (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === player) {
      count++;
      nx += dx;
      ny += dy;
    }
    return count;
  }

  function isOpenEnd(x, y, dx, dy, board) {
    // Check if position is empty (open)
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return false;
    return board[y][x] === null;
  }

  function getLineInfo(x, y, dx, dy, player, board) {
    // Get full line info: count, open ends
    let fwd = 0, bwd = 0;
    let fx = x + dx, fy = y + dy;
    while (fx >= 0 && fx < BOARD_SIZE && fy >= 0 && fy < BOARD_SIZE && board[fy][fx] === player) {
      fwd++;
      fx += dx;
      fy += dy;
    }
    let bx = x - dx, by = y - dy;
    while (bx >= 0 && bx < BOARD_SIZE && by >= 0 && by < BOARD_SIZE && board[by][bx] === player) {
      bwd++;
      bx -= dx;
      by -= dy;
    }

    const total = 1 + fwd + bwd;
    const openFwd = isOpenEnd(fx, fy, 0, 0, board);
    const openBwd = isOpenEnd(bx, by, 0, 0, board);

    return { total, openFwd, openBwd, fwd, bwd };
  }

  function isOverline(x, y, board) {
    // Check if placing black at (x,y) creates 6+ in a row
    const directions = [[1,0],[0,1],[1,1],[1,-1]];
    for (const [dx, dy] of directions) {
      const info = getLineInfo(x, y, dx, dy, 'black', board);
      if (info.total >= 6) return true;
    }
    return false;
  }

  function countOpenThrees(x, y, board) {
    // Count how many open threes are formed by placing black at (x,y)
    const directions = [[1,0],[0,1],[1,1],[1,-1]];
    let threeCount = 0;

    // Temporarily place stone
    board[y][x] = 'black';

    for (const [dx, dy] of directions) {
      if (isOpenThree(x, y, dx, dy, board)) {
        threeCount++;
      }
    }

    board[y][x] = null;
    return threeCount;
  }

  function isOpenThree(x, y, dx, dy, board) {
    // An open three: exactly 3 consecutive with both ends open
    // AND extending it to 4 would create an open four (not forbidden)
    const info = getLineInfo(x, y, dx, dy, 'black', board);
    if (info.total === 3 && info.openFwd && info.openBwd) {
      return true;
    }
    return false;
  }

  function countFours(x, y, board) {
    // Count how many fours are formed
    const directions = [[1,0],[0,1],[1,1],[1,-1]];
    let fourCount = 0;

    board[y][x] = 'black';

    for (const [dx, dy] of directions) {
      const info = getLineInfo(x, y, dx, dy, 'black', board);
      if (info.total === 4) {
        fourCount++;
      }
    }

    board[y][x] = null;
    return fourCount;
  }

  function isForbiddenMove(x, y, board) {
    // Only applies to black
    if (board[y][x] !== null) return false;

    // Temporarily place
    board[y][x] = 'black';

    // Check overline (6+)
    const directions = [[1,0],[0,1],[1,1],[1,-1]];
    for (const [dx, dy] of directions) {
      const info = getLineInfo(x, y, dx, dy, 'black', board);
      if (info.total >= 6) {
        board[y][x] = null;
        return true;
      }
      // Exactly 5 is a win, not forbidden
      if (info.total === 5) {
        board[y][x] = null;
        return false; // Winning move is never forbidden
      }
    }

    // Count open threes (3-3 check)
    let threeCount = 0;
    for (const [dx, dy] of directions) {
      if (isOpenThree(x, y, dx, dy, board)) threeCount++;
    }

    // Count fours (4-4 check)
    let fourCount = 0;
    for (const [dx, dy] of directions) {
      const info = getLineInfo(x, y, dx, dy, 'black', board);
      if (info.total === 4) fourCount++;
    }

    board[y][x] = null;

    if (threeCount >= 2) return true; // Double-three
    if (fourCount >= 2) return true;  // Double-four

    return false;
  }

  function markForbiddenMoves(board) {
    // Remove existing markers
    document.querySelectorAll('.forbidden-marker').forEach(el => el.remove());

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (board[y][x] === null && isForbiddenMove(x, y, board)) {
          const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
          if (cell && !cell.querySelector('.stone')) {
            const marker = document.createElement('div');
            marker.className = 'forbidden-marker';
            marker.textContent = 'X';
            cell.appendChild(marker);
          }
        }
      }
    }
  }

  function clearForbiddenMarkers() {
    document.querySelectorAll('.forbidden-marker').forEach(el => el.remove());
  }

  return { isForbiddenMove, markForbiddenMoves, clearForbiddenMarkers };
})();
