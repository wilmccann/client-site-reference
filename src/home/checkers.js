// Checkers against the computer. You play terracotta and move up the board.
// Rules: diagonal moves on dark squares, jumps are required, multi-jumps continue,
// reaching the far row crowns a king (and ends the move).

const SIZE = 8;
const YOU = 'you';
const CPU = 'cpu';
const FILES = 'abcdefgh';

const rowOf = (i) => Math.floor(i / SIZE);
const colOf = (i) => i % SIZE;
const at = (r, c) => (r >= 0 && r < SIZE && c >= 0 && c < SIZE ? r * SIZE + c : -1);

function newBoard() {
  const board = Array(SIZE * SIZE).fill(null);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 0) continue;
      if (r < 3) board[at(r, c)] = { side: CPU, king: false };
      if (r > 4) board[at(r, c)] = { side: YOU, king: false };
    }
  }
  return board;
}

function directions(piece) {
  if (piece.king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const dr = piece.side === YOU ? -1 : 1;
  return [[dr, -1], [dr, 1]];
}

const crowns = (piece, to) => !piece.king && rowOf(to) === (piece.side === YOU ? 0 : SIZE - 1);

function jumpsFrom(board, from, piece, start = from, captured = []) {
  const results = [];
  for (const [dr, dc] of directions(piece)) {
    const mid = at(rowOf(from) + dr, colOf(from) + dc);
    const land = at(rowOf(from) + 2 * dr, colOf(from) + 2 * dc);
    if (mid < 0 || land < 0) continue;
    const jumped = board[mid];
    if (!jumped || jumped.side === piece.side || captured.includes(mid)) continue;
    if (board[land] && land !== start) continue;
    const taken = [...captured, mid];
    const further = crowns(piece, land) ? [] : jumpsFrom(board, land, piece, start, taken);
    results.push(...(further.length ? further : [{ from: start, to: land, captured: taken }]));
  }
  return results;
}

function legalMoves(board, side) {
  const jumps = [];
  const steps = [];
  board.forEach((piece, i) => {
    if (!piece || piece.side !== side) return;
    jumps.push(...jumpsFrom(board, i, piece));
    for (const [dr, dc] of directions(piece)) {
      const to = at(rowOf(i) + dr, colOf(i) + dc);
      if (to >= 0 && !board[to]) steps.push({ from: i, to, captured: [] });
    }
  });
  return jumps.length ? jumps : steps;
}

function applyMove(board, move) {
  const next = board.slice();
  const piece = { ...next[move.from] };
  next[move.from] = null;
  move.captured.forEach((i) => {
    next[i] = null;
  });
  if (crowns(piece, move.to)) piece.king = true;
  next[move.to] = piece;
  return next;
}

// A friendly opponent: grabs pieces and crowns, avoids leaving pieces hanging, with a little randomness.
function chooseMove(board, moves) {
  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const next = applyMove(board, move);
    const replies = legalMoves(next, YOU);
    const threat = replies.length && replies[0].captured.length
      ? Math.max(...replies.map((m) => m.captured.length))
      : 0;
    let score = move.captured.length * 10 - threat * 8 + Math.random() * 3;
    if (!board[move.from].king && next[move.to].king) score += 6;
    if (!replies.length) score += 100;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function describe(i, piece, isTarget) {
  const square = `${FILES[colOf(i)]}${SIZE - rowOf(i)}`;
  if (isTarget) return `${square}, move here`;
  if (!piece) return `${square}, empty`;
  const owner = piece.side === YOU ? 'your' : "computer's";
  return `${square}, ${owner} ${piece.king ? 'king' : 'piece'}`;
}

export function startCheckers(root) {
  const boardEl = root.querySelector('[data-board]');
  const statusEl = root.querySelector('[data-status]');
  const resetEl = root.querySelector('[data-reset]');

  let board;
  let selected;
  let turn;
  let over;
  let game = 0;

  function render() {
    const moves = turn === YOU && !over ? legalMoves(board, YOU) : [];
    const movable = new Set(moves.map((m) => m.from));
    const targets = new Set(moves.filter((m) => m.from === selected).map((m) => m.to));

    boardEl.replaceChildren(
      ...board.map((piece, i) => {
        const dark = (rowOf(i) + colOf(i)) % 2 === 1;
        if (!dark) {
          const cell = document.createElement('div');
          cell.className = 'square light';
          return cell;
        }
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'square dark';
        cell.dataset.index = String(i);
        cell.classList.toggle('selected', i === selected);
        cell.classList.toggle('target', targets.has(i));
        cell.classList.toggle('movable', movable.has(i));
        cell.disabled = !movable.has(i) && !targets.has(i);
        cell.setAttribute('aria-label', describe(i, piece, targets.has(i)));
        if (piece) {
          const disc = document.createElement('span');
          disc.className = `piece ${piece.side}${piece.king ? ' king' : ''}`;
          cell.append(disc);
        }
        return cell;
      }),
    );
  }

  function settle() {
    const moves = legalMoves(board, turn);
    if (!moves.length) {
      over = true;
      statusEl.textContent = turn === YOU ? 'The computer wins this one. Try again?' : 'You win! Nicely played.';
      render();
      return;
    }
    render();
    if (turn === CPU) {
      statusEl.textContent = 'Thinking…';
      const thisGame = game;
      setTimeout(() => {
        if (thisGame === game && !over) play(chooseMove(board, legalMoves(board, CPU)));
      }, 650);
    } else {
      statusEl.textContent = moves[0].captured.length ? 'Your move. You have a jump, so you must take it.' : 'Your move.';
    }
  }

  function play(move) {
    board = applyMove(board, move);
    selected = null;
    turn = turn === YOU ? CPU : YOU;
    settle();
  }

  function reset() {
    game += 1;
    board = newBoard();
    selected = null;
    turn = YOU;
    over = false;
    settle();
  }

  boardEl.addEventListener('click', (event) => {
    const cell = event.target.closest('button[data-index]');
    if (!cell || turn !== YOU || over) return;
    const i = Number(cell.dataset.index);
    const moves = legalMoves(board, YOU);
    const options = moves.filter((m) => m.from === selected && m.to === i);
    if (options.length) {
      play(options.reduce((a, b) => (b.captured.length > a.captured.length ? b : a)));
      return;
    }
    if (board[i]?.side === YOU && moves.some((m) => m.from === i)) {
      selected = i === selected ? null : i;
      render();
      boardEl.querySelector(`[data-index="${i}"]`)?.focus();
    }
  });

  resetEl.addEventListener('click', reset);
  reset();
}
