/* Lunzu Secondary — Admin Dashboard
 * Chart.js guard + fallback + client cache + Regular/ODL filter.
 */

// ── Ensure Chart.js is available ─────────────────────
// If the primary CDN in index.html failed (blocked, offline, 404),
// try a second CDN. If that also fails, the dashboard still renders
// — the chart area falls back to a small table.
(function ensureChartJS() {
  if (typeof Chart !== 'undefined') return;

  const alt = document.createElement('script');
  alt.src = 'https://unpkg.com/chart.js@4.4.0/dist/chart.umd.min.js';
  alt.async = false;
  alt.onload = () => console.log('Chart.js loaded from unpkg fallback');
  alt.onerror = () => console.warn('Both Chart.js CDNs failed; charts will be skipped');
  document.head.appendChild(alt);
})();

const CACHE_KEY = 'lss_dashboard_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const state = {
  apiUrl: '',
  apiToken: '',
  summary: null,
  submissions: null,
  teachers: null,
  chart: null,
  activeGroup: 'all'
};

// ── Login / bootstrap ────────────────────────────────

document.getElementById('loginBtn').addEventListener('click', async () => {
  const url = document.getElementById('apiUrl').value.trim();
  const token = document.getElementById('apiToken').value.trim();
  if (!url || !token) {
    alert('Enter both API URL and token.');
    return;
  }
  state.apiUrl = url;
  state.apiToken = token;
  localStorage.setItem('lss_dashboard_url', url);
  localStorage.setItem('lss_dashboard_token', token);
  sessionStorage.removeItem(CACHE_KEY);
  await loadAll(true);
});

window.addEventListener('DOMContentLoaded', () => {
  const savedUrl = localStorage.getItem('lss_dashboard_url');
  const savedToken = localStorage.getItem('lss_dashboard_token');
  if (savedUrl && savedToken) {
    document.getElementById('apiUrl').value = savedUrl;
    document.getElementById('apiToken').value = savedToken;
    state.apiUrl = savedUrl;
    state.apiToken = savedToken;
    loadAll(false);
  }

  const tabs = document.getElementById('groupTabs');
  if (tabs) {
    tabs.addEventListener('click', e => {
      const btn = e.target.closest('.group-tab');
      if (!btn) return;
      document.querySelectorAll('.group-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeGroup = btn.dataset.group;
      if (state.summary) {
        renderKpis(state.summary);
        renderChart(state.summary);
        renderSubmissions(state.submissions);
        renderTeachers(state.teachers);
      }
    });
  }
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  sessionStorage.removeItem(CACHE_KEY);
  loadAll(true);
});

// ── Data loading ─────────────────────────────────────

async function loadAll(forceFresh) {
  if (!forceFresh) {
    const cached = readCache();
    if (cached) {
      state.summary = cached.summary;
      state.submissions = cached.submissions;
      state.teachers = cached.teachers;
      renderAll();
      setStatus('Loaded from cache · ' + new Date(cached.timestamp).toLocaleString(), 'ready');
      return;
    }
  }

  setStatus('Loading from server…', 'loading');
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

    const cacheNote = summary.cached ? 'server cache' : 'fresh';
    setStatus('Connected · ' + cacheNote + ' · ' + new Date().toLocaleString(), 'ready');
  } catch (err) {
    setStatus('Error: ' + err.message, 'error');
    alert('Failed to load: ' + err.message);
  }
}

function renderAll() {
  renderKpis(state.summary);
  renderChart(state.summary);
  renderSubmissions(state.submissions);
  renderTeachers(state.teachers);
  document.getElementById('loginPanel').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
}

async function fetchJSON(action) {
  const url = `${state.apiUrl}?action=${action}&token=${encodeURIComponent(state.apiToken)}`;
  const res = await fetch(url, { method: 'GET' });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Non-JSON response from API');
  }
}

// ── Client cache ─────────────────────────────────────

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

function writeCache() {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      summary: state.summary,
      submissions: state.submissions,
      teachers: state.teachers
    }));
  } catch (e) {
    // Storage full or unavailable — ignore, will re-fetch next time.
  }
}

function setStatus(text, mode) {
  document.getElementById('statusText').textContent = text;
  document.querySelector('.dot').style.background =
    mode === 'error'   ? '#dc2626' :
    mode === 'loading' ? '#f59e0b' :
                         '#4ade80';
}

// ── KPI cards (group-aware) ──────────────────────────

function renderKpis(summary) {
  const t = state.activeGroup === 'all'
    ? summary.totals
    : (summary.totals.byGroup[state.activeGroup] ||
       { files: 0, submitted: 0, partial: 0, empty: 0 });

  document.getElementById('kpiFiles').textContent = t.files;
  document.getElementById('kpiSubmitted').textContent = t.submitted;
  document.getElementById('kpiPartial').textContent = t.partial;
  document.getElementById('kpiEmpty').textContent = t.empty;
}

// ── Chart (graceful fallback if Chart.js missing) ────

function renderChart(summary) {
  const byClass = summary.totals.byClass;

  const classes = Object.keys(byClass)
    .filter(c => state.activeGroup === 'all' || byClass[c].group === state.activeGroup)
    .sort();

  const complete = classes.map(c => byClass[c].submitted);
  const partial  = classes.map(c => byClass[c].partial);
  const empty    = classes.map(c => byClass[c].empty);

  // If Chart.js didn't load, show a table instead of crashing.
  if (typeof Chart === 'undefined') {
    const wrap = document.querySelector('.chart-wrap');
    if (wrap) {
      wrap.innerHTML =
        '<table style="width:100%;font-size:13px;border-collapse:collapse">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e1d8">Class</th>' +
            '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e1d8">Complete</th>' +
            '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e1d8">Partial</th>' +
            '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e1d8">Not started</th>' +
          '</tr></thead>' +
          '<tbody>' +
            classes.map((c, i) =>
              '<tr>' +
                '<td style="padding:8px;border-bottom:1px solid #e5e1d8">' + c + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #e5e1d8">' + complete[i] + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #e5e1d8">' + partial[i] + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #e5e1d8">' + empty[i] + '</td>' +
              '</tr>'
            ).join('') +
          '</tbody>' +
        '</table>';
    }
    return;
  }

  const canvas = document.getElementById('classChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (state.chart) state.chart.destroy();

  state.chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: classes,
      datasets: [
        { label: 'Complete',    data: complete, backgroundColor: '#4d6b3f' },
        { label: 'Partial',     data: partial,  backgroundColor: '#b8860b' },
        { label: 'Not started', data: empty,    backgroundColor: '#a0522d' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: '#4b5563' } },
        y: { stacked: true, beginAtZero: true, ticks: { color: '#4b5563' } }
      },
      plugins: {
        legend: { labels: { color: '#1e293b', font: { family: 'Georgia' } } }
      }
    }
  });
}

// ── Submissions table (group-aware) ──────────────────

function renderSubmissions(data) {
  const tbody = document.querySelector('#submissionsTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = data.rows
    .filter(r => state.activeGroup === 'all' || r.group === state.activeGroup)
    .sort((a, b) => a.class.localeCompare(b.class) || a.subject.localeCompare(b.subject));

  filtered.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.search = `${row.class} ${row.subject}`.toLowerCase();
    tr.dataset.status = row.complete ? 'complete'
                      : row.totalScores > 0 ? 'partial'
                      : 'empty';

    const statusClass = row.complete ? 'complete'
                      : row.totalScores > 0 ? 'partial'
                      : 'empty';

    tr.innerHTML =
      '<td><strong>' + row.class + '</strong></td>' +
      '<td>' + row.subject + '</td>' +
      '<td>' + row.students + '</td>' +
      '<td>' + row.totalScores + ' / ' + (row.students * 7) + '</td>' +
      '<td>' +
        '<div class="progress-bar ' + statusClass + '">' +
          '<div style="width: ' + Math.min(100, row.percentComplete) + '%"></div>' +
        '</div>' +
        '<small class="muted">' + row.percentComplete + '%</small>' +
      '</td>' +
      '<td><small class="muted">' + formatDate(row.lastModified) + '</small></td>' +
      '<td><a href="' + row.fileUrl + '" target="_blank" rel="noopener">Open</a></td>';

    tbody.appendChild(tr);
  });

  document.getElementById('searchInput').oninput = filterSubmissions;
  document.getElementById('statusFilter').onchange = filterSubmissions;
}

function filterSubmissions() {
  const query = document.getElementById('searchInput').value.toLowerCase();
  const status = document.getElementById('statusFilter').value;
  document.querySelectorAll('#submissionsTable tbody tr').forEach(tr => {
    const matchesSearch = tr.dataset.search.includes(query);
    const matchesStatus = status === 'all' || tr.dataset.status === status;
    tr.style.display = matchesSearch && matchesStatus ? '' : 'none';
  });
}

// ── Teachers table (group-aware) ─────────────────────

function renderTeachers(data) {
  const tbody = document.querySelector('#teachersTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = data.rows
    .filter(r => state.activeGroup === 'all' || r.group === state.activeGroup)
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName));

  filtered.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + row.teacherName + '</td>' +
      '<td>' + row.class + '</td>' +
      '<td>' + row.subject + '</td>' +
      '<td>' +
        '<div class="progress-bar">' +
          '<div style="width: ' + Math.min(100, row.percentComplete) + '%"></div>' +
        '</div>' +
        '<small class="muted">' + row.percentComplete + '%</small>' +
      '</td>' +
      '<td><small class="muted">' + formatDate(row.lastModified) + '</small></td>';
    tbody.appendChild(tr);
  });
}

// ── Utilities ────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return iso;
  }
}
