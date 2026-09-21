const loadingScreen = document.getElementById('loadingScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const startChatBtn = document.getElementById('startChatBtn');
const loadingStatus = document.querySelector('.loading-status');
const countdownTimer = document.getElementById('countdownTimer');
let authState = window.auth && window.auth.getAuthState ? window.auth.getAuthState() : { username: 'Guest', phone: '-', token: 'none', balance: 0, verified: false };
const numberGrid = document.getElementById('numberGrid');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const rangeLabel = document.getElementById('rangeLabel');
const selectionPopup = document.getElementById('selectionPopup');
const selectedNumberText = document.getElementById('selectedNumberText');
const betButton = document.getElementById('betButton');
const gameIdValue = document.getElementById('gameIdValue');
const betSummaryText = document.getElementById('betSummaryText');
const selectedNumbersValue = document.getElementById('selectedNumbersValue');
const markText = document.getElementById('markText');
const statusBanner = document.getElementById('statusBanner');
const statusMessage = document.getElementById('statusMessage');
const popupClose = document.getElementById('popupClose');
const menuToggle = document.getElementById('menuToggle');
const sidebarPanel = document.getElementById('sidebarPanel');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarClose = document.getElementById('sidebarClose');
const historyBtn = document.getElementById('historyBtn');
const helpBtn = document.getElementById('helpBtn');
const historyModal = document.getElementById('historyModal');
const historyModalClose = document.getElementById('historyModalClose');
const helpModal = document.getElementById('helpModal');
const helpModalClose = document.getElementById('helpModalClose');
const historyContent = document.getElementById('historyContent');

// In-session bet history log
const betHistory = [];

// App preferences (in-memory)
const prefs = { sound: true, notifications: true };

const statusSteps = [
  'Connecting to Telegram services',
  'Loading mini app resources',
  'Syncing dashboard data',
  'Almost ready...'
];
let currentStep = 0;

let countdownInterval = null;
let countdownSeconds = 60;
const pages = [
  { start: 1, end: 100 },
  { start: 101, end: 200 },
  { start: 201, end: 300 }
];
let currentPageIndex = 0;

// ── Bet state ──────────────────────────────────────────────
let selectedNumbers = [];    // pending picks not yet confirmed
let bettedNumbers = [];      // flat union of all confirmed bet numbers (grid display)
let betEntries = [];         // array of { numbers: [...] } — one per placed bet
let pendingCancelEntry = null; // { numbers: [...] } set when user taps a teal number
let betPlaced = false;       // true when at least one bet is active

// map: number → array of usernames who have betted it (from other players)
let otherPlayersBets = {};   // e.g. { 1: ['BingoBot'], 5: ['LuckyLena', 'BingoBot'] }

// ── Backend-driven timer ───────────────────────────────────
let timerPollInterval = null;
let redirecting = false; // prevent double-redirect

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(s / 60)).padStart(2, '0');
  const remainder = String(s % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

// startCountdown is now a no-op — real timer comes from startTimerPoll
function startCountdown() {}

function startTimerPoll(stage, amount) {
  if (timerPollInterval) { clearInterval(timerPollInterval); timerPollInterval = null; }
  redirecting = false;

  function fetchAndDisplay() {
    fetch(`${getEnvApiUrl()}/stage/${stage}/amount/${amount}/timer`)
      .then((r) => r.json())
      .then((data) => {
        if (!data || typeof data.remaining !== 'number') return;

        if (countdownTimer) countdownTimer.textContent = formatTime(data.remaining);

        // when timer hits 0, do a 3-second visual countdown then redirect
        if (data.remaining <= 0 && !redirecting) {
          redirecting = true;
          clearInterval(timerPollInterval);
          timerPollInterval = null;
          startRedirectCountdown(stage, amount);
        }
      })
      .catch(() => {});
  }

  fetchAndDisplay();
  timerPollInterval = setInterval(fetchAndDisplay, 1000);
}

function startRedirectCountdown(stage, amount) {
  let count = 3;
  if (countdownTimer) {
    countdownTimer.textContent = String(count);
    countdownTimer.classList.add('countdown-flash');
  }

  const flashInterval = setInterval(() => {
    count -= 1;
    if (countdownTimer) countdownTimer.textContent = count > 0 ? String(count) : '🎯';
    if (count <= 0) {
      clearInterval(flashInterval);

      // ── Capture game data from live DOM ──
      const gidEl   = document.getElementById('gameIdValue');
      const plEl    = document.getElementById('playersValue');
      const markEl  = document.getElementById('markText');
      const gameId  = (gidEl  ? gidEl.textContent  : '').replace('#', '').trim() || '';
      const players = (plEl   ? plEl.textContent   : '').replace('joined', '').trim() || '0';
      const markRaw = (markEl ? markEl.textContent : '').replace('Mark table:', '').trim() || '';

      // ── Capture player info from authState ──
      const username = authState.username || '';
      const phone    = authState.phone    || '';
      const balance  = String(authState.balance || 0);
      const token    = authState.token    || '';
      const launch   = authState.launch   || '';

      // payout is calculated by display.js from the backend (total_players × amount)

      const query = new URLSearchParams({
        stage:    String(stage),
        amount:   String(amount),
        gameId,
        players,
        mark:     markRaw,
        username,
        phone,
        balance,
        token,
        launch,
      });

      // Generate the 75-number draw on the backend BEFORE navigating
      // so display.js can immediately fetch and start revealing numbers
      if (gameId) {
        fetch(`${getEnvApiUrl()}/draw/${gameId}/generate`, { method: 'POST' })
          .finally(() => {
            window.location.href = `display.html?${query.toString()}`;
          });
      } else {
        window.location.href = `display.html?${query.toString()}`;
      }
    }
  }, 1000);
}

function updatePageControls() {
  if (!prevPageBtn || !nextPageBtn || !rangeLabel) return;
  const page = pages[currentPageIndex];
  rangeLabel.textContent = `${page.start} - ${page.end}`;
  prevPageBtn.disabled = currentPageIndex === 0;
  nextPageBtn.disabled = currentPageIndex === pages.length - 1;
}

// Find which betEntry contains a given number
function findEntryForNumber(num) {
  return betEntries.find((e) => e.numbers.includes(num)) || null;
}

// Rebuild bettedNumbers flat list from betEntries
function rebuildBettedNumbers() {
  const flat = [];
  betEntries.forEach((e) => e.numbers.forEach((n) => { if (!flat.includes(n)) flat.push(n); }));
  bettedNumbers = flat;
}

function showSelectionPopup(tappedNumber) {
  if (!selectionPopup || !selectedNumberText) return;
  pendingCancelEntry = null;

  // ── Tapped own betted (teal) number → cancel flow ──
  if (tappedNumber !== undefined && bettedNumbers.includes(tappedNumber)) {
    const entry = findEntryForNumber(tappedNumber);
    if (entry) {
      pendingCancelEntry = entry;
      const sorted = [...entry.numbers].sort((a, b) => a - b);
      selectedNumberText.textContent = sorted.join(', ');
      if (betButton) betButton.textContent = 'Cancel This Bet';
      updatePopupOtherBettors(tappedNumber);
      selectionPopup.classList.add('open');
      return;
    }
  }

  // ── Normal pending-selection popup ──
  const pending = [...selectedNumbers].sort((a, b) => a - b);
  selectedNumberText.textContent = pending.length > 0 ? pending.join(', ') : '--';

  // show who else betted the tapped number (if any)
  updatePopupOtherBettors(tappedNumber);

  if (betButton) {
    if (betPlaced && pending.length > 0) betButton.textContent = 'Bet More';
    else betButton.textContent = 'Bet';
  }
  renderSelectedNumbers();
  selectionPopup.classList.add('open');
}

// Renders the "Already betted by: X, Y" banner inside the popup
function updatePopupOtherBettors(number) {
  // find or create the other-bettors banner inside the popup
  let banner = document.getElementById('otherBettorsBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'otherBettorsBanner';
    banner.className = 'other-bettors-banner';
    // insert right after the selection-header
    const header = selectionPopup.querySelector('.selection-header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(banner, header.nextSibling);
    }
  }

  const others = (number !== undefined && otherPlayersBets[number]) ? otherPlayersBets[number] : [];
  if (others.length > 0) {
    banner.innerHTML = `<span class="other-bettors-icon">⚠️</span> Already betted by: <strong>${others.join(', ')}</strong>`;
    banner.style.display = 'flex';
    // mark the bet button to reflect this
    if (betButton && !bettedNumbers.includes(number)) {
      betButton.textContent = betPlaced ? 'Bet More Anyway' : 'Bet Anyway';
    }
  } else {
    banner.style.display = 'none';
  }
}

function hideSelectionPopup() {
  if (!selectionPopup) return;
  selectionPopup.classList.remove('open');
  pendingCancelEntry = null;
  // hide other-bettors banner
  const banner = document.getElementById('otherBettorsBanner');
  if (banner) banner.style.display = 'none';
  // restore button label after closing
  refreshBetButtonState();
}

let statusTimeout = null;

function showStatus(message, type = 'info', duration = 3000) {
  if (!statusBanner || !statusMessage) return;
  statusMessage.textContent = message;
  statusBanner.className = `status-banner ${type}`;
  statusBanner.style.display = 'block';
  if (statusTimeout) { clearTimeout(statusTimeout); statusTimeout = null; }
  if (duration > 0) {
    statusTimeout = setTimeout(() => { hideStatus(); }, duration);
  }
}

function hideStatus() {
  if (!statusBanner) return;
  statusBanner.style.display = 'none';
  statusBanner.className = 'status-banner';
  statusMessage.textContent = '';
  if (statusTimeout) { clearTimeout(statusTimeout); statusTimeout = null; }
}

function renderSelectedNumbers() {
  if (!selectedNumbersValue) return;
  selectedNumbersValue.textContent = selectedNumbers.length > 0
    ? `Selected numbers: ${selectedNumbers.join(', ')}`
    : 'Selected numbers: none';
}

function getCurrentBetConfig() {
  const stageElement = document.querySelector('.mini-header-select[data-select="stage"] .select-value');
  const amountElement = document.querySelector('.mini-header-select[data-select="amount"] .select-value');
  return {
    gameId: `G-id=${gameIdValue?.textContent || '#BNG-4172'}`,
    stage: stageElement?.textContent || 'Stage 1',
    amount: amountElement?.textContent || '$10',
  };
}

function updateBetSummary() {
  if (!betSummaryText) return;
  const betConfig = getCurrentBetConfig();
  if (selectedNumbers.length === 0 && !betPlaced) {
    betSummaryText.textContent = 'No active bet selected';
    renderSelectedNumbers();
    return;
  }
  const numbers = selectedNumbers.length === 0 ? 'None' : selectedNumbers.join(', ');
  const statusText = betPlaced ? 'Placed' : 'Pending';
  betSummaryText.textContent = `${betConfig.gameId} · ${betConfig.stage} · ${betConfig.amount} · Numbers: ${numbers} · ${statusText}`;
  renderSelectedNumbers();
  refreshBetButtonState();
}

function refreshStageAmountControls() {
  document.querySelectorAll('.mini-header-select .select-trigger').forEach((trigger) => {
    if (betPlaced) {
      trigger.disabled = true;
      trigger.classList.add('select-trigger-disabled');
      trigger.setAttribute('aria-disabled', 'true');
    } else {
      trigger.disabled = false;
      trigger.classList.remove('select-trigger-disabled');
      trigger.setAttribute('aria-disabled', 'false');
    }
  });
}

function refreshBetButtonState() {
  if (!betButton) return;
  refreshStageAmountControls();

  // if popup is open showing a cancel-entry, button already set by showSelectionPopup
  if (pendingCancelEntry) {
    betButton.disabled = false;
    betButton.classList.remove('disabled');
    betButton.textContent = 'Cancel This Bet';
    return;
  }

  if (betPlaced && selectedNumbers.length === 0) {
    betButton.disabled = false;
    betButton.classList.remove('disabled');
    betButton.textContent = 'Cancel All Bets';
    return;
  }

  if (betPlaced && selectedNumbers.length > 0) {
    betButton.disabled = false;
    betButton.classList.remove('disabled');
    betButton.textContent = 'Bet More';
    return;
  }

  const shouldDisable = selectedNumbers.length === 0;
  betButton.disabled = shouldDisable;
  betButton.classList.toggle('disabled', shouldDisable);
  betButton.textContent = 'Bet';
}

function clearSelectedNumbers() {
  selectedNumbers = [];
  bettedNumbers = [];
  betEntries = [];
  pendingCancelEntry = null;
  betPlaced = false;
  otherPlayersBets = {};
  renderNumberGrid(currentPageIndex);
  const stageElInit = document.querySelector('.mini-header-select[data-select="stage"] .select-value');
  const amountElInit = document.querySelector('.mini-header-select[data-select="amount"] .select-value');
  if (stageElInit && amountElInit) {
    const si = parseInt((stageElInit.textContent || '').replace(/[^0-9]/g, ''), 10) || 1;
    const ai = parseInt((amountElInit.textContent || '').replace(/[^0-9]/g, ''), 10) || 10;
    loadStageData(si, ai);
  }
  updateBetSummary();
}

function toggleNumberSelection(value) {
  if (bettedNumbers.includes(value)) return; // teal numbers are managed via popup cancel
  const idx = selectedNumbers.indexOf(value);
  if (idx !== -1) selectedNumbers.splice(idx, 1);
  else selectedNumbers.push(value);
  updateBetSummary();
  renderNumberGrid(currentPageIndex);
}

function renderNumberGrid(pageIndex = 0) {
  if (!numberGrid) return;
  const page = pages[pageIndex];
  numberGrid.innerHTML = '';
  for (let value = page.start; value <= page.end; value += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'number-button';
    button.textContent = String(value);
    const isBetted = bettedNumbers.includes(value);          // my bet — teal
    const isOther = !isBetted && !!otherPlayersBets[value];  // others' bet — orange
    const isSelected = selectedNumbers.includes(value);      // pending — blue

    if (isBetted) button.classList.add('betted');
    else if (isOther) button.classList.add('other-betted');
    else if (isSelected) button.classList.add('active');

    button.addEventListener('click', () => {
      if (isBetted) {
        showSelectionPopup(value); // cancel flow
        return;
      }
      toggleNumberSelection(value);
      showSelectionPopup(value);  // shows warning if others betted this number
    });
    numberGrid.appendChild(button);
  }
  updatePageControls();
}

function goToPage(index) {
  if (index < 0 || index >= pages.length) return;
  currentPageIndex = index;
  renderNumberGrid(currentPageIndex);
}

function showDashboard() {
  loadingScreen.classList.remove('screen-visible');
  dashboardScreen.classList.add('screen-visible');
  // start the timer poll for the currently selected stage/amount
  const stageEl = document.querySelector('.mini-header-select[data-select="stage"] .select-value');
  const amountEl = document.querySelector('.mini-header-select[data-select="amount"] .select-value');
  const s = stageEl ? (parseInt((stageEl.textContent || '').replace(/[^0-9]/g, ''), 10) || 1) : 1;
  const a = amountEl ? (parseInt((amountEl.textContent || '').replace(/[^0-9]/g, ''), 10) || 10) : 10;
  startTimerPoll(s, a);
  // load stage data now that auth is confirmed and phone is valid
  loadStageData(s, a);
}

function getEnvApiUrl() {
  if (window?.VITE_API_URL) return window.VITE_API_URL;
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return isLocal ? 'http://localhost:5000/api' : 'https://bingo-i1br.onrender.com/api';
}

function getCurrentUser() { return authState; }

async function syncPlayerWithBingoBackend() {
  if (!authState.phone || authState.phone === '-' || !authState.verified) return;

  const response = await fetch(`${getEnvApiUrl()}/players/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      launch: authState.launch,
      username: authState.username,
      phone: authState.phone,
      balance: authState.balance,
    }),
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { error: `Bingo player sync endpoint returned HTTP ${response.status}` };
  if (!response.ok || !data.user) {
    throw new Error(data.error || 'Bingo player synchronization failed');
  }

  authState = {
    ...authState,
    username: data.user.username || authState.username,
    phone: data.user.phone || authState.phone,
    balance: Number(data.user.balance ?? authState.balance),
  };
  if (window.auth && window.auth.updateAuthUi) window.auth.updateAuthUi(authState);
}

function advanceLoading() {
  if (currentStep < statusSteps.length) {
    loadingStatus.textContent = statusSteps[currentStep];
    currentStep += 1;
    setTimeout(advanceLoading, 900);
  } else {
    showDashboard();
  }
}

function openSidebar() {
  const sa = document.getElementById('sidebarAvatar');
  const sn = document.getElementById('sidebarUsername');
  const sp = document.getElementById('sidebarPhone');
  const sb = document.getElementById('sidebarBalance');
  if (sa) sa.textContent = (authState.username || 'G').charAt(0).toUpperCase();
  if (sn) sn.textContent = authState.username || 'Guest';
  if (sp) sp.textContent = authState.phone || '-';
  if (sb) sb.textContent = `$${authState.balance || 0}`;
  sidebarPanel.classList.add('open');
  sidebarOverlay.classList.add('visible');
  sidebarPanel.setAttribute('aria-hidden', 'false');
}

function closeSidebar() {
  sidebarPanel.classList.remove('open');
  sidebarOverlay.classList.remove('visible');
  sidebarPanel.setAttribute('aria-hidden', 'true');
}

function openModal(el) { if (!el) return; el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
function closeModal(el) { if (!el) return; el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }

function setToggle(el, value) {
  if (!el) return;
  if (value) { el.classList.add('toggle-on'); el.classList.remove('toggle-off'); el.setAttribute('aria-checked', 'true'); }
  else { el.classList.remove('toggle-on'); el.classList.add('toggle-off'); el.setAttribute('aria-checked', 'false'); }
}

function flipToggle(key, ...toggleEls) {
  prefs[key] = !prefs[key];
  toggleEls.forEach((el) => setToggle(el, prefs[key]));
}

function openHistoryModal() {
  // always fetch fresh from database
  const phone = authState.phone;
  if (!phone || phone === '-') {
    renderHistoryContent([]);
    openModal(historyModal);
    return;
  }
  fetch(`${getEnvApiUrl()}/players/history?phone=${encodeURIComponent(phone)}`)
    .then((r) => r.json())
    .then((data) => {
      renderHistoryContent(data.history || []);
    })
    .catch(() => {
      renderHistoryContent([]);
    });
  openModal(historyModal);
}
function closeHistoryModal() { closeModal(historyModal); }

function renderHistoryContent(dbHistory) {
  if (!historyContent) return;

  // merge in-session entries (placed/canceled this session) with DB history
  // DB gives us placed bets; in-session has cancellations too
  const items = dbHistory && dbHistory.length > 0 ? dbHistory : [];

  if (items.length === 0 && betHistory.length === 0) {
    historyContent.innerHTML = `<div class="history-empty"><span class="history-empty-icon">📋</span><p>No bet history yet.</p><p class="history-empty-sub">Your placed bets will appear here.</p></div>`;
    return;
  }

  // render DB history rows
  const dbRows = items.map((h) => `
    <div class="history-item history-item-placed">
      <div class="history-item-left">
        <span class="history-item-icon">🎯</span>
        <div class="history-item-info">
          <div class="history-item-label">Bet Placed</div>
          <div class="history-item-detail">Game #${h.gameId} · Stage ${h.stage} · $${h.amount}</div>
          <div class="history-item-numbers">Numbers: ${h.numbers.join(', ')}</div>
        </div>
      </div>
      <div class="history-item-time">${h.placedAt ? new Date(h.placedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
    </div>`).join('');

  // render in-session canceled entries (not in DB)
  const cancelRows = betHistory
    .filter((h) => h.type === 'canceled')
    .slice().reverse()
    .map((h) => `
    <div class="history-item history-item-canceled">
      <div class="history-item-left">
        <span class="history-item-icon">❌</span>
        <div class="history-item-info">
          <div class="history-item-label">Bet Canceled</div>
          <div class="history-item-detail">Game ${h.gameId} · ${h.stage} · $${h.amount}</div>
          <div class="history-item-numbers">Numbers: ${h.numbers.join(', ')}</div>
        </div>
      </div>
      <div class="history-item-time">${h.time}</div>
    </div>`).join('');

  historyContent.innerHTML = cancelRows + dbRows || `<div class="history-empty"><span class="history-empty-icon">📋</span><p>No bet history yet.</p></div>`;
}

function addHistoryEntry(type, gameId, stage, amount, numbers) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  betHistory.push({ type, gameId, stage, amount, numbers: [...numbers], time });
}

function openHelpModal() { openModal(helpModal); }
function closeHelpModal() { closeModal(helpModal); }

function openProfileModal() {
  const pal = document.getElementById('profileAvatarLarge');
  const pnl = document.getElementById('profileNameLarge');
  const ppl = document.getElementById('profilePhoneLarge');
  const pb  = document.getElementById('profileBalance');
  const pt  = document.getElementById('profileToken');
  const pbp = document.getElementById('profileBetsPlaced');
  if (pal) pal.textContent = (authState.username || 'G').charAt(0).toUpperCase();
  if (pnl) pnl.textContent = authState.username || 'Guest';
  if (ppl) ppl.textContent = authState.phone || '-';
  if (pb)  pb.textContent  = `$${authState.balance || 0}`;
  if (pt)  pt.textContent  = authState.token || 'none';
  if (pbp) pbp.textContent = betHistory.filter((h) => h.type === 'placed').length;
  closeSidebar();
  openModal(document.getElementById('profileModal'));
}

function openSettingsModal() {
  setToggle(document.getElementById('settingsSoundToggle'), prefs.sound);
  setToggle(document.getElementById('settingsNotifToggle'), prefs.notifications);
  closeSidebar();
  openModal(document.getElementById('settingsModal'));
}

function openLogoutModal() { closeSidebar(); openModal(document.getElementById('logoutModal')); }

function closeSelects(except = null) {
  document.querySelectorAll('.mini-header-select').forEach((select) => {
    if (select !== except) {
      select.classList.remove('open');
      const trigger = select.querySelector('.select-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
  });
}

function setupSelectDropdowns() {
  document.querySelectorAll('.mini-header-select').forEach((select) => {
    const trigger = select.querySelector('.select-trigger');
    const valueDisplay = select.querySelector('.select-value');
    const items = select.querySelectorAll('.select-item');
    if (!trigger) return;

    trigger.addEventListener('click', (event) => {
      if (betPlaced) {
        event.stopPropagation();
        showStatus('Cancel your active bets before changing stage or amount.', 'error');
        return;
      }
      event.stopPropagation();
      const open = select.classList.toggle('open');
      trigger.setAttribute('aria-expanded', open.toString());
      if (open) closeSelects(select);
    });

    items.forEach((item) => {
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        const selectedValue = item.dataset.value || item.textContent;
        valueDisplay.textContent = selectedValue;
        items.forEach((btn) => btn.classList.remove('active'));
        item.classList.add('active');
        select.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        clearSelectedNumbers();
        const stageEl = document.querySelector('.mini-header-select[data-select="stage"] .select-value');
        const amountEl = document.querySelector('.mini-header-select[data-select="amount"] .select-value');
        if (stageEl && amountEl) {
          const s = parseInt((stageEl.textContent || '').replace(/[^0-9]/g, ''), 10) || 1;
          const a = parseInt((amountEl.textContent || '').replace(/[^0-9]/g, ''), 10) || 10;
          startTimerPoll(s, a);
          loadStageData(s, a);
        }
      });
    });
  });
}

function loadStageData(stage, amount) {
  // guard: do not parse mark if phone is not authenticated yet
  const myPhone = authState.phone;
  if (!myPhone || myPhone === '-' || myPhone === '') {
    // still fetch to show game id / players count, but skip mark parsing
  }

  const apiUrl = `${getEnvApiUrl()}/stage/${stage}/amount/${amount}`;
  fetch(apiUrl)
    .then((r) => r.json())
    .then((data) => {
      if (!data) return;
      const playersEl = document.getElementById('playersValue');
      if (!playersEl) return;

      if (data.rows && data.rows.length) {
        const latest = data.rows[0];
        const total = latest.total_players || data.rows.reduce((acc, r) => acc + (r.total_players || 0), 0);
        playersEl.textContent = `${total} joined`;
        const gidEl = document.getElementById('gameIdValue');
        if (gidEl) gidEl.textContent = latest.game_id ? `#${latest.game_id}` : gidEl.textContent;

        const mark = latest.mark || '';
        if (markText) markText.textContent = mark ? `Mark table: ${mark}` : 'No current mark data';

        // Re-read authState.phone here (not from outer closure) so it's always current
        const currentPhone = authState.phone;
        const phoneValid = currentPhone && currentPhone !== '-' && currentPhone !== '';

        const allEntries = mark.split(',').map((s) => s.trim()).filter(Boolean);

        // Parse each entry — supports both formats:
        //   new: "username|phone:num1|num2"
        //   old: "phone:num1|num2"
        const myRawEntries = [];
        const newOtherBets = {};

        allEntries.forEach((entry) => {
          const colonIdx = entry.indexOf(':');
          if (colonIdx === -1) return;

          const beforeColon = entry.slice(0, colonIdx); // "username|phone" OR "phone"
          const numStr = entry.slice(colonIdx + 1);     // "num1|num2"
          const nums = numStr.split('|').map((n) => parseInt(n, 10)).filter(Boolean);
          if (nums.length === 0) return;

          const pipeIdx = beforeColon.indexOf('|');
          let entryUsername, entryPhone;
          if (pipeIdx !== -1) {
            entryUsername = beforeColon.slice(0, pipeIdx);
            entryPhone = beforeColon.slice(pipeIdx + 1);
          } else {
            entryPhone = beforeColon;
            entryUsername = entryPhone;
          }

          // only classify as "mine" if phone is valid and matches exactly
          if (phoneValid && entryPhone === currentPhone) {
            myRawEntries.push({ entry, nums });
          } else {
            nums.forEach((n) => {
              if (!newOtherBets[n]) newOtherBets[n] = [];
              if (!newOtherBets[n].includes(entryUsername)) {
                newOtherBets[n].push(entryUsername);
              }
            });
          }
        });

        otherPlayersBets = newOtherBets;

        if (myRawEntries.length > 0) {
          betPlaced = true;
          betEntries = myRawEntries.map((e) => ({ numbers: e.nums }));
          rebuildBettedNumbers();
          selectedNumbers = selectedNumbers.filter((n) => !bettedNumbers.includes(n));
          renderNumberGrid(currentPageIndex);
        } else {
          betPlaced = false;
          betEntries = [];
          bettedNumbers = [];
          selectedNumbers = [];
          renderNumberGrid(currentPageIndex);
        }
        refreshBetButtonState();
      } else {
        playersEl.textContent = '0 joined';
        if (markText) markText.textContent = 'No current mark data';
        betPlaced = false;
        betEntries = [];
        bettedNumbers = [];
        selectedNumbers = [];
        otherPlayersBets = {};
        renderNumberGrid(currentPageIndex);
        refreshBetButtonState();
      }
      updateBetSummary();
    })
    .catch((err) => { console.warn('Failed to load stage data', err); });
}

window.addEventListener('DOMContentLoaded', async () => {
  if (window.auth && window.auth.resolveAuthState) {
    authState = await window.auth.resolveAuthState();
    if (window.auth.updateAuthUi) window.auth.updateAuthUi(authState);
  }

  if (window.auth && window.auth.updateAuthUi) window.auth.updateAuthUi(authState);
  setupSelectDropdowns();

  const isAuth = window.auth && window.auth.isAuthenticated && window.auth.isAuthenticated(authState);
  if (!isAuth) {
    if (window.auth && window.auth.showAuthModal) window.auth.showAuthModal();
    const onAuthChanged = (e) => {
      authState = e.detail;
      if (window.auth && window.auth.updateAuthUi) window.auth.updateAuthUi(authState);
      if (window.auth && window.auth.hideAuthModal) window.auth.hideAuthModal();
      // now that phone is available, reload stage data so marks are parsed correctly
      const stEl = document.querySelector('.mini-header-select[data-select="stage"] .select-value');
      const amEl = document.querySelector('.mini-header-select[data-select="amount"] .select-value');
      const s2 = stEl ? (parseInt((stEl.textContent || '').replace(/[^0-9]/g, ''), 10) || 1) : 1;
      const a2 = amEl ? (parseInt((amEl.textContent || '').replace(/[^0-9]/g, ''), 10) || 10) : 10;
      loadStageData(s2, a2);
      setTimeout(advanceLoading, 900);
      window.removeEventListener('auth:changed', onAuthChanged);
    };
    window.addEventListener('auth:changed', onAuthChanged);
    return;
  }

  try {
    await syncPlayerWithBingoBackend();
  } catch (error) {
    console.error('[bingo-auth] player sync failed:', error.message);
    showStatus('Unable to sync your Bingo account. Please try again.', 'error', 0);
    return;
  }

  setTimeout(advanceLoading, 900);

  if (menuToggle) menuToggle.addEventListener('click', openSidebar);
  if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

  if (historyBtn) historyBtn.addEventListener('click', (e) => { e.stopPropagation(); openHistoryModal(); });
  if (historyModalClose) historyModalClose.addEventListener('click', closeHistoryModal);
  if (historyModal) historyModal.addEventListener('click', (e) => { if (e.target === historyModal) closeHistoryModal(); });

  if (helpBtn) helpBtn.addEventListener('click', (e) => { e.stopPropagation(); openHelpModal(); });
  if (helpModalClose) helpModalClose.addEventListener('click', closeHelpModal);
  if (helpModal) helpModal.addEventListener('click', (e) => { if (e.target === helpModal) closeHelpModal(); });

  const menuProfileBtn  = document.getElementById('menuProfileBtn');
  const menuSoundBtn    = document.getElementById('menuSoundBtn');
  const menuNotifBtn    = document.getElementById('menuNotifBtn');
  const menuSettingsBtn = document.getElementById('menuSettingsBtn');
  const menuLogoutBtn   = document.getElementById('menuLogoutBtn');
  const soundToggleEl   = document.getElementById('soundToggle');
  const notifToggleEl   = document.getElementById('notifToggle');

  if (menuProfileBtn) menuProfileBtn.addEventListener('click', openProfileModal);
  if (menuSoundBtn) menuSoundBtn.addEventListener('click', () => { flipToggle('sound', soundToggleEl, document.getElementById('settingsSoundToggle')); });
  if (menuNotifBtn) menuNotifBtn.addEventListener('click', () => { flipToggle('notifications', notifToggleEl, document.getElementById('settingsNotifToggle')); });
  if (menuSettingsBtn) menuSettingsBtn.addEventListener('click', openSettingsModal);
  if (menuLogoutBtn) menuLogoutBtn.addEventListener('click', openLogoutModal);

  const profileModal = document.getElementById('profileModal');
  const profileModalClose = document.getElementById('profileModalClose');
  if (profileModalClose) profileModalClose.addEventListener('click', () => closeModal(profileModal));
  if (profileModal) profileModal.addEventListener('click', (e) => { if (e.target === profileModal) closeModal(profileModal); });

  const settingsModal = document.getElementById('settingsModal');
  const settingsModalClose = document.getElementById('settingsModalClose');
  const settingsSoundToggle = document.getElementById('settingsSoundToggle');
  const settingsNotifToggle = document.getElementById('settingsNotifToggle');
  if (settingsModalClose) settingsModalClose.addEventListener('click', () => closeModal(settingsModal));
  if (settingsModal) settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeModal(settingsModal); });
  if (settingsSoundToggle) settingsSoundToggle.addEventListener('click', () => { flipToggle('sound', soundToggleEl, settingsSoundToggle); });
  if (settingsNotifToggle) settingsNotifToggle.addEventListener('click', () => { flipToggle('notifications', notifToggleEl, settingsNotifToggle); });

  const logoutModal = document.getElementById('logoutModal');
  const logoutModalClose = document.getElementById('logoutModalClose');
  const logoutCancelBtn = document.getElementById('logoutCancelBtn');
  const logoutConfirmBtn = document.getElementById('logoutConfirmBtn');
  if (logoutModalClose) logoutModalClose.addEventListener('click', () => closeModal(logoutModal));
  if (logoutModal) logoutModal.addEventListener('click', (e) => { if (e.target === logoutModal) closeModal(logoutModal); });
  if (logoutCancelBtn) logoutCancelBtn.addEventListener('click', () => closeModal(logoutModal));
  if (logoutConfirmBtn) logoutConfirmBtn.addEventListener('click', () => { window.location.href = window.location.pathname; });

  if (popupClose) popupClose.addEventListener('click', hideSelectionPopup);

  updateBetSummary();

  if (betButton) {
    betButton.addEventListener('click', async () => {
      const stageEl = document.querySelector('.mini-header-select[data-select="stage"] .select-value');
      const amountEl = document.querySelector('.mini-header-select[data-select="amount"] .select-value');
      const s = parseInt((stageEl.textContent || '').replace(/[^0-9]/g, ''), 10) || 1;
      const a = parseInt((amountEl.textContent || '').replace(/[^0-9]/g, ''), 10) || 10;

      // ── Cancel a specific bet entry (tapped a teal number) ──
      if (pendingCancelEntry) {
        const entryNums = [...pendingCancelEntry.numbers];
        showStatus('Canceling bet...', 'loading', 0);
        try {
          const res = await fetch(`${getEnvApiUrl()}/stage/${s}/amount/${a}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: authState.phone, numbers: entryNums }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data && data.message ? data.message : 'Failed to cancel bet');
          // remove this entry from betEntries
          betEntries = betEntries.filter((e) => e !== pendingCancelEntry);
          rebuildBettedNumbers();
          pendingCancelEntry = null;
          betPlaced = betEntries.length > 0;
          addHistoryEntry('canceled', gameIdValue ? gameIdValue.textContent : '-', `Stage ${s}`, a, entryNums);
          hideSelectionPopup();
          if (betEntries.length === 0 && markText) markText.textContent = 'No current mark data';
          renderNumberGrid(currentPageIndex);
          updateBetSummary();
          refreshBetButtonState();
          loadStageData(s, a);
          showStatus('Bet canceled successfully', 'success');
        } catch (err) {
          console.error('Cancel failed', err);
          showStatus(`Failed to cancel bet: ${err.message || err}`, 'error');
        }
        return;
      }

      // ── Cancel ALL bets (betPlaced, no pending selection) ──
      if (betPlaced && selectedNumbers.length === 0) {
        const allNums = [...bettedNumbers];
        showStatus('Canceling all bets...', 'loading', 0);
        try {
          const res = await fetch(`${getEnvApiUrl()}/stage/${s}/amount/${a}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: authState.phone }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data && data.message ? data.message : 'Failed to cancel bets');
          betPlaced = false;
          betEntries = [];
          bettedNumbers = [];
          selectedNumbers = [];
          pendingCancelEntry = null;
          document.querySelectorAll('.number-button').forEach((btn) => btn.classList.remove('betted', 'active'));
          hideSelectionPopup();
          if (markText) markText.textContent = 'No current mark data';
          addHistoryEntry('canceled', gameIdValue ? gameIdValue.textContent : '-', `Stage ${s}`, a, allNums);
          updateBetSummary();
          refreshBetButtonState();
          renderNumberGrid(currentPageIndex);
          loadStageData(s, a);
          showStatus('All bets canceled successfully', 'success');
        } catch (err) {
          console.error('Cancel all failed', err);
          showStatus(`Failed to cancel bets: ${err.message || err}`, 'error');
        }
        return;
      }

      // ── Place a new bet ──
      if (selectedNumbers.length === 0) {
        showStatus('Select at least one number before placing a bet.', 'error');
        return;
      }

      const payload = {
        phone: authState.phone,
        username: authState.username,
        balance: authState.balance,
        numbers: [...selectedNumbers],
      };

      try {
        showStatus('Placing bet...', 'loading', 0);
        const res = await fetch(`${getEnvApiUrl()}/stage/${s}/amount/${a}/bet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data && data.message ? data.message : 'Failed to place bet');
        betPlaced = true;
        const newEntry = { numbers: [...selectedNumbers] };
        betEntries.push(newEntry);
        rebuildBettedNumbers();
        selectedNumbers = [];
        addHistoryEntry('placed', data.result.gameId, `Stage ${s}`, a, newEntry.numbers);
        renderNumberGrid(currentPageIndex);
        updateBetSummary();
        refreshBetButtonState();
        hideSelectionPopup();
        loadStageData(s, a);
        showStatus(`Bet accepted in game ${data.result.gameId}`, 'success');
      } catch (err) {
        console.error('Bet failed', err);
        showStatus(`Failed to place bet: ${err.message || err}`, 'error');
      }
    });
  }

  if (prevPageBtn) prevPageBtn.addEventListener('click', () => { goToPage(currentPageIndex - 1); });
  if (nextPageBtn) nextPageBtn.addEventListener('click', () => { goToPage(currentPageIndex + 1); });

  renderNumberGrid(currentPageIndex);

  document.addEventListener('click', () => { closeSelects(); });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSidebar();
      closeSelects();
      closeHistoryModal();
      closeHelpModal();
      closeModal(document.getElementById('profileModal'));
      closeModal(document.getElementById('settingsModal'));
      closeModal(document.getElementById('logoutModal'));
      hideSelectionPopup();
    }
  });
});

if (startChatBtn) {
  startChatBtn.addEventListener('click', () => {
    alert('Chat flow will open here in the next iteration.');
  });
}
