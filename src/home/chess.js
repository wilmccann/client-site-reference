// Chess against the computer. You play terracotta (white) and move first.
// Full rules: check, checkmate, stalemate, castling, en passant, promotion (to a queen when you
// play; the move generator also knows under-promotions). The computer looks two moves ahead.

const W = 'w';
const B = 'b';
const FILES = 'abcdefgh';
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAME = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const STRAIGHT = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAGONAL = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const MATE = 100000;

const rowOf = (i) => Math.floor(i / 8);
const colOf = (i) => i % 8;
const at = (r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1);
const other = (side) => (side === W ? B : W);

function newGame() {
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const board = Array(64).fill(null);
  for (let c = 0; c < 8; c++) {
    board[at(0, c)] = { c: B, t: back[c] };
    board[at(1, c)] = { c: B, t: 'p' };
    board[at(6, c)] = { c: W, t: 'p' };
    board[at(7, c)] = { c: W, t: back[c] };
  }
  return { board, turn: W, castle: { wk: true, wq: true, bk: true, bq: true }, ep: -1 };
}

function attacked(board, sq, by) {
  const r = rowOf(sq);
  const c = colOf(sq);
  const pawnRow = by === W ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    const p = board[at(pawnRow, c + dc)];
    if (at(pawnRow, c + dc) >= 0 && p?.c === by && p.t === 'p') return true;
  }
  for (const [steps, type] of [[KNIGHT, 'n'], [KING, 'k']]) {
    for (const [dr, dc] of steps) {
      const i = at(r + dr, c + dc);
      if (i >= 0 && board[i]?.c === by && board[i].t === type) return true;
    }
  }
  for (const [dirs, types] of [[STRAIGHT, 'rq'], [DIAGONAL, 'bq']]) {
    for (const [dr, dc] of dirs) {
      for (let rr = r + dr, cc = c + dc; at(rr, cc) >= 0; rr += dr, cc += dc) {
        const p = board[at(rr, cc)];
        if (!p) continue;
        if (p.c === by && types.includes(p.t)) return true;
        break;
      }
    }
  }
  return false;
}

function pseudoMoves(s) {
  const { board, turn } = s;
  const them = other(turn);
  const moves = [];
  const add = (from, to, extra) => moves.push({ from, to, ...extra });

  board.forEach((p, i) => {
    if (!p || p.c !== turn) return;
    const r = rowOf(i);
    const c = colOf(i);

    if (p.t === 'p') {
      const dir = turn === W ? -1 : 1;
      const lastRow = turn === W ? 0 : 7;
      const push = (to, extra) => {
        if (rowOf(to) !== lastRow) return add(i, to, extra);
        for (const promo of 'qrbn') add(i, to, { ...extra, promo });
      };
      const one = at(r + dir, c);
      if (one >= 0 && !board[one]) {
        push(one);
        const two = at(r + 2 * dir, c);
        if (r === (turn === W ? 6 : 1) && !board[two]) add(i, two, { double: true });
      }
      for (const dc of [-1, 1]) {
        const to = at(r + dir, c + dc);
        if (to < 0) continue;
        if (board[to]?.c === them) push(to);
        else if (to === s.ep) add(i, to, { enPassant: true });
      }
      return;
    }

    if (p.t === 'n' || p.t === 'k') {
      for (const [dr, dc] of p.t === 'n' ? KNIGHT : KING) {
        const to = at(r + dr, c + dc);
        if (to >= 0 && board[to]?.c !== turn) add(i, to);
      }
    } else {
      const dirs = p.t === 'r' ? STRAIGHT : p.t === 'b' ? DIAGONAL : [...STRAIGHT, ...DIAGONAL];
      for (const [dr, dc] of dirs) {
        for (let rr = r + dr, cc = c + dc; at(rr, cc) >= 0; rr += dr, cc += dc) {
          const to = at(rr, cc);
          if (board[to]) {
            if (board[to].c === them) add(i, to);
            break;
          }
          add(i, to);
        }
      }
    }

    const home = turn === W ? 7 : 0;
    if (p.t === 'k' && i === at(home, 4) && !attacked(board, i, them)) {
      const rook = (col) => board[at(home, col)]?.t === 'r' && board[at(home, col)].c === turn;
      const empty = (...cols) => cols.every((col) => !board[at(home, col)]);
      const safe = (...cols) => cols.every((col) => !attacked(board, at(home, col), them));
      if (s.castle[`${turn}k`] && rook(7) && empty(5, 6) && safe(5, 6)) add(i, at(home, 6), { castle: 'k' });
      if (s.castle[`${turn}q`] && rook(0) && empty(1, 2, 3) && safe(2, 3)) add(i, at(home, 2), { castle: 'q' });
    }
  });
  return moves;
}

function applyMove(s, m) {
  const board = s.board.slice();
  const piece = board[m.from];
  board[m.to] = m.promo ? { c: piece.c, t: m.promo } : piece;
  board[m.from] = null;
  if (m.enPassant) board[m.to + (s.turn === W ? 8 : -8)] = null;
  if (m.castle) {
    const row = rowOf(m.from);
    const [fromCol, toCol] = m.castle === 'k' ? [7, 5] : [0, 3];
    board[at(row, toCol)] = board[at(row, fromCol)];
    board[at(row, fromCol)] = null;
  }
  const castle = { ...s.castle };
  if (piece.t === 'k') {
    castle[`${s.turn}k`] = false;
    castle[`${s.turn}q`] = false;
  }
  for (const [sq, key] of [[at(7, 0), 'wq'], [at(7, 7), 'wk'], [at(0, 0), 'bq'], [at(0, 7), 'bk']]) {
    if (m.from === sq || m.to === sq) castle[key] = false;
  }
  return { board, turn: other(s.turn), castle, ep: m.double ? (m.from + m.to) / 2 : -1 };
}

const kingOf = (board, side) => board.findIndex((p) => p?.t === 'k' && p.c === side);
const inCheck = (s) => attacked(s.board, kingOf(s.board, s.turn), other(s.turn));

function legalMoves(s) {
  return pseudoMoves(s).filter((m) => {
    const next = applyMove(s, m);
    return !attacked(next.board, kingOf(next.board, s.turn), next.turn);
  });
}

function insufficientMaterial(board) {
  const rest = board.filter((p) => p && p.t !== 'k');
  return rest.length === 0 || (rest.length === 1 && (rest[0].t === 'n' || rest[0].t === 'b'));
}

// Score from the side to move's point of view: material plus a nudge toward the centre
// and toward advancing pawns.
function evaluate(s) {
  let score = 0;
  s.board.forEach((p, i) => {
    if (!p) return;
    const r = rowOf(i);
    const c = colOf(i);
    let value = VALUE[p.t];
    if (p.t === 'n' || p.t === 'b') value += 10 * (3.5 - Math.abs(c - 3.5)) + 10 * (3.5 - Math.abs(r - 3.5)) - 35;
    if (p.t === 'p') value += 6 * (p.c === W ? 6 - r : r - 1) + (c === 3 || c === 4 ? 10 : 0);
    score += p.c === s.turn ? value : -value;
  });
  return score;
}

function negamax(s, depth, alpha, beta) {
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? -MATE - depth : 0;
  if (depth === 0) return evaluate(s);
  let best = -Infinity;
  for (const m of moves) {
    const score = -negamax(applyMove(s, m), depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function chooseMove(s) {
  let best = null;
  let bestScore = -Infinity;
  for (const m of legalMoves(s)) {
    const score = -negamax(applyMove(s, m), 1, -Infinity, Infinity) + Math.random() * 25;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

function describe(i, piece, target) {
  const square = `${FILES[colOf(i)]}${8 - rowOf(i)}`;
  if (target) return `${square}, ${piece ? `capture ${NAME[piece.t]}` : 'move here'}`;
  if (!piece) return `${square}, empty`;
  return `${square}, ${piece.c === W ? 'your' : "computer's"} ${NAME[piece.t]}`;
}

export function startChess(root) {
  const boardEl = root.querySelector('[data-board]');
  const statusEl = root.querySelector('[data-status]');
  const resetEl = root.querySelector('[data-reset]');

  let state;
  let selected;
  let last;
  let over;
  let game = 0;

  function render() {
    const moves = state.turn === W && !over ? legalMoves(state) : [];
    const movable = new Set(moves.map((m) => m.from));
    const targets = new Map(moves.filter((m) => m.from === selected).map((m) => [m.to, m]));

    boardEl.replaceChildren(
      ...state.board.map((piece, i) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `square ${(rowOf(i) + colOf(i)) % 2 === 1 ? 'dark' : 'light'}`;
        cell.dataset.index = String(i);
        const target = targets.get(i);
        cell.classList.toggle('selected', i === selected);
        cell.classList.toggle('target', Boolean(target));
        cell.classList.toggle('capture', Boolean(target && (piece || target.enPassant)));
        cell.classList.toggle('last', Boolean(last && (i === last.from || i === last.to)));
        cell.classList.toggle('movable', movable.has(i));
        cell.disabled = !movable.has(i) && !target;
        cell.setAttribute('aria-label', describe(i, piece, Boolean(target)));
        if (piece) {
          const glyph = document.createElement('span');
          glyph.className = `chess-piece ${piece.c}`;
          glyph.textContent = `${GLYPH[piece.t]}︎`;
          cell.append(glyph);
        }
        return cell;
      }),
    );
  }

  function settle() {
    const moves = legalMoves(state);
    const check = inCheck(state);
    if (!moves.length || insufficientMaterial(state.board)) {
      over = true;
      if (moves.length) statusEl.textContent = "Draw: there aren't enough pieces left to checkmate.";
      else if (!check) statusEl.textContent = "Stalemate. It's a draw.";
      else statusEl.textContent = state.turn === W ? 'Checkmate. The computer wins this one.' : 'Checkmate! You win.';
      render();
      return;
    }
    render();
    if (state.turn === B) {
      statusEl.textContent = 'Thinking…';
      const thisGame = game;
      setTimeout(() => {
        if (thisGame === game && !over) play(chooseMove(state));
      }, 350);
    } else {
      statusEl.textContent = check ? 'Check! Your move.' : 'Your move.';
    }
  }

  function play(move) {
    state = applyMove(state, move);
    last = move;
    selected = null;
    settle();
  }

  function reset() {
    game += 1;
    state = newGame();
    selected = null;
    last = null;
    over = false;
    settle();
  }

  boardEl.addEventListener('click', (event) => {
    const cell = event.target.closest('button[data-index]');
    if (!cell || state.turn !== W || over) return;
    const i = Number(cell.dataset.index);
    const moves = legalMoves(state);
    const options = moves.filter((m) => m.from === selected && m.to === i);
    if (options.length) {
      play(options.find((m) => !m.promo || m.promo === 'q'));
      return;
    }
    if (state.board[i]?.c === W && moves.some((m) => m.from === i)) {
      selected = i === selected ? null : i;
      render();
      boardEl.querySelector(`[data-index="${i}"]`)?.focus();
    }
  });

  resetEl.addEventListener('click', reset);
  reset();
}
