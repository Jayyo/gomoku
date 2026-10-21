const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../js/rules.js');
const { parse, SYMMETRIES, transform, clone } = require('./helpers.js');

// Each case is checked in all 8 orientations of the board
function expectReason(rows, expected, offset = [4, 4]) {
  const { board, target } = parse(rows, offset[0], offset[1]);
  for (const fn of SYMMETRIES) {
    const t = transform(board, target, fn);
    const before = JSON.stringify(t.board);
    assert.equal(Rules.forbiddenReason(t.board, t.target.x, t.target.y), expected, rows.join('\n'));
    assert.equal(JSON.stringify(t.board), before, 'board must not change');
  }
}

test('double three, including split threes', () => {
  expectReason([
    '.......',
    '...b...',
    '...b...',
    '.bb*...',
    '.......',
  ], 'double-three');
  expectReason([
    '.........',
    '....b....',
    '....b....',
    '.b.b*....',
    '.........',
  ], 'double-three');
  expectReason([
    '........',
    '...b....',
    '........',
    '...b....',
    '.bb*....',
    '........',
  ], 'double-three');
});

test('blocked or dead threes do not count', () => {
  // w.bb*.w can never become a straight four
  expectReason([
    '.........',
    '....b....',
    '....b....',
    'w.bb*.w..',
    '.........',
  ], null);
  // wbb*.. is blocked on one side
  expectReason([
    '.........',
    '...b.....',
    '...b.....',
    'wbb*.....',
    '.........',
  ], null);
  // three against the edge of the board
  expectReason([
    '.....',
    '..b..',
    '..b..',
    'bb*..',
    '.....',
  ], null, [0, 4]);
});

test('double four, also on a single line', () => {
  expectReason([
    '....w....',
    '....b....',
    '....b....',
    '....b....',
    'wbbb*....',
    '.........',
  ], 'double-four');
  expectReason(['.b.b*b.b.'], 'double-four');
  expectReason(['.bb.*b.bb.'], 'double-four');
  // split fours combined with another four
  expectReason([
    '...w..',
    '...b..',
    '...b..',
    '...b..',
    'bb.*b.',
    '......',
  ], 'double-four');
  expectReason([
    '....w.',
    '....b.',
    '....b.',
    '....b.',
    'b.bb*.',
    '......',
  ], 'double-four');
});

test('a dead four is not a four', () => {
  // wbbb*w cannot become five, so only the vertical four remains
  expectReason([
    '....w..',
    '....b..',
    '....b..',
    '....b..',
    'wbbb*w.',
    '.......',
  ], null);
});

test('overline', () => {
  expectReason(['.bbb*bb.'], 'overline');
  expectReason(['.b*bbbb.'], 'overline');
});

test('exactly five wins even with a forbidden shape', () => {
  // five across, overline down
  expectReason([
    '...b...',
    '...b...',
    '...b...',
    'bbb*b..',
    '...b...',
    '...b...',
  ], null);
  // five across plus a double three
  expectReason([
    '.......',
    '...b...',
    '...b...',
    'bbb*b..',
    '..b....',
    '.b.....',
  ], null);
});

test('four-three is allowed', () => {
  expectReason([
    '.........',
    '....b....',
    '....b....',
    'wbbb*....',
    '.........',
  ], null);
});

test('a three whose only extensions are forbidden is not a three', () => {
  const board = Rules.createBoard();
  const put = (x, y) => { board[y][x] = 'black'; };
  // horizontal three through (8,7) and a real vertical three through it
  put(6, 7); put(7, 7);
  put(8, 5); put(8, 6);
  assert.equal(Rules.forbiddenReason(board, 8, 7), 'double-three');

  // make both extension points of the horizontal three overlines
  for (const y of [4, 5, 6, 8, 9]) { put(5, y); put(9, y); }
  assert.equal(Rules.forbiddenReason(board, 5, 7), 'overline');
  assert.equal(Rules.forbiddenReason(board, 9, 7), 'overline');
  assert.equal(Rules.forbiddenReason(board, 8, 7), null);
});

test('white is never restricted', () => {
  const { board, target } = parse(['.bbb*bb.']);
  assert.equal(Rules.isLegal(board, target.x, target.y, 'white', 'renju'), true);
  assert.equal(Rules.isLegal(board, target.x, target.y, 'black', 'renju'), false);
  assert.equal(Rules.isLegal(board, target.x, target.y, 'black', 'freestyle'), true);
});

test('winning lines', () => {
  const { board } = parse(['bbbbbb']);
  const six = clone(board);
  assert.equal(Rules.winningLine(six, 4, 4, 'freestyle').length, 6);
  assert.equal(Rules.winningLine(six, 4, 4, 'renju'), null);

  const white = parse(['wwwwww']).board;
  assert.equal(Rules.winningLine(white, 6, 4, 'renju').length, 6);

  const five = parse(['.bbbbb.']).board;
  assert.deepEqual(Rules.winningLine(five, 7, 4, 'renju').map(p => p.x), [5, 6, 7, 8, 9]);
  assert.equal(Rules.makesFive(parse(['.bbbb..']).board, 9, 4, 'black', 'renju'), true);
  assert.equal(Rules.makesFive(parse(['.bbbb.b']).board, 9, 4, 'black', 'renju'), false);
  assert.equal(Rules.makesFive(parse(['.bbbb.b']).board, 9, 4, 'black', 'freestyle'), true);
});

test('forbiddenPoints lists every forbidden point', () => {
  const { board } = parse([
    '.......',
    '...b...',
    '...b...',
    '.bb....',
    '.......',
  ]);
  const points = Rules.forbiddenPoints(board);
  assert.deepEqual(points, [{ x: 7, y: 7, reason: 'double-three' }]);
  assert.deepEqual(Rules.forbiddenPoints(Rules.createBoard()), []);
});

// Slow reference for fours, written differently from the window scan in rules.js:
// try every empty point on the line and see whether it completes exactly five through (x, y).
function referenceFours(board, x, y) {
  let total = 0;
  for (const [dx, dy] of Rules.DIRECTIONS) {
    const keys = new Set();
    for (let i = -4; i <= 4; i++) {
      const ex = x + dx * i;
      const ey = y + dy * i;
      if (!Rules.inside(ex, ey) || board[ey][ex] !== null) continue;
      board[ey][ex] = 'black';
      const run = [];
      for (let k = -5; k <= 5; k++) {
        const px = ex + dx * k;
        const py = ey + dy * k;
        if (Rules.inside(px, py) && board[py][px] === 'black') run.push(k);
        else if (k < 0) run.length = 0;
        else break;
      }
      board[ey][ex] = null;
      if (run.length !== 5 || !run.includes(-i)) continue;
      keys.add(run.filter(k => k !== 0).map(k => k + i).join(','));
    }
    total += keys.size;
  }
  return total;
}

test('four counting matches a brute-force reference on random boards', () => {
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let checked = 0;
  for (let game = 0; game < 300; game++) {
    const board = Rules.createBoard();
    const stones = 20 + Math.floor(random() * 40);
    for (let s = 0; s < stones; s++) {
      const x = 3 + Math.floor(random() * 9);
      const y = 3 + Math.floor(random() * 9);
      if (!board[y][x]) board[y][x] = random() < 0.6 ? 'black' : 'white';
    }
    for (let y = 0; y < Rules.SIZE; y++) {
      for (let x = 0; x < Rules.SIZE; x++) {
        if (board[y][x] !== null) continue;
        board[y][x] = 'black';
        const hasFive = Rules.winningLine(board, x, y, 'renju') !== null;
        const overline = Rules.DIRECTIONS.some(([dx, dy]) => Rules.runLength(board, x, y, dx, dy, 'black') >= 6);
        const fours = referenceFours(board, x, y);
        board[y][x] = null;
        const reason = Rules.forbiddenReason(board, x, y);
        if (hasFive) assert.equal(reason, null);
        else if (overline) assert.equal(reason, 'overline');
        else if (fours >= 2) assert.equal(reason, 'double-four');
        else assert.notEqual(reason, 'double-four');
        checked++;
      }
    }
  }
  assert.ok(checked > 10000);
});
