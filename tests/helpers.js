// Test helpers: build boards from small text diagrams.
// 'b' = black, 'w' = white, '.' = empty, '*' = empty point under test.
const Rules = require('../js/rules.js');

function parse(rows, ox = 4, oy = 4) {
  const board = Rules.createBoard();
  let target = null;
  rows.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      const x = ox + dx;
      const y = oy + dy;
      if (ch === 'b') board[y][x] = 'black';
      else if (ch === 'w') board[y][x] = 'white';
      else if (ch === '*') target = { x, y };
    });
  });
  return { board, target };
}

// The 8 rotations/reflections of the board
const N = Rules.SIZE - 1;
const SYMMETRIES = [
  (x, y) => [x, y],
  (x, y) => [N - y, x],
  (x, y) => [N - x, N - y],
  (x, y) => [y, N - x],
  (x, y) => [N - x, y],
  (x, y) => [x, N - y],
  (x, y) => [y, x],
  (x, y) => [N - y, N - x],
];

function transform(board, point, fn) {
  const out = Rules.createBoard();
  for (let y = 0; y <= N; y++) {
    for (let x = 0; x <= N; x++) {
      if (board[y][x]) {
        const [tx, ty] = fn(x, y);
        out[ty][tx] = board[y][x];
      }
    }
  }
  const [px, py] = fn(point.x, point.y);
  return { board: out, target: { x: px, y: py } };
}

function clone(board) {
  return board.map(row => row.slice());
}

module.exports = { parse, SYMMETRIES, transform, clone };
