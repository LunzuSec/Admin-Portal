/* Lunzu Secondary — Admin Dashboard */

// Chart.js fallback
(function ensureChartJS() {
  if (typeof Chart !== 'undefined') return;
  const alt = document.createElement('script');
  alt.src = 'https://unpkg.com/chart.js@4.4.0/dist/chart.umd.min.js';
  alt.async = false;
  document.head.appendChild(alt);
})();

const CACHE_KEY = 'lss_dashboard_cache_v3';
const CACHE_TTL_MS = 5 * 60 * 1000;

const state = {
  apiUrl: '',
  apiToken: '',
  summary: null,
  submissions: null,
  teachers: null,
  chart: null,
  activeGroup: 'all',
  teacherCache: new Map(),
  modalData: null,
  modalGroupTab: 'Regular'
};

// ── Loading UI ──────────────────────────────────────

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
function clearSkeletons() {
  const sk = document.getElementById('chartSkeleton');
  if (sk) sk.remove();
  ['submissionsBody', 'teachersBody'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.querySelectorAll('.skeleton-row').forEach(r => r.remove());
  });
  ['kpiFiles', 'kpiSubmitted', 'kpiPartial', 'kpiEmpty'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.querySelectorAll('.skeleton').forEach(s => s.remove());
  });
}

// ── Login ───────────────────────────────────────────

document.getElementById('loginBtn').addEventListener('click', async () => {
  const url = document.getElementById('apiUrl').value.trim();
  const token = document.getElementById('apiToken').value.trim();
  if (!url || !token) { alert('Enter both API URL and token.'); return; }
  state.apiUrl = url;
  state.apiToken = token;
  localStorage.setItem('lss_dashboard_url', url);
  localStorage.setItem('lss_dashboard_token', token);
  sessionStorage.removeItem(CACHE_KEY);
  await loadAll(true);
});

window.addEventListener('DOMContentLoaded', () => {
  const u = localStorage.getItem('lss_dashboard_url');
  const t = localStorage.getItem('lss_dashboard_token');
  if (u && t) {
    document.getElementById('apiUrl').value = u;
    document.getElementById('apiToken').value = t;
    state.apiUrl = u;
    state.apiToken = t;
    loadAll(false);
  }

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
  document.getElementById('teacherModal').addEventListener('click', e => {
    if (e.target.id === 'teacherModal') closeTeacherModal();
  });

  const modalTabs = document.getElementById('modalGroupTabs');
  if (modalTabs) {
    modalTabs.addEventListener('click', e => {
      const btn = e.target.closest('.modal-group-tab');
      if (!btn) return;
      modalTabs.querySelectorAll('.modal-group-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.modalGroupTab = btn.dataset.group;
      renderModalAssignments();
    });
  }
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  sessionStorage.removeItem(CACHE_KEY);
  state.teacherCache.clear();
  loadAll(true);
});

// ── Load data ───────────────────────────────────────

async function loadAll(forceFresh) {
  if (!forceFresh) {
    const c = readCache();
    if (c) {
      state.summary = c.summary;
      state.submissions = c.submissions;
      state.teachers = c.teachers;
      renderAll();
      setStatus('Loaded from cache · ' + new Date(c.timestamp).toLocaleString(), 'ready');
      return;
    }
  }

  setStatus('Loading…', 'loading');
  setStatusLoading(true);
  setButtonLoading('loginBtn', true);
  setButtonLoading('refreshBtn', true);
  showOverlay('Loading dashboard…', 'Fetching submission data. First load may take ~20 seconds.');

  try {
    const [summary, submissions, teachers] = await Promise.all([
      fetchJSON('summary'),
      fetchJSON('submissions'),
      fetchJSON('teachers')
    ]);
    if (summary.error)     throw new Error(summary.message || summary.error);
    if (submissions.error) throw new Error(submissions.message || submissions.error);
    if (teachers.error)    throw new Error(teachers.message || teachers.error);

    state.summary = summary;
    state.submissions = submissions;
    state.teachers = teachers;

    writeCache();
    renderAll();
    const note = summary.cached ? 'server cache' : 'fresh';
    setStatus('Connected · ' + note + ' · ' + new Date().toLocaleString(), 'ready');
  } catch (err) {
    setStatus('Error: ' + err.message, 'error');
    hideOverlay();
    alert('Failed to load: ' + err.message);
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
  renderSubmissions(state.submissions);
  renderTeachers(state.teachers);
  document.getElementById('loginPanel').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
}

async function fetchJSON(action) {
  const url = `${state.apiUrl}?action=${action}&token=${encodeURIComponent(state.apiToken)}`;
  const res = await fetch(url);
  const txt = await res.text();
  try { return JSON.parse(txt); }
  catch (e) { throw new Error('Non-JSON response from API'); }
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

function setStatus(text, mode) {
  document.getElementById('statusText').textContent = text;
  document.querySelector('.dot').style.background =
    mode === 'error' ? '#dc2626' :
    mode === 'loading' ? '#f59e0b' : '#4ade80';
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
        x: { stacked: true, ticks: { color: '#4b5563' } },
        y: { stacked: true, beginAtZero: true, ticks: { color: '#4b5563' } }
      },
      plugins: { legend: { labels: { color: '#1e293b', font: { family: 'Georgia' } } } }
    }
  });
}

// ── Submissions table — with per-month / per-paper ──

function renderSubmissions(data) {
  const tbody = document.getElementById('submissionsBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = data.rows
    .filter(r => state.activeGroup === 'all' || r.group === state.activeGroup)
    .sort((a, b) => a.class.localeCompare(b.class) || a.subject.localeCompare(b.subject));

  filtered.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.search = `${row.class} ${row.subject}`.toLowerCase();
    tr.dataset.status = row.complete ? 'complete' : row.totalScores > 0 ? 'partial' : 'empty';

    const t1 = row.perTerm && row.perTerm.term1 ? row.perTerm.term1 : null;

    const mini = (label, cell) => {
      if (!cell) return `<div class="mini-col"><div class="mini-label">${label}</div><div class="mini-value muted">–</div></div>`;
      const pct = cell.percent || 0;
      const cls = pct === 0 ? 'empty' : pct < 100 ? 'partial' : '';
      return `<div class="mini-col">
        <div class="mini-label">${label}</div>
        <div class="mini-bar ${cls}"><div style="width:${pct}%"></div></div>
        <div class="mini-value">${cell.count}<span class="muted">/${cell.total}</span></div>
      </div>`;
    };

    const monthlyCells = t1
      ? ['SEPT','OCT','NOV','DEC'].map(k => mini(k, t1.monthly[k])).join('')
      : ['SEPT','OCT','NOV','DEC'].map(k => mini(k, null)).join('');

    const paperCells = t1
      ? ['P1','P2','P3'].map(k => mini(k, t1.papers[k])).join('')
      : ['P1','P2','P3'].map(k => mini(k, null)).join('');

    const statusClass = row.complete ? 'complete' : row.totalScores > 0 ? 'partial' : 'empty';

    tr.innerHTML =
      `<td><strong>${row.class}</strong><br><small class="muted">${row.subject}</small></td>
       <td><div class="mini-group">${monthlyCells}</div></td>
       <td><div class="mini-group">${paperCells}</div></td>
       <td>
         <div class="progress-bar ${statusClass}">
           <div style="width:${Math.min(100, row.percentComplete)}%"></div>
         </div>
         <small class="muted">${row.percentComplete}%</small>
       </td>
       <td><small class="muted">${formatDate(row.lastModified)}</small></td>
       <td><a href="${row.fileUrl}" target="_blank" rel="noopener">Open</a></td>`;
    tbody.appendChild(tr);
  });

  document.getElementById('searchInput').oninput = filterSubmissions;
  document.getElementById('statusFilter').onchange = filterSubmissions;
}

function filterSubmissions() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const s = document.getElementById('statusFilter').value;
  document.querySelectorAll('#submissionsBody tr').forEach(tr => {
    const okSearch = tr.dataset.search.includes(q);
    const okStatus = s === 'all' || tr.dataset.status === s;
    tr.style.display = okSearch && okStatus ? '' : 'none';
  });
}

// ── Teachers table ──────────────────────────────────

function renderTeachers(data) {
  const tbody = document.getElementById('teachersBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = data.rows.sort((a, b) => a.teacherName.localeCompare(b.teacherName));
  filtered.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.title = 'Click to inspect assignments';
    tr.innerHTML =
      `<td><strong>${row.teacherName}</strong><br><small class="muted">${row.teacherEmail}</small></td>
       <td>${row.assignments}</td>
       <td><span class="kpi-value good" style="font-size:16px">${row.complete}</span></td>
       <td><span class="kpi-value warn" style="font-size:16px">${row.partial}</span></td>
       <td><span class="kpi-value bad" style="font-size:16px">${row.empty}</span></td>
       <td>
         <div class="progress-bar ${row.avgPercent === 0 ? 'empty' : row.avgPercent < 100 ? 'partial' : ''}">
           <div style="width:${row.avgPercent}%"></div>
         </div>
         <small class="muted">${row.avgPercent}%</small>
       </td>`;
    tr.addEventListener('click', () => openTeacherModal(row.teacherEmail));
    tbody.appendChild(tr);
  });
}

// ── Teacher modal — Regular / ODL tabs ──────────────

async function openTeacherModal(email) {
  const modal = document.getElementById('teacherModal');
  document.getElementById('modalTeacherName').textContent = 'Loading…';
  document.getElementById('modalTeacherEmail').textContent = email;
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

    document.getElementById('modalSummary').innerHTML =
      `<div class="modal-stat"><div class="modal-stat-label">Assignments</div><div class="modal-stat-value">${data.assignmentCount}</div></div>
       <div class="modal-stat"><div class="modal-stat-label">Scores submitted</div><div class="modal-stat-value">${data.totalScores} / ${data.possibleScores}</div></div>
       <div class="modal-stat"><div class="modal-stat-label">Overall completion</div><div class="modal-stat-value">${data.avgPercent}%</div></div>`;

    const hasRegular = data.assignments.some(a => a.group === 'Regular');
    const hasODL = data.assignments.some(a => a.group === 'ODL');

    const tabsEl = document.getElementById('modalGroupTabs');
    tabsEl.querySelectorAll('.modal-group-tab').forEach(b => {
      const g = b.dataset.group;
      const show = (g === 'Regular' && hasRegular) || (g === 'ODL' && hasODL);
      b.style.display = show ? '' : 'none';
    });

    if (hasRegular && !hasODL) state.modalGroupTab = 'Regular';
    else if (hasODL && !hasRegular) state.modalGroupTab = 'ODL';
    else if (!hasRegular && !hasODL) state.modalGroupTab = 'Regular';

    tabsEl.querySelectorAll('.modal-group-tab').forEach(b =>
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

  const statCell = (label, cell) => {
    if (!cell) return '';
    const pct = cell.percent || 0;
    const cls = pct === 0 ? 'empty' : pct < 100 ? 'partial' : '';
    return `
      <div class="monthly-stat">
        <div class="monthly-stat-label">${label}</div>
        <div class="monthly-stat-bar ${cls}"><div style="width:${pct}%"></div></div>
        <div class="monthly-stat-value">${cell.count}<span class="muted">/${cell.total}</span></div>
      </div>`;
  };

  const monthsRow = t1
    ? Object.entries(t1.monthly).map(([k, v]) => statCell(k, v)).join('')
    : '';
  const papersRow = t1
    ? Object.entries(t1.papers).map(([k, v]) => statCell(k, v)).join('')
    : '';

  return `
    <div class="assignment-card">
      <div class="assignment-head">
        <div>
          <div class="assignment-title">${a.class} — ${a.subject}</div>
          <div class="assignment-meta">${a.students} students · ${a.totalScores} / ${a.possible} scores · ${formatDate(a.lastModified)}</div>
        </div>
        <div>
          <a href="${a.fileUrl}" target="_blank" rel="noopener">Open sheet →</a>
        </div>
      </div>

      <div class="assignment-section-title">Continuous Assessment — Term 1</div>
      <div class="monthly-grid">${monthsRow}</div>

      <div class="assignment-section-title">End-of-Term Papers — Term 1</div>
      <div class="monthly-grid">${papersRow}</div>
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
