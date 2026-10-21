// Computer player. Pure functions over the same board format as rules.js,
// so it runs in a Web Worker, on the main thread as a fallback, and in Node tests.
//
// How it picks a move, in order:
//   1. win now, or block the opponent's five
//   2. look for a forced win made only of fours (VCF)
//   3. if the opponent threatens an open four / double threat next move, only consider moves that stop it
//   4. otherwise score every nearby point by the shapes it makes for both sides
// Shapes along a line are classified from an 11-cell window and cached, so scoring a point is cheap.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.GomokuAI = factory(root.Rules);
})(typeof self !== 'undefined' ? self : this, function (Rules) {
  'use strict';

  const SIZE = Rules.SIZE;
  const DIRS = Rules.DIRECTIONS;

  const LEVELS = {
    easy: { vcfDepth: 0, vcfNodes: 0, ignoreThreat: 0.5, pickFrom: 5, checkOpponentVcf: false, lookahead: 0 },
    normal: { vcfDepth: 8, vcfNodes: 4000, ignoreThreat: 0, pickFrom: 1, checkOpponentVcf: false, lookahead: 0 },
    hard: { vcfDepth: 14, vcfNodes: 20000, vctDepth: 4, vctNodes: 1500, ignoreThreat: 0, pickFrom: 1, checkOpponentVcf: true, lookahead: 8 },
  };

  // ---- line shapes ----
  const NONE = 0, TWO = 1, OPEN_TWO = 2, THREE = 3, OPEN_THREE = 4, FOUR = 5, OPEN_FOUR = 6, FIVE = 7, OVERLINE = 8;
  const WINDOW = 11; // cells -5..+5 around the move
  const POW3 = [1];
  for (let i = 1; i <= WINDOW; i++) POW3.push(POW3[i - 1] * 3);
  // cell codes: 0 empty, 1 own stone, 2 opponent stone or off the board
  const shapeCache = { exact: new Int8Array(POW3[WINDOW]).fill(-1), free: new Int8Array(POW3[WINDOW]).fill(-1) };

  function runBounds(cells, i) {
    let lo = i;
    let hi = i;
    while (lo > 0 && cells[lo - 1] === 1) lo--;
    while (hi < WINDOW - 1 && cells[hi + 1] === 1) hi++;
    return [lo, hi];
  }

  // Empty cells where one more own stone makes five through the center
  function fivePoints(cells, exact) {
    let count = 0;
    for (let j = 0; j < WINDOW; j++) {
      if (cells[j] !== 0) continue;
      cells[j] = 1;
      const [lo, hi] = runBounds(cells, j);
      const n = hi - lo + 1;
      if (lo <= 5 && hi >= 5 && (exact ? n === 5 : n >= 5)) count++;
      cells[j] = 0;
    }
    return count;
  }

  function classify(cells, exact) {
    const [lo, hi] = runBounds(cells, 5);
    const n = hi - lo + 1;
    if (exact ? n === 5 : n >= 5) return FIVE;
    if (n > 5) return OVERLINE;
    const fives = fivePoints(cells, exact);
    if (fives >= 2) return OPEN_FOUR;
    if (fives === 1) return FOUR;

    let best = NONE;
    for (let j = 0; j < WINDOW && best < OPEN_THREE; j++) {
      if (cells[j] !== 0) continue;
      cells[j] = 1;
      const f = fivePoints(cells, exact);
      if (f >= 2) best = OPEN_THREE;
      else if (f === 1 && best < THREE) best = THREE;
      cells[j] = 0;
    }
    if (best !== NONE) return best;

    for (let j = 0; j < WINDOW && best < OPEN_TWO; j++) {
      if (cells[j] !== 0) continue;
      cells[j] = 1;
      for (let k = j + 1; k < WINDOW && best < OPEN_TWO; k++) {
        if (cells[k] !== 0) continue;
        cells[k] = 1;
        const f = fivePoints(cells, exact);
        if (f >= 2) best = OPEN_TWO;
        else if (f === 1) best = TWO;
        cells[k] = 0;
      }
      cells[j] = 0;
    }
    return best;
  }

  function lineIndex(board, x, y, dx, dy, color) {
    let index = 0;
    for (let k = -5; k <= 5; k++) {
      let code = 1;
      if (k !== 0) {
        const px = x + dx * k;
        const py = y + dy * k;
        if (px < 0 || px >= SIZE || py < 0 || py >= SIZE) code = 2;
        else {
          const v = board[py][px];
          code = v === null ? 0 : v === color ? 1 : 2;
        }
      }
      index += code * POW3[k + 5];
    }
    return index;
  }

  function lineShape(board, x, y, dx, dy, color, exact) {
    const index = lineIndex(board, x, y, dx, dy, color);
    const cache = exact ? shapeCache.exact : shapeCache.free;
    if (cache[index] < 0) {
      const cells = [];
      let rest = index;
      for (let i = 0; i < WINDOW; i++) {
        cells.push(rest % 3);
        rest = Math.floor(rest / 3);
      }
      cache[index] = classify(cells, exact);
    }
    return cache[index];
  }

  // ---- scoring a point ----
  function isExact(color, rules) {
    return rules === 'renju' && color === Rules.BLACK;
  }

  function shapesAt(board, x, y, color, rules) {
    const exact = isExact(color, rules);
    const counts = new Array(9).fill(0);
    for (const [dx, dy] of DIRS) counts[lineShape(board, x, y, dx, dy, color, exact)]++;
    return counts;
  }

  // A move that wins by force next turn unless the opponent has a five of their own
  function isDoubleThreat(c) {
    return c[OPEN_FOUR] > 0 || c[FOUR] >= 2 || (c[FOUR] > 0 && c[OPEN_THREE] > 0) || c[OPEN_THREE] >= 2;
  }

  function mightBeForbidden(c) {
    return c[OVERLINE] > 0 || c[OPEN_FOUR] > 0 || c[FOUR] >= 2 || c[OPEN_THREE] >= 2;
  }

  function legalWithShapes(board, x, y, color, rules, counts) {
    if (!isExact(color, rules) || !mightBeForbidden(counts)) return true;
    return !Rules.forbiddenReason(board, x, y);
  }

  function shapeScore(c) {
    if (c[FIVE]) return 1e8;
    let s = 0;
    if (c[OPEN_FOUR] > 0 || c[FOUR] >= 2) s += 1e7;
    else if (c[FOUR] > 0 && c[OPEN_THREE] > 0) s += 5e6;
    else if (c[OPEN_THREE] >= 2) s += 1e6;
    else if (c[FOUR] + c[OPEN_THREE] > 0 && c[OPEN_TWO] + c[THREE] > 0) s += 3000;
    else if (c[OPEN_TWO] >= 2) s += 500;
    s += c[FOUR] * 2500 + c[OPEN_THREE] * 1200 + c[THREE] * 200 + c[OPEN_TWO] * 120 + c[TWO] * 25;
    return s;
  }

  // Value of (x, y) for `color`; 0 if the move would be illegal for them
  function pointValue(board, x, y, color, rules) {
    const counts = shapesAt(board, x, y, color, rules);
    if (!legalWithShapes(board, x, y, color, rules, counts)) return { value: 0, counts, legal: false };
    return { value: shapeScore(counts), counts, legal: true };
  }

  // ---- board helpers ----
  function candidates(board, radius) {
    const mark = new Uint8Array(SIZE * SIZE);
    const list = [];
    let stones = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (board[y][x] === null) continue;
        stones++;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE || board[ny][nx] !== null) continue;
            const key = ny * SIZE + nx;
            if (!mark[key]) {
              mark[key] = 1;
              list.push({ x: nx, y: ny });
            }
          }
        }
      }
    }
    if (stones === 0) list.push({ x: SIZE >> 1, y: SIZE >> 1 });
    return list;
  }

  function touching(board, x, y) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && Rules.inside(x + dx, y + dy) && board[y + dy][x + dx] !== null) n++;
      }
    }
    return n;
  }

  function fivePointsFor(board, color, rules) {
    return candidates(board, 1).filter(p => Rules.makesFive(board, p.x, p.y, color, rules));
  }

  // Points where `color` makes five, on the lines through (x, y) only
  function fivePointsThrough(board, x, y, color, rules) {
    const found = [];
    for (const [dx, dy] of DIRS) {
      for (let i = -4; i <= 4; i++) {
        if (i === 0) continue;
        const px = x + dx * i;
        const py = y + dy * i;
        if (!Rules.inside(px, py) || board[py][px] !== null) continue;
        if (found.some(p => p.x === px && p.y === py)) continue;
        if (Rules.makesFive(board, px, py, color, rules)) found.push({ x: px, y: py });
      }
    }
    return found;
  }

  // ---- forced wins with fours (VCF) ----
  function fourMoves(board, color, rules) {
    const moves = [];
    for (const p of candidates(board, 2)) {
      const counts = shapesAt(board, p.x, p.y, color, rules);
      if (!counts[FOUR] && !counts[OPEN_FOUR]) continue;
      if (!legalWithShapes(board, p.x, p.y, color, rules, counts)) continue;
      moves.push({ x: p.x, y: p.y, score: shapeScore(counts) });
    }
    return moves.sort((a, b) => b.score - a.score);
  }

  function vcf(board, color, rules, depth, ctx) {
    if (depth <= 0 || ctx.nodes >= ctx.maxNodes || Date.now() > ctx.deadline) return null;
    ctx.nodes++;
    const opp = Rules.opponent(color);
    const theirFives = fivePointsFor(board, opp, rules);
    if (theirFives.length > 1) return null;

    for (const m of fourMoves(board, color, rules)) {
      // If they already threaten five, our four has to block it
      if (theirFives.length === 1 && (theirFives[0].x !== m.x || theirFives[0].y !== m.y)) continue;
      board[m.y][m.x] = color;
      const wins = fivePointsThrough(board, m.x, m.y, color, rules);
      let found = false;
      if (wins.length >= 2 || wins.some(w => !Rules.isLegal(board, w.x, w.y, opp, rules))) {
        found = true;
      } else if (wins.length === 1 && depth > 1) {
        const block = wins[0];
        board[block.y][block.x] = opp;
        if (!Rules.winningLine(board, block.x, block.y, rules)) {
          found = vcf(board, color, rules, depth - 1, ctx) !== null;
        }
        board[block.y][block.x] = null;
      }
      board[m.y][m.x] = null;
      if (found) return { x: m.x, y: m.y };
      if (ctx.nodes >= ctx.maxNodes || Date.now() > ctx.deadline) break;
    }
    return null;
  }

  function findVcf(board, color, rules, depth, maxNodes, deadline) {
    return vcf(board, color, rules, depth, { nodes: 0, maxNodes, deadline });
  }

  // ---- forced wins with threes and fours (VCT), used by the hard level ----
  function linePoints(board, x, y, reach) {
    const points = [];
    for (const [dx, dy] of DIRS) {
      for (let i = -reach; i <= reach; i++) {
        const px = x + dx * i;
        const py = y + dy * i;
        if (i !== 0 && Rules.inside(px, py) && board[py][px] === null) points.push({ x: px, y: py });
      }
    }
    return points;
  }

  // Can `color` make an open four (or two fours) somewhere in `points`?
  function hasOpenFourMove(board, color, rules, points) {
    for (const p of points) {
      if (board[p.y][p.x] !== null) continue;
      const counts = shapesAt(board, p.x, p.y, color, rules);
      if ((counts[OPEN_FOUR] || counts[FOUR] >= 2) && legalWithShapes(board, p.x, p.y, color, rules, counts)) return true;
    }
    return false;
  }

  function vct(board, color, rules, depth, ctx) {
    if (depth <= 0 || ctx.nodes >= ctx.maxNodes || Date.now() > ctx.deadline) return null;
    ctx.nodes++;
    const opp = Rules.opponent(color);
    if (fivePointsFor(board, opp, rules).length) return null;
    const quick = vcf(board, color, rules, 8, { nodes: 0, maxNodes: 300, deadline: ctx.deadline });
    if (quick) return quick;

    const threats = [];
    for (const p of candidates(board, 2)) {
      const counts = shapesAt(board, p.x, p.y, color, rules);
      if (!counts[OPEN_THREE] && !counts[FOUR] && !counts[OPEN_FOUR]) continue;
      if (!legalWithShapes(board, p.x, p.y, color, rules, counts)) continue;
      threats.push({ x: p.x, y: p.y, score: shapeScore(counts) });
    }
    threats.sort((a, b) => b.score - a.score);

    for (const m of threats.slice(0, 8)) {
      board[m.y][m.x] = color;
      const won = winsAgainstEveryReply(board, color, rules, m, depth, ctx);
      board[m.y][m.x] = null;
      if (won) return { x: m.x, y: m.y };
      if (ctx.nodes >= ctx.maxNodes || Date.now() > ctx.deadline) break;
    }
    return null;
  }

  // `color` just played the threat m. Does it still win whatever the opponent answers?
  function winsAgainstEveryReply(board, color, rules, m, depth, ctx) {
    const opp = Rules.opponent(color);
    const wins = fivePointsThrough(board, m.x, m.y, color, rules);
    if (wins.length >= 2 || wins.some(w => !Rules.isLegal(board, w.x, w.y, opp, rules))) return true;

    let replies = wins;
    if (!wins.length) {
      // An open three: the reply has to stop the open four on these lines.
      // A counter-four that happens to block also counts.
      const lines = linePoints(board, m.x, m.y, 5);
      replies = lines.filter((p) => {
        if (!Rules.isLegal(board, p.x, p.y, opp, rules)) return false;
        board[p.y][p.x] = opp;
        const stopped = !hasOpenFourMove(board, color, rules, lines);
        board[p.y][p.x] = null;
        return stopped;
      });
      if (!replies.length) return true;
      // If the defender has a forced win of their own, the threat was too slow
      if (vcf(board, opp, rules, 8, { nodes: 0, maxNodes: 300, deadline: ctx.deadline })) return false;
    }

    for (const r of replies) {
      board[r.y][r.x] = opp;
      const result = Rules.winningLine(board, r.x, r.y, rules) ? null : vct(board, color, rules, depth - 1, ctx);
      board[r.y][r.x] = null;
      if (!result) return false;
    }
    return true;
  }

  function findVct(board, color, rules, depth, maxNodes, deadline) {
    return vct(board, color, rules, depth, { nodes: 0, maxNodes, deadline });
  }

  // ---- threats ----
  // Does `color` have a move that wins by force next turn (open four, 4-4, 4-3, 3-3)?
  function hasThreatMove(board, color, rules, points) {
    for (const p of points) {
      if (board[p.y][p.x] !== null) continue;
      const counts = shapesAt(board, p.x, p.y, color, rules);
      if (!isDoubleThreat(counts)) continue;
      if (legalWithShapes(board, p.x, p.y, color, rules, counts)) return true;
    }
    return false;
  }

  function neighbours(points, x, y) {
    const out = points.slice();
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Rules.inside(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
      }
    }
    return out;
  }

  // ---- choosing ----
  function pickTop(list, count, random) {
    if (count <= 1 || list.length === 1) {
      // break near-ties randomly so games don't repeat
      const floor = list[0].total - Math.abs(list[0].total) * 0.02;
      const best = list.filter(m => m.total >= floor);
      return best[Math.floor(random() * best.length)];
    }
    const top = list.slice(0, count);
    return top[Math.floor(random() * top.length)];
  }

  function chooseMove(board, color, options = {}) {
    const rules = options.rules === 'renju' ? 'renju' : 'freestyle';
    const level = LEVELS[options.level] || LEVELS.normal;
    const random = options.random || Math.random;
    const deadline = Date.now() + (options.timeLimit || 1500);
    const opp = Rules.opponent(color);
    const work = board.map(row => row.slice());

    const nearby = candidates(work, 2);
    if (work.every(row => row.every(v => v === null))) return { x: SIZE >> 1, y: SIZE >> 1 };

    const moves = [];
    for (const p of nearby) {
      const mine = pointValue(work, p.x, p.y, color, rules);
      if (!mine.legal) continue;
      const theirs = pointValue(work, p.x, p.y, opp, rules);
      moves.push({ x: p.x, y: p.y, attack: mine.value, defense: theirs.value, total: mine.value + theirs.value * 0.85 + touching(work, p.x, p.y) * 4 });
    }
    if (!moves.length) {
      // Nothing legal near the stones (very rare): take any legal point
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          if (Rules.isLegal(work, x, y, color, rules)) return { x, y };
        }
      }
      return null;
    }
    moves.sort((a, b) => b.total - a.total);

    // 1. win, or stop their five
    const win = moves.find(m => m.attack >= 1e8);
    if (win) return { x: win.x, y: win.y };
    const theirFives = fivePointsFor(work, opp, rules);
    if (theirFives.length) {
      const block = theirFives.find(p => Rules.isLegal(work, p.x, p.y, color, rules));
      if (block) return block;
    }

    // 2. forced win with fours
    if (level.vcfDepth) {
      const forced = findVcf(work, color, rules, level.vcfDepth, level.vcfNodes, deadline);
      if (forced) return forced;
    }

    // 3. stop their open four / double threat
    let pool = moves;
    const threatened = hasThreatMove(work, opp, rules, nearby);
    if (!threatened && level.vctDepth) {
      const forced = findVct(work, color, rules, level.vctDepth, level.vctNodes, deadline);
      if (forced) return forced;
    }
    if (threatened && random() >= level.ignoreThreat) {
      const safe = moves.filter((m) => {
        work[m.y][m.x] = color;
        const ok = !hasThreatMove(work, opp, rules, neighbours(nearby, m.x, m.y));
        work[m.y][m.x] = null;
        return ok;
      });
      if (safe.length) pool = safe;
    }

    // 4. hard: skip moves that leave them a forced win, and look one reply ahead
    if (level.checkOpponentVcf || level.lookahead) {
      const head = pool.slice(0, Math.max(level.lookahead, 1));
      for (const m of head) {
        work[m.y][m.x] = color;
        if (level.checkOpponentVcf && Date.now() < deadline) {
          const budget = { nodes: 0, maxNodes: 1500, deadline };
          m.opponentVcf = vcf(work, opp, rules, 10, budget) !== null;
        }
        if (level.lookahead) {
          let reply = 0;
          for (const p of neighbours(nearby, m.x, m.y)) {
            if (work[p.y][p.x] !== null) continue;
            reply = Math.max(reply, pointValue(work, p.x, p.y, opp, rules).value);
          }
          m.total -= reply * 0.35;
        }
        work[m.y][m.x] = null;
      }
      const sorted = head.filter(m => !m.opponentVcf).sort((a, b) => b.total - a.total);
      if (sorted.length) pool = sorted;
    }

    const pick = pickTop(pool, level.pickFrom, random);
    return { x: pick.x, y: pick.y };
  }

  return { chooseMove, LEVELS, findVcf, findVct, _shapesAt: shapesAt, _shape: { NONE, TWO, OPEN_TWO, THREE, OPEN_THREE, FOUR, OPEN_FOUR, FIVE, OVERLINE } };
});
