/* Lunzu Secondary — Admin Dashboard */

// ═══════════════════════════════════════════════════════════
// CONFIGURATION — set the API URL here (once, at deployment)
// ═══════════════════════════════════════════════════════════
const API_URL = 'https://script.google.com/macros/s/AKfycbzB5TYa8Xbw5OT90Fh9UC3LoCYJaqxBkAPuBtrQFNNVB3sMcUfrlG0drVn3xxf8SeZoKg/exec';

(function ensureChartJS() {
  if (typeof Chart !== 'undefined') return;
  const alt = document.createElement('script');
  alt.src = 'https://unpkg.com/chart.js@4.4.0/dist/chart.umd.min.js';
  alt.async = false;
  document.head.appendChild(alt);
})();

const CACHE_KEY = 'lss_dashboard_cache_v5';
const CACHE_TTL_MS = 5 * 60 * 1000;

const state = {
  apiUrl: API_URL,
  apiToken: '',
  summary: null,
  submissions: null,
  teachers: null,
  chart: null,
  activeGroup: 'all',
  activeView: 'overview',
  teacherCache: new Map(),
  modalData: null,
  modalGroupTab: 'Regular'
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
  ['kpiFiles','kpiSubmitted','kpiPartial','kpiEmpty'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.querySelectorAll('.skeleton').forEach(s => s.remove());
  });
}

// ── View switching ──────────────────────────────────

const VIEW_TITLES = {
  overview:    { title: 'Overview', subtitle: 'Submission status across all classes' },
  submissions: { title: 'Submissions', subtitle: 'Per class-subject monthly and paper entry status' },
  teachers:    { title: 'Teachers', subtitle: 'Click a teacher to inspect their assignments' }
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
  sessionStorage.removeItem(CACHE_KEY);
  await loadAll(true);
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem('lss_dashboard_token');
  sessionStorage.removeItem(CACHE_KEY);
  location.reload();
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  sessionStorage.removeItem(CACHE_KEY);
  state.teacherCache.clear();
  loadAll(true);
});

window.addEventListener('DOMContentLoaded', () => {
  // Auto-login from session
  const savedToken = sessionStorage.getItem('lss_dashboard_token');
  if (savedToken) {
    document.getElementById('apiToken').value = savedToken;
    state.apiUrl = API_URL;
    state.apiToken = savedToken;
    loadAll(false);
  }

  // Mobile sidebar controls
  const menuBtn = document.getElementById('menuBtn');
  const closeBtn = document.getElementById('sidebarClose');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (menuBtn) menuBtn.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  // Sidebar nav items
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchView(btn.dataset.view);
      if (window.innerWidth <= 900) closeSidebar();
    });
  });

  // Group tabs
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

  // Modal
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
    });
  }

  // Filters
  document.getElementById('searchInput').addEventListener('input', filterSubmissions);
  document.getElementById('statusFilter').addEventListener('change', filterSubmissions);
  document.getElementById('teacherSearch').addEventListener('input', filterTeachers);
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
      setStatus('Loaded from cache', 'ready');
      return;
    }
  }

  setStatus('Loading…', 'loading');
  setStatusLoading(true);
  setButtonLoading('loginBtn', true);
  setButtonLoading('refreshBtn', true);
  showOverlay('Loading dashboard…',
    'Fetching data. First load may take a few minutes; subsequent loads are instant.');

  try {
    const [summary, submissions, teachers] = await Promise.all([
      fetchJSON('summary'),
      fetchJSON('submissions'),
      fetchJSON('teachers')
    ]);
    state.summary = summary;
    state.submissions = submissions;
    state.teachers = teachers;

    writeCache();
    renderAll();
    const note = summary.cached ? 'server cache' : 'fresh';
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
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (Date.now() - d.timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return d;
  } catch (e) { return null; }
}
function writeCache() {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
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
    : (summary.totals.byGroup[state.activeGroup] || { files: 0, submitted: 0, partial: 0, empty: 0 });
  document.getElementById('kpiFiles').textContent = t.files;
  document.getElementById('kpiSubmitted').textContent = t.submitted;
  document.getElementById('kpiPartial').textContent = t.partial;
  document.getElementById('kpiEmpty').textContent = t.empty;
}

function renderQuickStats(summary) {
  const t = summary.totals;
  const completion = t.files > 0 ? Math.round((t.submitted / t.files) * 100) : 0;
  document.getElementById('qsCompletion').textContent = completion + '%';
  document.getElementById('qsYear').textContent = summary.academicYear || '—';

  const teachersData = state.teachers;
  if (teachersData && teachersData.rows) {
    document.getElementById('qsTeachers').textContent = teachersData.rows.length;
    const totalAssignments = teachersData.rows.reduce((s, r) => s + r.assignments, 0);
    document.getElementById('qsAssignments').textContent = totalAssignments;
  }
}

// ── Chart ───────────────────────────────────────────

function renderChart(summary) {
  const byClass = summary.totals.byClass;
  const classes = Object.keys(byClass)
    .filter(c => state.activeGroup === 'all' || byClass[c].group === state.activeGroup)
    .sort();
  const complete = classes.map(c => byClass[c].submitted);
  const partial  = classes.map(c => byClass[c].partial);
  const empty    = classes.map(c => byClass[c].empty);

  if (typeof Chart === 'undefined') {
    const wrap = document.querySelector('.chart-wrap');
    if (wrap) {
      wrap.innerHTML = '<table style="width:100%;font-size:13px">' +
        '<thead><tr><th>Class</th><th>Complete</th><th>Partial</th><th>Not started</th></tr></thead>' +
        '<tbody>' + classes.map((c, i) =>
          `<tr><td>${c}</td><td>${complete[i]}</td><td>${partial[i]}</td><td>${empty[i]}</td></tr>`
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
        { label: 'Complete', data: complete, backgroundColor: '#4d6b3f' },
        { label: 'Partial', data: partial, backgroundColor: '#b8860b' },
        { label: 'Not started', data: empty, backgroundColor: '#a0522d' }
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

// ── Submissions ─────────────────────────────────────

function renderSubmissions(data) {
  const container = document.getElementById('submissionsList');
  if (!container) return;
  container.innerHTML = '';

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
    card.dataset.status = row.complete ? 'complete' : row.totalScores > 0 ? 'partial' : 'empty';

    const t1 = row.perTerm && row.perTerm.term1 ? row.perTerm.term1 : null;
    const statusClass = row.complete ? 'complete' : row.totalScores > 0 ? 'partial' : 'empty';
    const statusLabel = row.complete ? 'Complete' : row.totalScores > 0 ? 'Partial' : 'Not started';

    const chip = (label, cell) => {
      if (!cell) {
        return `<div class="chip">
          <div class="chip-label">${label}</div>
          <div class="chip-value muted">–</div>
          <div class="chip-bar empty"><div style="width:0%"></div></div>
        </div>`;
      }
      const pct = cell.percent || 0;
      const cls = pct === 0 ? 'empty' : pct < 100 ? 'partial' : '';
      return `<div class="chip">
        <div class="chip-label">${label}</div>
        <div class="chip-value">${cell.count}<span class="muted">/${cell.total}</span></div>
        <div class="chip-bar ${cls}"><div style="width:${pct}%"></div></div>
      </div>`;
    };

    const monthlyChips = ['SEPT','OCT','NOV','DEC'].map(k =>
      chip(k, t1 ? t1.monthly[k] : null)).join('');
    const paperChips = ['P1','P2','P3'].map(k =>
      chip(k, t1 ? t1.papers[k] : null)).join('');

    card.innerHTML = `
      <div class="submission-head">
        <div class="submission-title">
          ${row.class} — ${row.subject}
          <small>${row.students} students</small>
        </div>
        <span class="status-pill ${statusClass}">${statusLabel}</span>
      </div>

      <div class="chip-group">${monthlyChips}</div>
      <div class="chip-group">${paperChips}</div>

      <div class="overall-row">
        <div class="overall-bar ${statusClass}">
          <div style="width:${Math.min(100, row.percentComplete)}%"></div>
        </div>
        <span class="overall-value">${row.percentComplete}%</span>
      </div>

      <div class="submission-footer">
        <span class="muted">${formatDate(row.lastModified)}</span>
        <a href="${row.fileUrl}" target="_blank" rel="noopener">Open sheet →</a>
      </div>`;
    container.appendChild(card);
  });
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

  const filtered = data.rows.sort((a, b) => a.teacherName.localeCompare(b.teacherName));

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
          <div class="teacher-stat-label">Assigned</div>
          <div class="teacher-stat-value">${row.assignments}</div>
        </div>
        <div class="teacher-stat">
          <div class="teacher-stat-label">Complete</div>
          <div class="teacher-stat-value good">${row.complete}</div>
        </div>
        <div class="teacher-stat">
          <div class="teacher-stat-label">Not started</div>
          <div class="teacher-stat-value bad">${row.empty}</div>
        </div>
      </div>

      <div class="overall-row">
        <div class="overall-bar ${row.avgPercent === 0 ? 'empty' : row.avgPercent < 100 ? 'partial' : ''}">
          <div style="width:${row.avgPercent}%"></div>
        </div>
        <span class="overall-value">${row.avgPercent}%</span>
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
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0] || '')
      .join('')
      .toUpperCase();
    document.getElementById('modalAvatar').textContent = initials || '?';

    document.getElementById('modalSummary').innerHTML =
      `<div class="modal-stat"><div class="modal-stat-label">Assignments</div><div class="modal-stat-value">${data.assignmentCount}</div></div>
       <div class="modal-stat"><div class="modal-stat-label">Scores submitted</div><div class="modal-stat-value">${data.totalScores} / ${data.possibleScores}</div></div>
       <div class="modal-stat"><div class="modal-stat-label">Overall completion</div><div class="modal-stat-value">${data.avgPercent}%</div></div>`;

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
  const t1 = a.perTerm && a.perTerm.term1 ? a.perTerm.term1 : null;

  const chip = (label, cell) => {
    if (!cell) {
      return `<div class="chip">
        <div class="chip-label">${label}</div>
        <div class="chip-value muted">–</div>
        <div class="chip-bar empty"><div style="width:0%"></div></div>
      </div>`;
    }
    const pct = cell.percent || 0;
    const cls = pct === 0 ? 'empty' : pct < 100 ? 'partial' : '';
    return `<div class="chip">
      <div class="chip-label">${label}</div>
      <div class="chip-value">${cell.count}<span class="muted">/${cell.total}</span></div>
      <div class="chip-bar ${cls}"><div style="width:${pct}%"></div></div>
    </div>`;
  };

  const monthsChips = t1
    ? ['SEPT','OCT','NOV','DEC'].map(k => chip(k, t1.monthly[k])).join('')
    : '';
  const papersChips = t1
    ? ['P1','P2','P3'].map(k => chip(k, t1.papers[k])).join('')
    : '';

  return `
    <div class="assignment-card">
      <div class="assignment-head">
        <div>
          <div class="assignment-title">${a.class} — ${a.subject}</div>
          <div class="assignment-meta">${a.students} students · ${a.totalScores} / ${a.possible} scores</div>
        </div>
        <a href="${a.fileUrl}" target="_blank" rel="noopener">Open sheet →</a>
      </div>

      <div class="assignment-section-title">Continuous Assessment — Term 1</div>
      <div class="chip-group">${monthsChips}</div>

      <div class="assignment-section-title">End-of-Term Papers — Term 1</div>
      <div class="chip-group">${papersChips}</div>
    </div>`;
}

function closeTeacherModal() {
  document.getElementById('teacherModal').classList.add('hidden');
  state.modalData = null;
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
