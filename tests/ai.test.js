const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../js/rules.js');
const AI = require('../js/ai.js');
const { parse, clone } = require('./helpers.js');

function seeded(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

function move(board, color, rules, level = 'normal') {
  const before = JSON.stringify(board);
  const m = AI.chooseMove(board, color, { rules, level, random: seeded(1) });
  assert.equal(JSON.stringify(board), before, 'chooseMove must not change the board');
  return m;
}

test('opens in the center', () => {
  assert.deepEqual(move(Rules.createBoard(), 'black', 'freestyle'), { x: 7, y: 7 });
});

test('completes its own five before blocking', () => {
  const { board } = parse([
    '.bbbb..',
    '.......',
    '.wwww..',
  ]);
  for (const level of ['easy', 'normal', 'hard']) {
    const m = move(board, 'black', 'freestyle', level);
    assert.ok(Rules.makesFive(board, m.x, m.y, 'black', 'freestyle'), level);
  }
});

test('blocks a four', () => {
  const { board } = parse([
    '.wwww..',
    '.......',
    '...b...',
    '..b....',
  ]);
  for (const level of ['easy', 'normal', 'hard']) {
    const m = move(board, 'black', 'freestyle', level);
    assert.ok(Rules.makesFive(board, m.x, m.y, 'white', 'freestyle'), level);
  }
});

test('answers an open three', () => {
  const { board } = parse([
    '.......',
    '..www..',
    '.......',
    '...b...',
    '..b....',
  ]);
  for (const level of ['normal', 'hard']) {
    const m = move(board, 'black', 'freestyle', level);
    const after = clone(board);
    after[m.y][m.x] = 'black';
    // White must not be able to make an open four any more
    let openFour = false;
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        if (after[y][x] !== null) continue;
        after[y][x] = 'white';
        let points = 0;
        for (let yy = 0; yy < 15; yy++) {
          for (let xx = 0; xx < 15; xx++) {
            if (Rules.makesFive(after, xx, yy, 'white', 'freestyle')) points++;
          }
        }
        after[y][x] = null;
        if (points >= 2) openFour = true;
      }
    }
    assert.equal(openFour, false, level);
  }
});

test('finds a four-three win', () => {
  // Black to move: (8,7) makes a four across and an open three down
  const { board } = parse([
    '.......',
    '.......',
    '....b..',
    '....b..',
    'wbbb...',
    '.......',
    '.......',
  ], 4, 3);
  const m = AI.findVcf(board, 'black', 'freestyle', 8, 2000, Date.now() + 2000);
  assert.deepEqual(m, { x: 8, y: 7 });
  assert.deepEqual(move(board, 'black', 'freestyle', 'normal'), { x: 8, y: 7 });
});

test('never plays a forbidden point as Black under Renju', () => {
  // (7,7) would be a double three for Black and is the obvious attacking move
  const { board } = parse([
    '.......',
    '...b...',
    '...b...',
    '.bb....',
    '.......',
    'w.w.w..',
  ]);
  assert.equal(Rules.forbiddenReason(board, 7, 7), 'double-three');
  for (const level of ['easy', 'normal', 'hard']) {
    const m = move(board, 'black', 'renju', level);
    assert.notDeepEqual(m, { x: 7, y: 7 }, level);
    assert.ok(Rules.isLegal(board, m.x, m.y, 'black', 'renju'), level);
  }
});

test('plays complete legal games against itself', () => {
  for (const rules of ['freestyle', 'renju']) {
    const board = Rules.createBoard();
    const random = seeded(rules.length);
    let color = 'black';
    let winner = null;
    let moves = 0;
    while (!winner && moves < 225) {
      const m = AI.chooseMove(board, color, { rules, level: 'normal', random });
      if (!m) break;
      assert.ok(Rules.isLegal(board, m.x, m.y, color, rules), `${rules}: illegal move ${m.x},${m.y}`);
      board[m.y][m.x] = color;
      moves++;
      if (Rules.winningLine(board, m.x, m.y, rules)) winner = color;
      color = Rules.opponent(color);
    }
    assert.ok(moves > 5);
  }
});

test('returns null when the board is full', () => {
  const board = Rules.createBoard().map((row, y) => row.map((_, x) => ((x + (y % 2) * 2) % 4 < 2 ? 'black' : 'white')));
  assert.equal(AI.chooseMove(board, 'black', { rules: 'freestyle' }), null);
});
