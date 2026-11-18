// Connect Four against the computer. You play terracotta and move first.
// 7 columns, 6 rows. Drop pieces to get four in a row horizontally,
// vertically, or diagonally.

const COLS = 7;
const ROWS = 6;
const YOU = 1;
const CPU = 2;

const at = (r, c) => r * COLS + c;

function checkWin(board) {
  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const p = board[at(r, c)];
      if (p && p === board[at(r, c + 1)] && p === board[at(r, c + 2)] && p === board[at(r, c + 3)]) {
        return { winner: p, cells: [at(r, c), at(r, c + 1), at(r, c + 2), at(r, c + 3)] };
      }
    }
  }
  // Vertical
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      const p = board[at(r, c)];
      if (p && p === board[at(r + 1, c)] && p === board[at(r + 2, c)] && p === board[at(r + 3, c)]) {
        return { winner: p, cells: [at(r, c), at(r + 1, c), at(r + 2, c), at(r + 3, c)] };
      }
    }
  }
  // Diagonal down-right
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const p = board[at(r, c)];
      if (p && p === board[at(r + 1, c + 1)] && p === board[at(r + 2, c + 2)] && p === board[at(r + 3, c + 3)]) {
        return { winner: p, cells: [at(r, c), at(r + 1, c + 1), at(r + 2, c + 2), at(r + 3, c + 3)] };
      }
    }
  }
  // Diagonal up-right
  for (let r = 3; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const p = board[at(r, c)];
      if (p && p === board[at(r - 1, c + 1)] && p === board[at(r - 2, c + 2)] && p === board[at(r - 3, c + 3)]) {
        return { winner: p, cells: [at(r, c), at(r - 1, c + 1), at(r - 2, c + 2), at(r - 3, c + 3)] };
      }
    }
  }
  return null;
}

function getLowestEmptyRow(board, c) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[at(r, c)] === 0) return r;
  }
  return -1;
}

function getValidColumns(board) {
  const order = [3, 2, 4, 1, 5, 0, 6];
  return order.filter((c) => board[at(0, c)] === 0);
}

function evaluateWindow(w, piece) {
  const opp = piece === CPU ? YOU : CPU;
  let pieceCount = 0;
  let emptyCount = 0;
  let oppCount = 0;

  for (let i = 0; i < 4; i++) {
    if (w[i] === piece) pieceCount++;
    else if (w[i] === 0) emptyCount++;
    else if (w[i] === opp) oppCount++;
  }

  if (pieceCount === 4) return 10000;
  if (pieceCount === 3 && emptyCount === 1) return 100;
  if (pieceCount === 2 && emptyCount === 2) return 10;
  if (oppCount === 3 && emptyCount === 1) return -90;
  return 0;
}

function evaluateBoard(board, piece) {
  let score = 0;

  // Center column bonus
  for (let r = 0; r < ROWS; r++) {
    if (board[at(r, 3)] === piece) score += 6;
    else if (board[at(r, 3)] !== 0) score -= 6;
  }

  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      score += evaluateWindow([board[at(r, c)], board[at(r, c + 1)], board[at(r, c + 2)], board[at(r, c + 3)]], piece);
    }
  }

  // Vertical
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      score += evaluateWindow([board[at(r, c)], board[at(r + 1, c)], board[at(r + 2, c)], board[at(r + 3, c)]], piece);
    }
  }

  // Diagonal down-right
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      score += evaluateWindow([board[at(r, c)], board[at(r + 1, c + 1)], board[at(r + 2, c + 2)], board[at(r + 3, c + 3)]], piece);
    }
  }

  // Diagonal up-right
  for (let r = 3; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      score += evaluateWindow([board[at(r, c)], board[at(r - 1, c + 1)], board[at(r - 2, c + 2)], board[at(r - 3, c + 3)]], piece);
    }
  }

  return score;
}

function minimax(board, depth, alpha, beta, isMaximizing) {
  const win = checkWin(board);
  if (win) {
    return win.winner === CPU ? 100000 + depth : -100000 - depth;
  }
  const validCols = getValidColumns(board);
  if (validCols.length === 0 || depth === 0) {
    return evaluateBoard(board, CPU);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const c of validCols) {
      const r = getLowestEmptyRow(board, c);
      board[at(r, c)] = CPU;
      const ev = minimax(board, depth - 1, alpha, beta, false);
      board[at(r, c)] = 0;
      if (ev > maxEval) maxEval = ev;
      if (ev > alpha) alpha = ev;
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const c of validCols) {
      const r = getLowestEmptyRow(board, c);
      board[at(r, c)] = YOU;
      const ev = minimax(board, depth - 1, alpha, beta, true);
      board[at(r, c)] = 0;
      if (ev < minEval) minEval = ev;
      if (ev < beta) beta = ev;
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function chooseMove(board) {
  const validCols = getValidColumns(board);
  if (validCols.length === 0) return -1;

  // 1. Immediate win
  for (const c of validCols) {
    const r = getLowestEmptyRow(board, c);
    board[at(r, c)] = CPU;
    const win = checkWin(board);
    board[at(r, c)] = 0;
    if (win && win.winner === CPU) return c;
  }

  // 2. Immediate block
  for (const c of validCols) {
    const r = getLowestEmptyRow(board, c);
    board[at(r, c)] = YOU;
    const win = checkWin(board);
    board[at(r, c)] = 0;
    if (win && win.winner === YOU) return c;
  }

  // 3. Minimax search with center preference
  let bestScore = -Infinity;
  let bestCol = validCols[0];

  for (const c of validCols) {
    const r = getLowestEmptyRow(board, c);
    board[at(r, c)] = CPU;
    const score = minimax(board, 4, -Infinity, Infinity, false) + Math.random() * 4;
    board[at(r, c)] = 0;
    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }

  return bestCol;
}

export function startConnectFour(container) {
  const boardEl = container.querySelector('[data-board]');
  const statusEl = container.querySelector('[data-status]');
  const resetEl = container.querySelector('[data-reset]');

  let board = Array(ROWS * COLS).fill(0);
  let turn = YOU;
  let over = false;
  let winInfo = null;
  let game = 0;
  let lastDrop = -1;
  let hoverCol = null;

  function describeCell(r, c, p) {
    const colName = `Column ${c + 1}`;
    if (p === YOU) return `${colName}, row ${r + 1}, your terracotta piece`;
    if (p === CPU) return `${colName}, row ${r + 1}, computer piece`;
    return `${colName}, row ${r + 1}, empty. Drop here.`;
  }

  function render() {
    const validCols = new Set(getValidColumns(board));
    const winCells = new Set(winInfo?.cells || []);

    const fragment = document.createDocumentFragment();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = at(r, c);
        const p = board[i];
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'c4-cell';
        cell.dataset.col = String(c);
        cell.dataset.row = String(r);
        cell.dataset.index = String(i);

        if (p) cell.classList.add('filled');
        if (winCells.has(i)) cell.classList.add('winning');
        if (i === lastDrop) cell.classList.add('latest');
        if (hoverCol === c && !over && turn === YOU) cell.classList.add('col-hover');

        cell.disabled = over || !validCols.has(c);
        cell.setAttribute('aria-label', describeCell(r, c, p));

        if (p) {
          const piece = document.createElement('span');
          piece.className = `c4-piece ${p === YOU ? 'you' : 'cpu'}`;
          cell.appendChild(piece);
        }

        fragment.appendChild(cell);
      }
    }
    boardEl.replaceChildren(fragment);
  }

  function updateHover() {
    const cells = boardEl.querySelectorAll('.c4-cell');
    cells.forEach((cell) => {
      const c = Number(cell.dataset.col);
      cell.classList.toggle('col-hover', hoverCol === c && !over && turn === YOU);
    });
  }

  function settle() {
    const win = checkWin(board);
    if (win) {
      over = true;
      winInfo = win;
      statusEl.textContent =
        win.winner === YOU ? 'Four in a row! You win! Nicely played.' : 'Four in a row. The computer wins this one. Try again?';
      render();
      return;
    }

    if (getValidColumns(board).length === 0) {
      over = true;
      statusEl.textContent = "Board full. It's a draw!";
      render();
      return;
    }

    render();

    if (turn === CPU) {
      statusEl.textContent = 'Thinking…';
      const thisGame = game;
      setTimeout(() => {
        if (thisGame === game && !over) {
          const move = chooseMove(board);
          if (move >= 0) play(move);
        }
      }, 450);
    } else {
      statusEl.textContent = 'Your turn. Click a column to drop a piece.';
    }
  }

  function play(col) {
    const row = getLowestEmptyRow(board, col);
    if (row < 0) return;

    const idx = at(row, col);
    board[idx] = turn;
    lastDrop = idx;
    turn = turn === YOU ? CPU : YOU;
    settle();
  }

  function reset() {
    game += 1;
    board = Array(ROWS * COLS).fill(0);
    turn = YOU;
    over = false;
    winInfo = null;
    lastDrop = -1;
    hoverCol = null;
    settle();
  }

  boardEl.addEventListener('click', (event) => {
    const cell = event.target.closest('button[data-col]');
    if (!cell || turn !== YOU || over) return;
    const col = Number(cell.dataset.col);
    if (col >= 0 && col < COLS && board[at(0, col)] === 0) {
      play(col);
    }
  });

  boardEl.addEventListener('pointerover', (event) => {
    const cell = event.target.closest('button[data-col]');
    if (!cell) return;
    const col = Number(cell.dataset.col);
    if (hoverCol !== col) {
      hoverCol = col;
      updateHover();
    }
  });

  boardEl.addEventListener('pointerleave', () => {
    if (hoverCol !== null) {
      hoverCol = null;
      updateHover();
    }
  });

  resetEl.addEventListener('click', reset);
  reset();
}
