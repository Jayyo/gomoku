// Game rules shared by every mode and by the computer player.
// No DOM access, so the same file runs in the page, in a Web Worker and in Node (tests).
// Board: board[y][x] is null, 'black' or 'white'.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIZE = 15;
  const BLACK = 'black';
  const WHITE = 'white';
  const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  function inside(x, y) {
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
  }

  function at(board, x, y) {
    return inside(x, y) ? board[y][x] : undefined;
  }

  function createBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  function opponent(color) {
    return color === BLACK ? WHITE : BLACK;
  }

  // Length of the run of `color` through (x, y) along (dx, dy). (x, y) must hold `color`.
  function runLength(board, x, y, dx, dy, color) {
    let n = 1;
    while (at(board, x + dx * n, y + dy * n) === color) n++;
    let back = 1;
    while (at(board, x - dx * back, y - dy * back) === color) back++;
    return n + back - 1;
  }

  // Under Renju, Black needs exactly five. Everyone else wins with five or more.
  function isWinningLength(length, color, rules) {
    return rules === 'renju' && color === BLACK ? length === 5 : length >= 5;
  }

  // Coordinates of the winning line through the stone at (x, y), or null.
  function winningLine(board, x, y, rules) {
    const color = at(board, x, y);
    if (!color) return null;
    for (const [dx, dy] of DIRECTIONS) {
      if (!isWinningLength(runLength(board, x, y, dx, dy, color), color, rules)) continue;
      const line = [{ x, y }];
      for (let i = 1; at(board, x + dx * i, y + dy * i) === color; i++) line.push({ x: x + dx * i, y: y + dy * i });
      for (let i = 1; at(board, x - dx * i, y - dy * i) === color; i++) line.unshift({ x: x - dx * i, y: y - dy * i });
      return line;
    }
    return null;
  }

  // Would `color` win by playing (x, y)? Doesn't check whether the move is legal.
  function makesFive(board, x, y, color, rules) {
    if (at(board, x, y) !== null) return false;
    board[y][x] = color;
    let five = false;
    for (const [dx, dy] of DIRECTIONS) {
      if (isWinningLength(runLength(board, x, y, dx, dy, color), color, rules)) {
        five = true;
        break;
      }
    }
    board[y][x] = null;
    return five;
  }

  // ---- Renju forbidden moves (black only) ----
  // Definitions follow the RIF rules:
  //   four          - four black stones that become exactly five with one more stone
  //   straight four - four in a row with an open point at each end, both giving exactly five
  //   three         - stones that become a straight four with one more legal black stone
  // A move is forbidden if it makes an overline, two fours or two threes, unless it makes exactly five.

  // Number of different fours through the black stone at (x, y) along one direction.
  // Fours are told apart by their stones, so ·●●●●· counts once and ●·●●●·● counts twice.
  function foursAlong(board, x, y, dx, dy) {
    const found = new Set();
    for (let start = -4; start <= 0; start++) {
      let blacks = 0;
      let gap = null;
      let valid = true;
      for (let i = start; i < start + 5; i++) {
        const v = at(board, x + dx * i, y + dy * i);
        if (v === BLACK) blacks++;
        else if (v === null && gap === null) gap = i;
        else { valid = false; break; }
      }
      if (!valid || blacks !== 4) continue;
      // Filling the gap has to give exactly five, not six or more
      if (at(board, x + dx * (start - 1), y + dy * (start - 1)) === BLACK) continue;
      if (at(board, x + dx * (start + 5), y + dy * (start + 5)) === BLACK) continue;
      const stones = [];
      for (let i = start; i < start + 5; i++) if (i !== gap) stones.push(i);
      found.add(stones.join(','));
    }
    return found.size;
  }

  // Is the run through the black stone at (x, y) a straight four along (dx, dy)
  // that includes the stone at offset `added`?
  function isStraightFour(board, x, y, dx, dy, added) {
    let lo = 0;
    let hi = 0;
    while (at(board, x + dx * (lo - 1), y + dy * (lo - 1)) === BLACK) lo--;
    while (at(board, x + dx * (hi + 1), y + dy * (hi + 1)) === BLACK) hi++;
    if (hi - lo !== 3 || added < lo || added > hi) return false;
    if (at(board, x + dx * (lo - 1), y + dy * (lo - 1)) !== null) return false;
    if (at(board, x + dx * (hi + 1), y + dy * (hi + 1)) !== null) return false;
    // Each end must complete exactly five
    if (at(board, x + dx * (lo - 2), y + dy * (lo - 2)) === BLACK) return false;
    if (at(board, x + dx * (hi + 2), y + dy * (hi + 2)) === BLACK) return false;
    return true;
  }

  // Does the black stone at (x, y) make a three along (dx, dy)?
  function isThreeAlong(board, x, y, dx, dy) {
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const cx = x + dx * i;
      const cy = y + dy * i;
      if (at(board, cx, cy) !== null) continue;
      board[cy][cx] = BLACK;
      // The new stone has to be part of the straight four: a four that is already
      // on the board is a four, not a three
      const straight = isStraightFour(board, x, y, dx, dy, i);
      board[cy][cx] = null;
      // The stone that makes the straight four must itself be playable
      if (straight && !forbiddenReason(board, cx, cy)) return true;
    }
    return false;
  }

  // Why Black may not play (x, y): 'overline', 'double-four', 'double-three', or null if allowed.
  // The board is left as it was.
  function forbiddenReason(board, x, y) {
    if (at(board, x, y) !== null) return null;
    board[y][x] = BLACK;
    try {
      let longest = 0;
      for (const [dx, dy] of DIRECTIONS) {
        const length = runLength(board, x, y, dx, dy, BLACK);
        if (length === 5) return null;
        longest = Math.max(longest, length);
      }
      if (longest >= 6) return 'overline';

      let fours = 0;
      for (const [dx, dy] of DIRECTIONS) fours += foursAlong(board, x, y, dx, dy);
      if (fours >= 2) return 'double-four';

      let threes = 0;
      for (const [dx, dy] of DIRECTIONS) {
        if (isThreeAlong(board, x, y, dx, dy)) threes++;
      }
      return threes >= 2 ? 'double-three' : null;
    } finally {
      board[y][x] = null;
    }
  }

  function isLegal(board, x, y, color, rules) {
    if (at(board, x, y) !== null) return false;
    return !(rules === 'renju' && color === BLACK && forbiddenReason(board, x, y));
  }

  function hasBlackNearby(board, x, y) {
    for (const [dx, dy] of DIRECTIONS) {
      for (let i = 1; i <= 4; i++) {
        if (at(board, x + dx * i, y + dy * i) === BLACK || at(board, x - dx * i, y - dy * i) === BLACK) return true;
      }
    }
    return false;
  }

  // Every point where Black may not play right now, for the board markers
  function forbiddenPoints(board) {
    const points = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (board[y][x] !== null || !hasBlackNearby(board, x, y)) continue;
        const reason = forbiddenReason(board, x, y);
        if (reason) points.push({ x, y, reason });
      }
    }
    return points;
  }

  return {
    SIZE,
    BLACK,
    WHITE,
    DIRECTIONS,
    createBoard,
    opponent,
    inside,
    runLength,
    winningLine,
    makesFive,
    forbiddenReason,
    forbiddenPoints,
    isLegal,
  };
});
