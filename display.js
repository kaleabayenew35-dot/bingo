// display.js — Bingo display page
// Call sequence is managed entirely by the backend.
// Frontend polls POST /api/draw/:gameId/next every 3 seconds.
// When backend says done:true, redirect back to index.html.

(function () {
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const API = window?.VITE_API_URL || (isLocal ? 'http://localhost:5000/api' : 'https://bingo-backend-m1yf.onrender.com/api');
  const SYSTEM_API = window?.SYSTEM_API_URL || 'https://system-backend-1u5m.onrender.com/api';

  // ── URL params ────────────────────────────────────────────
  const params   = new URLSearchParams(window.location.search);
  const amount   = parseInt(params.get('amount')  || '10', 10);
  const gameId   = params.get('gameId')   || '';
  const players  = params.get('players')  || '0';
  const markRaw  = params.get('mark')     || '';
  const username = params.get('username') || '—';
  const balance  = params.get('balance')  || '0';
  // Pass original URL params back to index.html on redirect
  const phone    = params.get('phone')    || '';
  const token    = params.get('token')    || '';
  const launch   = params.get('launch')   || '';

  // ── DOM refs ──────────────────────────────────────────────
  const entryOverlay      = document.getElementById('entryOverlay');
  const entryCount        = document.getElementById('entryCount');
  const displayPage       = document.getElementById('displayPage');
  const displayTimer      = document.getElementById('displayTimer');
  const dspGameId         = document.getElementById('dspGameId');
  const dspAmount         = document.getElementById('dspAmount');
  const dspPlayers        = document.getElementById('dspPlayers');
  const dspPayout         = document.getElementById('dspPayout');
  const dspCall           = document.getElementById('dspCall');
  const boardsWrap        = document.getElementById('boardsWrap');
  const boardsEmpty       = document.getElementById('boardsEmpty');
  const drawCurrent       = document.getElementById('drawCurrent');
  const drawCurrentLetter = document.getElementById('drawCurrentLetter');
  const drawCurrentNumber = document.getElementById('drawCurrentNumber');
  const drawCurrentCount  = document.getElementById('drawCurrentCount');
  const dspPlayerAvatar   = document.getElementById('dspPlayerAvatar');
  const dspPlayerName     = document.getElementById('dspPlayerName');
  const dspPlayerBalance  = document.getElementById('dspPlayerBalance');

  const colContainers = {
    B: document.getElementById('colB'),
    I: document.getElementById('colI'),
    N: document.getElementById('colN'),
    G: document.getElementById('colG'),
    O: document.getElementById('colO'),
  };
  const colColors = { B:'#3b82f6', I:'#8b5cf6', N:'#10b981', G:'#f59e0b', O:'#ef4444' };

  // ── State ─────────────────────────────────────────────────
  let callInterval = null;   // setInterval for polling backend
  let totalNumbers = 75;

  // ── Helpers ───────────────────────────────────────────────
  function formatTime(s) {
    const sec = Math.max(0, Math.floor(s));
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }

  function bingoColumn(n) {
    if (n >= 1  && n <= 15) return 'B';
    if (n >= 16 && n <= 30) return 'I';
    if (n >= 31 && n <= 45) return 'N';
    if (n >= 46 && n <= 60) return 'G';
    if (n >= 61 && n <= 75) return 'O';
    return '?';
  }

  function parseMark(mark) {
    if (!mark) return [];
    return mark.split(',').map((e) => e.trim()).filter(Boolean).map((entry) => {
      const colonIdx = entry.indexOf(':');
      if (colonIdx === -1) return null;
      const beforeColon = entry.slice(0, colonIdx);
      const numStr      = entry.slice(colonIdx + 1);
      const numbers     = numStr.split('|').map(Number).filter(Boolean);
      const pipeIdx     = beforeColon.indexOf('|');
      const uname = pipeIdx !== -1 ? beforeColon.slice(0, pipeIdx) : beforeColon;
      const ph    = pipeIdx !== -1 ? beforeColon.slice(pipeIdx + 1) : beforeColon;
      return { username: uname, phone: ph, numbers };
    }).filter(Boolean);
  }

  // ── Sidebar number highlight ──────────────────────────────
  function highlightSidebarNumber(n) {
    const col       = bingoColumn(n);
    const container = colContainers[col];
    if (!container) return;
    container.querySelectorAll('span').forEach((span) => {
      if (parseInt(span.textContent, 10) === n) {
        span.classList.add('called');
        span.style.color      = colColors[col];
        span.style.fontWeight = '900';
      }
    });
  }

  // ── Board number highlight ────────────────────────────────
  function highlightBoardNumber(n) {
    if (!boardsWrap) return;
    boardsWrap.querySelectorAll('.board-num-cell').forEach((cell) => {
      if (parseInt(cell.dataset.num, 10) === n) cell.classList.add('called');
    });
  }

  // ── Display a called number ───────────────────────────────
  function displayCall(n, drawIndex, total) {
    const col   = bingoColumn(n);
    const color = colColors[col] || '#ffffff';

    // Big number display
    if (drawCurrent) drawCurrent.style.display = 'flex';
    if (drawCurrentLetter) { drawCurrentLetter.textContent = col; drawCurrentLetter.style.color = color; }
    if (drawCurrentNumber) {
      drawCurrentNumber.textContent = String(n);
      drawCurrentNumber.style.color = color;
      drawCurrentNumber.classList.remove('pop');
      void drawCurrentNumber.offsetWidth;
      drawCurrentNumber.classList.add('pop');
    }
    if (drawCurrentCount) drawCurrentCount.textContent = `${drawIndex} / ${total}`;

    // Mini-header Call field
    if (dspCall) {
      dspCall.textContent = `${col}${n}`;
      dspCall.style.color = color;
    }

    // Timer countdown = remaining numbers × 3 seconds
    const remaining = (total - drawIndex) * 3;
    if (displayTimer) displayTimer.textContent = formatTime(remaining);

    // Mark on sidebar and boards
    highlightSidebarNumber(n);
    highlightBoardNumber(n);
  }

  // ── Poll backend for next call ────────────────────────────
  function fetchNextCall() {
    if (!gameId) return;
    fetch(`${API}/draw/${gameId}/next`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.done || data.number === null) {
          // All 75 numbers called — stop and go back to index
          clearInterval(callInterval);
          callInterval = null;
          if (drawCurrentCount) drawCurrentCount.textContent = 'All 75 numbers drawn!';
          if (dspCall)  dspCall.textContent  = '—';
          if (displayTimer) displayTimer.textContent = '00:00';
          // Wait 3 seconds then redirect to index.html with player auth params
          setTimeout(() => {
            const backQuery = new URLSearchParams({ token, launch, phone, username, balance });
            window.location.href = `index.html?${backQuery.toString()}`;
          }, 3000);
          return;
        }
        displayCall(data.number, data.drawIndex, data.total || 75);
        totalNumbers = data.total || 75;
      })
      .catch(() => {}); // keep going on network error
  }

  // ── Build + render player boards ─────────────────────────
  function buildBoard(entry) {
    const colOrder = ['B','I','N','G','O'];
    const cols = { B:[], I:[], N:[], G:[], O:[] };
    const phoneDigits = String(entry.phone || '').replace(/\D/g, '');
    const playerMarker = phoneDigits.length >= 5
      ? phoneDigits.slice(3, 5)
      : (entry.username || '?').charAt(0).toUpperCase();
    const maskedPhone = phoneDigits.length >= 6
      ? `${phoneDigits.slice(0, 5)}${'*'.repeat(Math.max(phoneDigits.length - 8, 2))}${phoneDigits.slice(-3)}`
      : (entry.phone || '');
    entry.numbers.forEach((n) => { const c = bingoColumn(n); if (cols[c]) cols[c].push(n); });

    const colsHTML = colOrder.map((letter) => {
      const nums  = cols[letter].sort((a, b) => a - b);
      const color = colColors[letter];
      const cells = nums.length
        ? nums.map((n) => `<div class="board-num-cell" data-num="${n}" style="border-color:${color}22;color:${color}">${n}</div>`).join('')
        : `<div class="board-num-empty">—</div>`;
      return `<div class="board-col">
        <div class="board-col-header" style="background:${color}22;color:${color}">${letter}</div>
        <div class="board-col-nums">${cells}</div>
      </div>`;
    }).join('');

    return `<div class="player-board">
      <div class="player-board-header">
        <div class="player-board-avatar">${playerMarker}</div>
        <div class="player-board-identity">
          <div class="player-board-name">${entry.username}</div>
          <div class="player-board-phone">${maskedPhone}</div>
        </div>
        <div class="player-board-count">${entry.numbers.length} number${entry.numbers.length!==1?'s':''}</div>
      </div>
      <div class="player-board-grid">${colsHTML}</div>
    </div>`;
  }

  function renderBoards(mark) {
    if (!boardsWrap) return;
    Array.from(boardsWrap.querySelectorAll('.player-board, .boards-row, .boards-scroll')).forEach((el) => el.remove());
    const entries = parseMark(mark);
    if (!entries.length) { if (boardsEmpty) boardsEmpty.style.display = 'flex'; return; }
    if (boardsEmpty) boardsEmpty.style.display = 'none';

    if (entries.length <= 2) {
      const wrap = document.createElement('div');
      wrap.className = `boards-row boards-count-${entries.length}`;
      entries.forEach((e) => { wrap.innerHTML += buildBoard(e); });
      boardsWrap.appendChild(wrap);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'boards-scroll';
      entries.forEach((e) => { wrap.innerHTML += buildBoard(e); });
      boardsWrap.appendChild(wrap);
    }
  }

  // ── Populate headers ──────────────────────────────────────
  function populatePlayerHeader() {
    if (dspPlayerAvatar)  dspPlayerAvatar.textContent  = (username||'—').charAt(0).toUpperCase();
    if (dspPlayerName)    dspPlayerName.textContent    = username || '—';
    if (dspPlayerBalance) dspPlayerBalance.textContent = `$${balance}`;
  }

  function refreshLiveBalance() {
    if (!launch || !dspPlayerBalance) return;
    fetch(`${SYSTEM_API}/verify-launch-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launch }),
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data || !data.valid) return;
        const liveBalance = data.balance ?? data.user?.balance;
        if (liveBalance != null) dspPlayerBalance.textContent = `$${Number(liveBalance)}`;
      })
      .catch(() => {});
  }

  function populateMiniHeader(gid, pl, po) {
    if (dspGameId)  dspGameId.textContent  = gid || '—';
    if (dspAmount)  dspAmount.textContent  = `$${amount}`;
    if (dspPlayers) dspPlayers.textContent = String(pl || '0');
    if (dspPayout)  dspPayout.textContent  = parseInt(po, 10) > 0 ? `$${po}` : '—';
    if (dspCall)    dspCall.textContent    = '—';
  }

  function refreshFromBackend() {
    fetch(`${API}/amount/${amount}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data || !data.rows || !data.rows.length) return;
        const row    = data.rows[0];
        const livePl = row.total_players || parseInt(players, 10) || 0;
        populateMiniHeader(row.game_id || gameId, livePl, livePl * amount);
        renderBoards(row.mark || markRaw);
      })
      .catch(() => {
        populateMiniHeader(gameId, players, parseInt(players, 10) * amount);
        renderBoards(markRaw);
      });
  }

  // ── Step 1: 3-second entry countdown overlay ─────────────
  let entrySeconds = 3;
  entryCount.textContent = entrySeconds;

  const entryInterval = setInterval(() => {
    entrySeconds -= 1;
    if (entrySeconds <= 0) {
      clearInterval(entryInterval);
      entryOverlay.style.display = 'none';
      displayPage.style.display  = 'block';
      startDisplay();
    } else {
      entryCount.textContent = entrySeconds;
    }
  }, 1000);

  // ── Step 2: Show page, 3s pre-roll, then start polling ───
  function startDisplay() {
    populatePlayerHeader();
    refreshLiveBalance();
    setInterval(refreshLiveBalance, 5000);
    populateMiniHeader(gameId, players, parseInt(players, 10) * amount);
    renderBoards(markRaw);
    refreshFromBackend();

    // 3-second pre-reveal countdown shown in timer
    if (displayTimer) displayTimer.textContent = '00:03';
    let preCount = 3;
    const preInterval = setInterval(() => {
      preCount -= 1;
      if (displayTimer) displayTimer.textContent = preCount > 0 ? formatTime(preCount) : '🎯';
      if (preCount <= 0) {
        clearInterval(preInterval);
        // Start polling backend for calls every 3 seconds
        fetchNextCall();  // first call immediately
        callInterval = setInterval(fetchNextCall, 3000);
      }
    }, 1000);
  }

  window.addEventListener('beforeunload', () => {
    if (callInterval) clearInterval(callInterval);
  });
})();
