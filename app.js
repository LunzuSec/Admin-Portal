/* Lunzu Secondary — Admin Dashboard */

const API_URL = 'https://script.google.com/macros/s/AKfycbzB5TYa8Xbw5OT90Fh9UC3LoCYJaqxBkAPuBtrQFNNVB3sMcUfrlG0drVn3xxf8SeZoKg/exec';

(function ensureChartJS() {
  if (typeof Chart !== 'undefined') return;
  const alt = document.createElement('script');
  alt.src = 'https://unpkg.com/chart.js@4.4.0/dist/chart.umd.min.js';
  alt.async = false;
  document.head.appendChild(alt);
})();

const CACHE_KEY = 'lss_dashboard_cache_v11';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const TERM1_COLUMNS = ['SEPT', 'OCT', 'NOV', 'DEC', 'PAPER 1', 'PAPER 2', 'PAPER 3'];

const state = {
  apiUrl: API_URL,
  apiToken: '',
  summary: null,
  submissions: null,
  teachers: null,
  chart: null,
  teacherChart: null,
  activeGroup: 'all',
  activeView: 'overview',
  teacherCache: new Map(),
  modalData: null,
  modalGroupTab: 'Regular',
  modalView: 'summary',
  pdfBusy: false
};

// ── Loading helpers ─────────────────────────────────

function showOverlay(t, s) {
  const o = document.getElementById('loadingOverlay');
  if (!o) return;
  if (t) document.getElementById('overlayText').textContent = t;
  if (s) document.getElementById('overlaySubtext').textContent = s;
  o.classList.remove('hidden');
}
function hideOverlay() {
  const o = document.getElementById('loadingOverlay');
  if (o) o.classList.add('hidden');
}
function setButtonLoading(id, on) {
  const b = document.getElementById(id);
  if (!b) return;
  b.disabled = on;
  const s = b.querySelector('.btn-spinner');
  const l = b.querySelector('.btn-label');
  if (s) s.classList.toggle('hidden', !on);
  if (l) l.style.opacity = on ? '0.7' : '1';
}
function setStatusLoading(on) {
  const el = document.getElementById('status');
  if (el) el.classList.toggle('loading', on);
}
function setStatus(text, mode) {
  const statusText = document.getElementById('statusText');
  if (statusText) statusText.textContent = text;

  const desktopDot = document.querySelector('#status .dot');
  if (desktopDot) {
    desktopDot.style.background =
      mode === 'error' ? '#dc2626' :
      mode === 'loading' ? '#f59e0b' : '#4ade80';
  }

  const mobile = document.getElementById('mobileStatus');
  if (mobile) {
    mobile.classList.toggle('loading', mode === 'loading');
    const mDot = mobile.querySelector('.dot');
    if (mDot) {
      mDot.style.background =
        mode === 'error' ? '#dc2626' :
        mode === 'loading' ? '#f59e0b' : '#4ade80';
    }
  }
}
function clearSkeletons() {
  const sk = document.getElementById('chartSkeleton');
  if (sk) sk.remove();
  ['submissionsList', 'teachersList'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.querySelectorAll('.skeleton-block').forEach(b => b.remove());
  });
  ['kpiFiles','kpiAll7','kpiPartial','kpiNone','kpiEmpty'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.querySelectorAll('.skeleton').forEach(s => s.remove());
  });
}

// ── View switching ──────────────────────────────────

const VIEW_TITLES = {
  overview:    { title: 'Overview', subtitle: 'Term 1 column-level submission progress' },
  submissions: { title: 'Submissions', subtitle: 'Per-column fill and completion status' },
  teachers:    { title: 'Teachers', subtitle: 'Click a teacher to see their column-level progress' }
};

function switchView(view) {
  state.activeView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById('view-' + view);
  if (target) target.classList.remove('hidden');
  const info = VIEW_TITLES[view] || VIEW_TITLES.overview;
  document.getElementById('viewTitle').textContent = info.title;
  document.getElementById('viewSubtitle').textContent = info.subtitle;
}

// ── Mobile sidebar ──────────────────────────────────

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;
  sidebar.classList.add('open');
  if (backdrop) {
    backdrop.classList.remove('hidden');
    void backdrop.offsetWidth;
    backdrop.classList.add('active');
  }
}
function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) {
    backdrop.classList.remove('active');
    setTimeout(() => backdrop.classList.add('hidden'), 250);
  }
}

// ── Login ───────────────────────────────────────────

document.getElementById('loginBtn').addEventListener('click', async () => {
  const token = document.getElementById('apiToken').value.trim();
  if (!token) {
    document.getElementById('loginError').textContent = 'Please enter the access password.';
    document.getElementById('loginError').style.display = 'block';
    return;
  }
  document.getElementById('loginError').style.display = 'none';
  state.apiUrl = API_URL;
  state.apiToken = token;
  sessionStorage.setItem('lss_dashboard_token', token);
  localStorage.removeItem(CACHE_KEY);
  await loadAll(true);
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem('lss_dashboard_token');
  localStorage.removeItem(CACHE_KEY);
  location.reload();
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  localStorage.removeItem(CACHE_KEY);
  state.teacherCache.clear();
  loadAll(true);
});

window.addEventListener('DOMContentLoaded', () => {
  const savedToken = sessionStorage.getItem('lss_dashboard_token');
  if (savedToken) {
    document.getElementById('apiToken').value = savedToken;
    state.apiUrl = API_URL;
    state.apiToken = savedToken;
    loadAll(false);
  }

  const menuBtn = document.getElementById('menuBtn');
  const closeBtn = document.getElementById('sidebarClose');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (menuBtn) menuBtn.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchView(btn.dataset.view);
      if (window.innerWidth <= 900) closeSidebar();
    });
  });

  document.getElementById('groupTabs').addEventListener('click', e => {
    const btn = e.target.closest('.group-tab');
    if (!btn) return;
    document.querySelectorAll('.group-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeGroup = btn.dataset.group;
    if (state.summary) {
      renderKpis(state.summary);
      renderChart(state.summary);
      renderSubmissions(state.submissions);
    }
  });

  document.getElementById('modalClose').addEventListener('click', closeTeacherModal);
  document.getElementById('modalBack').addEventListener('click', closeTeacherModal);
  document.getElementById('teacherModal').addEventListener('click', e => {
    if (e.target.id === 'teacherModal') closeTeacherModal();
  });

  const modalTabs = document.getElementById('modalGroupTabs');
  if (modalTabs) {
    modalTabs.addEventListener('click', e => {
      const btn = e.target.closest('.modal-tab');
      if (!btn) return;
      modalTabs.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.modalGroupTab = btn.dataset.group;
      renderModalAssignments();
      renderTeacherChart();
    });
  }

  const viewTabs = document.getElementById('modalViewTabs');
  if (viewTabs) {
    viewTabs.addEventListener('click', e => {
      const btn = e.target.closest('.modal-view-tab');
      if (!btn) return;
      viewTabs.querySelectorAll('.modal-view-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.modalView = btn.dataset.view;
      document.getElementById('modalView-summary').classList.toggle('hidden', state.modalView !== 'summary');
      document.getElementById('modalView-assignments').classList.toggle('hidden', state.modalView !== 'assignments');
      if (state.modalView === 'summary') renderTeacherChart();
    });
  }

  document.getElementById('searchInput').addEventListener('input', filterSubmissions);
  document.getElementById('statusFilter').addEventListener('change', filterSubmissions);
  document.getElementById('teacherSearch').addEventListener('input', filterTeachers);

  // Report dialog
  document.getElementById('reportBtn').addEventListener('click', openReportDialog);
  document.getElementById('reportDialogClose').addEventListener('click', closeReportDialog);
  document.getElementById('reportCancelBtn').addEventListener('click', closeReportDialog);
  document.getElementById('reportGenerateBtn').addEventListener('click', generateReport);
  document.getElementById('reportDialog').addEventListener('click', e => {
    if (e.target.id === 'reportDialog') closeReportDialog();
  });
  document.getElementById('reportTypeOptions').addEventListener('change', e => {
    const colField = document.getElementById('reportColumnField');
    const type = e.target.value;
    colField.style.display = (type === 'teachers') ? 'none' : '';
  });
});

// ── Data loading ────────────────────────────────────

async function loadAll(forceFresh) {
  if (!forceFresh) {
    const c = readCache();
    if (c) {
      state.summary = c.summary;
      state.submissions = c.submissions;
      state.teachers = c.teachers;
      renderAll();
      const age = Math.round((Date.now() - c.timestamp) / 60000);
      setStatus(`Loaded from cache (${age}m old)`, 'ready');
      setTimeout(() => backgroundRefresh(), 500);
      return;
    }
  }

  setStatus('Loading summary…', 'loading');
  setStatusLoading(true);
  setButtonLoading('loginBtn', true);
  setButtonLoading('refreshBtn', true);
  showOverlay('Loading summary…',
    'Fetching overview. Submissions and teachers will load in the background.');

  try {
    state.summary = await fetchJSON('summary');
    state.teachers = null;
    state.submissions = null;
    renderKpis(state.summary);
    renderChart(state.summary);
    renderQuickStats(state.summary);
    document.getElementById('loginPanel').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    clearSkeletons();
    setStatus('Summary ready · loading details…', 'loading');
    hideOverlay();

    const [subs, teachers] = await Promise.all([
      fetchJSON('submissions'),
      fetchJSON('teachers')
    ]);
    state.submissions = subs;
    state.teachers = teachers;

    renderSubmissions(state.submissions);
    renderTeachers(state.teachers);
    renderQuickStats(state.summary);

    writeCache();
    const note = state.summary.cached ? 'server cache' : 'fresh';
    setStatus('Connected · ' + note, 'ready');
  } catch (err) {
    const isLoginScreen = !document.getElementById('loginPanel').classList.contains('hidden');
    if (isLoginScreen && err.message === 'unauthorized') {
      const errorEl = document.getElementById('loginError');
      errorEl.textContent = 'Incorrect password. Please try again.';
      errorEl.style.display = 'block';
      sessionStorage.removeItem('lss_dashboard_token');
    } else if (isLoginScreen && err.message.indexOf('Server error') !== -1) {
      const errorEl = document.getElementById('loginError');
      errorEl.textContent = 'Cannot reach the server. Check your connection and try again.';
      errorEl.style.display = 'block';
    } else {
      setStatus('Error: ' + err.message, 'error');
      hideOverlay();
      alert('Failed to load: ' + err.message);
    }
  } finally {
    setStatusLoading(false);
    setButtonLoading('loginBtn', false);
    setButtonLoading('refreshBtn', false);
    hideOverlay();
  }
}

async function backgroundRefresh() {
  try {
    const [summary, subs, teachers] = await Promise.all([
      fetchJSON('summary'),
      fetchJSON('submissions'),
      fetchJSON('teachers')
    ]);
    state.summary = summary;
    state.submissions = subs;
    state.teachers = teachers;
    writeCache();
    renderSubmissions(state.submissions);
    renderTeachers(state.teachers);
    renderQuickStats(state.summary);
    setStatus('Refreshed · ' + (summary.cached ? 'server cache' : 'fresh'), 'ready');
  } catch (e) {
    // Silent — cache stays authoritative
  }
}

function renderAll() {
  clearSkeletons();
  renderKpis(state.summary);
  renderChart(state.summary);
  renderQuickStats(state.summary);
  renderSubmissions(state.submissions);
  renderTeachers(state.teachers);
  document.getElementById('loginPanel').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
}

async function fetchJSON(action) {
  const url = `${state.apiUrl}?action=${action}&token=${encodeURIComponent(state.apiToken)}`;
  const res = await fetch(url);
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); }
  catch (e) { throw new Error('Server error. Check your connection.'); }
  if (json.error) throw new Error(json.error);
  return json;
}

// ── Cache ───────────────────────────────────────────

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (Date.now() - d.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return d;
  } catch (e) { return null; }
}
function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      summary: state.summary,
      submissions: state.submissions,
      teachers: state.teachers
    }));
  } catch (e) {}
}

// ── KPIs ────────────────────────────────────────────

function renderKpis(summary) {
  const t = state.activeGroup === 'all'
    ? summary.totals
    : (summary.totals.byGroup[state.activeGroup] || {
        files: 0, all7: 0, partial: 0, none: 0, empty: 0,
        totalTicked: 0, totalPossibleTicks: 0
      });

  document.getElementById('kpiFiles').textContent = t.files;
  document.getElementById('kpiAll7').textContent = t.all7;
  document.getElementById('kpiPartial').textContent = t.partial;
  document.getElementById('kpiNone').textContent = t.none;
  document.getElementById('kpiEmpty').textContent = t.empty;

  const pct = t.totalPossibleTicks
    ? Math.round((t.totalTicked / t.totalPossibleTicks) * 100)
    : 0;
  const el = document.getElementById('kpiTicked');
  if (el) el.textContent = `${t.totalTicked} / ${t.totalPossibleTicks} (${pct}%)`;
}

function renderQuickStats(summary) {
  const t = summary.totals;
  const pct = t.totalPossibleTicks
    ? Math.round((t.totalTicked / t.totalPossibleTicks) * 100)
    : 0;
  document.getElementById('qsCompletion').textContent = pct + '%';
  document.getElementById('qsYear').textContent =
    (summary.academicYear || '—') + ' · Term 1';

  const teachersData = state.teachers;
  if (teachersData && teachersData.rows) {
    document.getElementById('qsTeachers').textContent = teachersData.rows.length;
    const totalTicked = teachersData.rows.reduce((s, r) => s + r.tickedColumns, 0);
    const totalPossible = teachersData.rows.reduce((s, r) => s + r.possibleColumns, 0);
    document.getElementById('qsAssignments').textContent =
      `${totalTicked} / ${totalPossible} cols`;
  }
}

// ── Chart ───────────────────────────────────────────

function renderChart(summary) {
  const byClass = summary.totals.byClass;
  const classes = Object.keys(byClass)
    .filter(c => state.activeGroup === 'all' || byClass[c].group === state.activeGroup)
    .sort();
  const all7     = classes.map(c => byClass[c].all7);
  const partial  = classes.map(c => byClass[c].partial);
  const none     = classes.map(c => byClass[c].none);
  const empty    = classes.map(c => byClass[c].empty);

  if (typeof Chart === 'undefined') {
    const wrap = document.querySelector('.chart-wrap');
    if (wrap) {
      wrap.innerHTML = '<table style="width:100%;font-size:13px">' +
        '<thead><tr><th>Class</th><th>7/7 completed</th><th>Partial</th><th>Unticked</th><th>Empty</th></tr></thead>' +
        '<tbody>' + classes.map((c, i) =>
          `<tr><td>${c}</td><td>${all7[i]}</td><td>${partial[i]}</td><td>${none[i]}</td><td>${empty[i]}</td></tr>`
        ).join('') + '</tbody></table>';
    }
    return;
  }

  const canvas = document.getElementById('classChart');
  if (!canvas) return;
  if (state.chart) state.chart.destroy();
  state.chart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: classes,
      datasets: [
        { label: '7/7 completed', data: all7,    backgroundColor: '#4d6b3f' },
        { label: 'Partial (1–6)', data: partial, backgroundColor: '#b8860b' },
        { label: 'Unticked',      data: none,    backgroundColor: '#a0522d' },
        { label: 'Empty',         data: empty,   backgroundColor: '#6b7280' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: '#4b5563', font: { family: 'Georgia', size: 11 } } },
        y: { stacked: true, beginAtZero: true, ticks: { color: '#4b5563', font: { family: 'Georgia', size: 11 } } }
      },
      plugins: { legend: { labels: { color: '#1e293b', font: { family: 'Georgia', size: 11 } } } }
    }
  });
}

// ── Column bar renderer ─────────────────────────────

function renderColumnBar(label, cell) {
  const safeCell = cell || { ticked: false, count: 0, total: 0, percent: 0 };
  const pct = Math.max(0, Math.min(100, safeCell.percent || 0));
  const count = safeCell.count || 0;
  const total = safeCell.total || 0;
  const ticked = !!safeCell.ticked;

  const barCls = pct === 0 ? 'empty' : pct < 100 ? 'partial' : '';

  let statusCls, statusText;
  if (ticked) {
    statusCls = 'column-status-complete';
    statusText = '✓ Completed';
  } else if (count > 0) {
    statusCls = 'column-status-partial';
    statusText = 'In progress';
  } else {
    statusCls = 'column-status-empty';
    statusText = 'Not started';
  }

  return `<div class="column-bar-row">
    <span class="column-bar-label">${label}</span>
    <div class="column-bar-track">
      <div class="column-bar-fill ${barCls}" style="width:${pct}%"></div>
    </div>
    <span class="column-bar-meta">
      <strong>${count}</strong> / ${total}
      <span class="muted">(${pct}%)</span>
    </span>
    <span class="column-status ${statusCls}">${statusText}</span>
  </div>`;
}

// ── Submissions ─────────────────────────────────────

function statusOf(row) {
  const t = row.term1.ticked;
  if (t === 7) return 'complete';
  if (t > 0) return 'partial';
  if (row.term1.totalScores > 0) return 'in-progress';
  return 'empty';
}

function statusLabel(row) {
  const t = row.term1.ticked;
  if (t === 7) return '7/7 completed';
  if (t > 0) return `${t}/7 completed`;
  if (row.term1.totalScores > 0) return 'Unticked';
  return 'Not started';
}

function renderSubmissions(data) {
  const container = document.getElementById('submissionsList');
  if (!container) return;
  container.innerHTML = '';

  if (!data || !data.rows) {
    container.innerHTML = '<p class="muted">Loading submissions…</p>';
    return;
  }

  const filtered = data.rows
    .filter(r => state.activeGroup === 'all' || r.group === state.activeGroup)
    .sort((a, b) => a.class.localeCompare(b.class) || a.subject.localeCompare(b.subject));

  if (filtered.length === 0) {
    container.innerHTML = '<p class="muted">No submissions match your filter.</p>';
    return;
  }

  filtered.forEach(row => {
    const card = document.createElement('div');
    card.className = 'submission-card';
    card.dataset.search = `${row.class} ${row.subject}`.toLowerCase();
    card.dataset.status = statusOf(row);

    const t1 = row.term1;
    const sLabel = statusLabel(row);
    const sCls = statusOf(row);

    const bars = TERM1_COLUMNS
      .map(k => renderColumnBar(k, t1.columns[k]))
      .join('');

    const columnsCompleted = t1.ticked;
    const overallPct = Math.round((columnsCompleted / 7) * 100);
    const overallCls = columnsCompleted === 7 ? ''
                     : columnsCompleted > 0   ? 'partial'
                     : 'empty';

    card.innerHTML = `
      <div class="submission-head">
        <div class="submission-title">
          ${row.class} — ${row.subject}
          <small>${row.students} students</small>
        </div>
        <span class="status-pill ${sCls}">${sLabel}</span>
      </div>

      <div class="assignment-section-title">Term 1 columns — entry progress</div>
      <div class="column-bars">${bars}</div>

      <div class="overall-row">
        <div class="overall-bar ${overallCls}">
          <div style="width:${overallPct}%"></div>
        </div>
        <span class="overall-value">${columnsCompleted}/7 completed</span>
      </div>

      <div class="submission-footer">
        <span class="muted">${formatDate(row.lastModified)}</span>
        <a href="${row.fileUrl}" target="_blank" rel="noopener">Open sheet →</a>
      </div>`;
    container.appendChild(card);
  });

  document.getElementById('searchInput').oninput = filterSubmissions;
  document.getElementById('statusFilter').onchange = filterSubmissions;
}

function filterSubmissions() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const s = document.getElementById('statusFilter').value;
  document.querySelectorAll('#submissionsList .submission-card').forEach(card => {
    const okSearch = card.dataset.search.includes(q);
    const okStatus = s === 'all' || card.dataset.status === s;
    card.style.display = okSearch && okStatus ? '' : 'none';
  });
}

// ── Teachers ────────────────────────────────────────

function renderTeachers(data) {
  const container = document.getElementById('teachersList');
  if (!container) return;
  container.innerHTML = '';

  if (!data || !data.rows) {
    container.innerHTML = '<p class="muted">Loading teachers…</p>';
    return;
  }

  const filtered = data.rows.slice().sort((a, b) => a.teacherName.localeCompare(b.teacherName));

  if (filtered.length === 0) {
    container.innerHTML = '<p class="muted">No teachers configured.</p>';
    return;
  }

  filtered.forEach(row => {
    const card = document.createElement('div');
    card.className = 'teacher-card';
    card.dataset.search = `${row.teacherName} ${row.teacherEmail}`.toLowerCase();

    const initials = row.teacherName
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0] || '')
      .join('')
      .toUpperCase();

    const pct = row.possibleColumns
      ? Math.round((row.tickedColumns / row.possibleColumns) * 100)
      : 0;
    const barCls = pct === 0 ? 'empty' : pct < 100 ? 'partial' : '';

    card.innerHTML = `
      <div class="teacher-head">
        <div class="avatar">${initials}</div>
        <div>
          <div class="teacher-name">${row.teacherName}</div>
          <div class="teacher-email">${row.teacherEmail}</div>
        </div>
      </div>

      <div class="teacher-stats">
        <div class="teacher-stat">
          <div class="teacher-stat-label">Assignments</div>
          <div class="teacher-stat-value">${row.assignments}</div>
        </div>
        <div class="teacher-stat">
          <div class="teacher-stat-label">7/7 completed</div>
          <div class="teacher-stat-value good">${row.all7}</div>
        </div>
        <div class="teacher-stat">
          <div class="teacher-stat-label">Columns done</div>
          <div class="teacher-stat-value">${row.tickedColumns}</div>
        </div>
      </div>

      <div class="overall-row">
        <div class="overall-bar ${barCls}">
          <div style="width:${pct}%"></div>
        </div>
        <span class="overall-value">${pct}%</span>
      </div>

      <div class="teacher-open">
        <span>View details</span>
        <span>→</span>
      </div>`;

    card.addEventListener('click', () => openTeacherModal(row.teacherEmail));
    container.appendChild(card);
  });
}

function filterTeachers() {
  const q = document.getElementById('teacherSearch').value.toLowerCase();
  document.querySelectorAll('#teachersList .teacher-card').forEach(card => {
    card.style.display = card.dataset.search.includes(q) ? '' : 'none';
  });
}

// ── Teacher Modal ───────────────────────────────────

async function openTeacherModal(email) {
  const modal = document.getElementById('teacherModal');
  document.getElementById('modalTeacherName').textContent = 'Loading…';
  document.getElementById('modalTeacherEmail').textContent = email;
  document.getElementById('modalAvatar').textContent = '?';
  document.getElementById('modalSummary').innerHTML = '';
  document.getElementById('modalBody').innerHTML = '<p class="muted">Fetching assignments…</p>';
  document.getElementById('modalGroupTabs').style.display = 'none';

  state.modalView = 'summary';
  const viewTabs = document.getElementById('modalViewTabs');
  if (viewTabs) {
    viewTabs.querySelectorAll('.modal-view-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.view === 'summary'));
  }
  document.getElementById('modalView-summary').classList.remove('hidden');
  document.getElementById('modalView-assignments').classList.add('hidden');

  if (state.teacherChart) {
    state.teacherChart.destroy();
    state.teacherChart = null;
  }

  modal.classList.remove('hidden');

  try {
    let data = state.teacherCache.get(email);
    if (!data) {
      const url = `${state.apiUrl}?action=teacher&email=${encodeURIComponent(email)}&token=${encodeURIComponent(state.apiToken)}`;
      const res = await fetch(url);
      const txt = await res.text();
      data = JSON.parse(txt);
      if (data.error) throw new Error(data.error);
      state.teacherCache.set(email, data);
    }

    state.modalData = data;
    document.getElementById('modalTeacherName').textContent = data.teacherName;
    document.getElementById('modalTeacherEmail').textContent = data.teacherEmail;

    const initials = data.teacherName
      .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
    document.getElementById('modalAvatar').textContent = initials || '?';

    document.getElementById('modalSummary').innerHTML =
      `<div class="modal-stat"><div class="modal-stat-label">Assignments</div><div class="modal-stat-value">${data.assignmentCount}</div></div>
       <div class="modal-stat"><div class="modal-stat-label">Columns done</div><div class="modal-stat-value">${data.tickedColumns} / ${data.possibleColumns}</div></div>
       <div class="modal-stat"><div class="modal-stat-label">Avg fill</div><div class="modal-stat-value">${data.avgFillPercent}%</div></div>`;

    const hasRegular = data.assignments.some(a => a.group === 'Regular');
    const hasODL = data.assignments.some(a => a.group === 'ODL');

    const tabsEl = document.getElementById('modalGroupTabs');
    tabsEl.querySelectorAll('.modal-tab').forEach(b => {
      const g = b.dataset.group;
      const show = (g === 'Regular' && hasRegular) || (g === 'ODL' && hasODL);
      b.style.display = show ? '' : 'none';
    });

    if (hasRegular && !hasODL) state.modalGroupTab = 'Regular';
    else if (hasODL && !hasRegular) state.modalGroupTab = 'ODL';
    else if (!hasRegular && !hasODL) state.modalGroupTab = 'Regular';

    tabsEl.querySelectorAll('.modal-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.group === state.modalGroupTab));

    tabsEl.style.display = (hasRegular && hasODL) ? 'flex' : 'none';

    renderModalAssignments();
    renderTeacherChart();
  } catch (err) {
    document.getElementById('modalBody').innerHTML = `<p class="muted">Error: ${err.message}</p>`;
  }
}

function renderModalAssignments() {
  const data = state.modalData;
  if (!data) return;

  const filtered = data.assignments.filter(a => a.group === state.modalGroupTab);

  if (filtered.length === 0) {
    document.getElementById('modalBody').innerHTML =
      `<p class="muted">No ${state.modalGroupTab} assignments.</p>`;
    return;
  }

  document.getElementById('modalBody').innerHTML = filtered.map(a => renderAssignmentCard(a)).join('');
}

function renderAssignmentCard(a) {
  const t1 = a.term1;

  const bars = TERM1_COLUMNS
    .map(k => renderColumnBar(k, t1.columns[k]))
    .join('');

  const columnsCompleted = t1.ticked;
  const sCls = columnsCompleted === 7 ? 'complete'
             : columnsCompleted > 0   ? 'partial'
             : 'empty';
  const sLabel = columnsCompleted === 7 ? '7/7 completed'
               : columnsCompleted > 0   ? `${columnsCompleted}/7 completed`
               : (t1.totalScores > 0 ? 'Unticked' : 'Not started');

  return `
    <div class="assignment-card">
      <div class="assignment-head">
        <div>
          <div class="assignment-title">${a.class} — ${a.subject}</div>
          <div class="assignment-meta">
            ${a.students} students · ${columnsCompleted}/7 columns completed
            <span class="status-pill ${sCls}" style="margin-left:8px">${sLabel}</span>
          </div>
        </div>
        <a href="${a.fileUrl}" target="_blank" rel="noopener">Open sheet →</a>
      </div>

      <div class="assignment-section-title">Term 1 columns — entry progress</div>
      <div class="column-bars">${bars}</div>
    </div>`;
}

// ── Teacher chart ───────────────────────────────────

function renderTeacherChart() {
  const data = state.modalData;
  if (!data) return;

  const canvas = document.getElementById('teacherChart');
  if (!canvas) return;

  const filtered = data.assignments.filter(a => a.group === state.modalGroupTab);

  if (typeof Chart === 'undefined') {
    const wrap = document.querySelector('.modal-chart-wrap');
    if (wrap) {
      wrap.innerHTML =
        '<table style="width:100%;font-size:12px">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:6px">Class — Subject</th>' +
            '<th style="text-align:right;padding:6px">Columns completed</th>' +
            '<th style="text-align:right;padding:6px">Avg fill</th>' +
          '</tr></thead>' +
          '<tbody>' +
            filtered.map(a => `
              <tr>
                <td style="padding:6px;border-top:1px solid #e5e1d8">${a.class} — ${a.subject}</td>
                <td style="padding:6px;border-top:1px solid #e5e1d8;text-align:right">${a.term1.ticked}/7</td>
                <td style="padding:6px;border-top:1px solid #e5e1d8;text-align:right">${a.term1.fillPercent}%</td>
              </tr>`).join('') +
          '</tbody>' +
        '</table>';
    }
    return;
  }

  if (state.teacherChart) {
    state.teacherChart.destroy();
    state.teacherChart = null;
  }

  const labels = filtered.map(a => `${a.class} — ${a.subject}`);
  const values = filtered.map(a => Math.round((a.term1.ticked / 7) * 100));
  const colors = filtered.map(a =>
    a.term1.ticked === 7 ? '#4d6b3f' :
    a.term1.ticked > 0   ? '#b8860b' :
    '#a0522d'
  );

  state.teacherChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Columns completed %',
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
        barThickness: Math.min(34, Math.max(18, 300 / Math.max(labels.length, 1)))
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 12 } },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(229,225,216,0.6)' },
          ticks: {
            color: '#4b5563',
            font: { family: 'Georgia', size: 11 },
            callback: v => v + '%'
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: '#1e293b',
            font: { family: 'Georgia', size: 12 },
            autoSkip: false
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const a = filtered[ctx.dataIndex];
              return `${a.term1.ticked}/7 columns · ${a.term1.fillPercent}% fill`;
            }
          }
        }
      }
    }
  });
}

function closeTeacherModal() {
  document.getElementById('teacherModal').classList.add('hidden');
  if (state.teacherChart) {
    state.teacherChart.destroy();
    state.teacherChart = null;
  }
  state.modalData = null;
}

// ═══════════════════════════════════════════════════
// PDF REPORT — server-side generation
// ═══════════════════════════════════════════════════

function openReportDialog() {
  document.getElementById('reportDialog').classList.remove('hidden');
  document.getElementById('reportTypeOptions').querySelector('input[value="submissions"]').checked = true;
  document.getElementById('reportColumnOptions').querySelector('input[value="all"]').checked = true;
  document.getElementById('reportGroupOptions').querySelector('input[value="all"]').checked = true;
  document.getElementById('reportColumnField').style.display = '';
  document.getElementById('reportGenerateBtn').disabled = false;
  document.getElementById('reportGenerateBtn').querySelector('.btn-label').textContent = 'Generate PDF';
}

function closeReportDialog() {
  if (state.pdfBusy) return;
  document.getElementById('reportDialog').classList.add('hidden');
}

async function generateReport() {
  if (state.pdfBusy) return;

  const type      = document.querySelector('input[name="reportType"]:checked').value;
  const colChoice = document.querySelector('input[name="reportColumn"]:checked').value;
  const group     = document.querySelector('input[name="reportGroup"]:checked').value;

  state.pdfBusy = true;
  const btn = document.getElementById('reportGenerateBtn');
  btn.disabled = true;
  btn.querySelector('.btn-label').textContent = 'Generating…';

  try {
    const url = `${state.apiUrl}?action=pdf` +
                `&type=${encodeURIComponent(type)}` +
                `&columns=${encodeURIComponent(colChoice)}` +
                `&group=${encodeURIComponent(group)}` +
                `&token=${encodeURIComponent(state.apiToken)}`;

    const res = await fetch(url);
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); }
    catch (e) { throw new Error('Server returned invalid response.'); }

    if (json.error) throw new Error(json.error);
    if (!json.base64) throw new Error('No PDF returned.');

    // Decode base64 to bytes and trigger download
    const binStr = atob(json.base64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/pdf' });

    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = json.filename || `report_${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(dlUrl), 1000);

    setStatus('PDF downloaded · ' + (json.filename || ''), 'ready');
    closeReportDialog();
  } catch (e) {
    alert('Failed to generate PDF: ' + e.message);
  } finally {
    state.pdfBusy = false;
    btn.disabled = false;
    btn.querySelector('.btn-label').textContent = 'Generate PDF';
  }
}

// ── Utilities ───────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) { return iso; }
}

window.addEventListener('resize', () => {
  if (state.teacherChart) state.teacherChart.resize();
  if (state.chart) state.chart.resize();
});
