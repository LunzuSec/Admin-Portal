/* Lunzu Secondary — Admin Dashboard
 * Fetches JSON from Apps Script Web App, renders tables + charts.
 */

const state = {
  apiUrl: '',
  apiToken: '',
  summary: null,
  submissions: null,
  teachers: null,
  chart: null
};

// ── Login flow ─────────────────────────────────────

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
  await loadAll();
});

// Auto-login if credentials were saved previously
window.addEventListener('DOMContentLoaded', () => {
  const savedUrl = localStorage.getItem('lss_dashboard_url');
  const savedToken = localStorage.getItem('lss_dashboard_token');
  if (savedUrl && savedToken) {
    document.getElementById('apiUrl').value = savedUrl;
    document.getElementById('apiToken').value = savedToken;
    state.apiUrl = savedUrl;
    state.apiToken = savedToken;
    loadAll();
  }
});

document.getElementById('refreshBtn').addEventListener('click', loadAll);

// ── Data loading ────────────────────────────────────

async function loadAll() {
  setStatus('Loading…', 'loading');
  try {
    const [summary, submissions, teachers] = await Promise.all([
      fetchJSON('summary'),
      fetchJSON('submissions'),
      fetchJSON('teachers')
    ]);

    if (summary.error)    throw new Error(summary.message || summary.error);
    if (submissions.error) throw new Error(submissions.message || submissions.error);
    if (teachers.error)    throw new Error(teachers.message || teachers.error);

    state.summary = summary;
    state.submissions = submissions;
    state.teachers = teachers;

    renderKpis(summary);
    renderChart(summary);
    renderSubmissions(submissions);
    renderTeachers(teachers);

    document.getElementById('loginPanel').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    setStatus('Connected · ' + new Date().toLocaleString(), 'ready');
  } catch (err) {
    setStatus('Error: ' + err.message, 'error');
    alert('Failed to load: ' + err.message);
  }
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

function setStatus(text, mode) {
  const el = document.getElementById('statusText');
  el.textContent = text;
  const dot = document.querySelector('.dot');
  dot.style.background = mode === 'error' ? '#dc2626'
                        : mode === 'loading' ? '#f59e0b'
                        : '#4ade80';
}

// ── KPI cards ────────────────────────────────────────

function renderKpis(summary) {
  const t = summary.totals;
  document.getElementById('kpiFiles').textContent = t.files;
  document.getElementById('kpiSubmitted').textContent = t.submitted;
  document.getElementById('kpiPartial').textContent = t.partial;
  document.getElementById('kpiEmpty').textContent = t.empty;
}

// ── Class progress chart ─────────────────────────────

function renderChart(summary) {
  const classes = Object.keys(summary.totals.byClass);
  const complete = classes.map(c => summary.totals.byClass[c].submitted);
  const partial  = classes.map(c => summary.totals.byClass[c].partial);
  const empty    = classes.map(c => summary.totals.byClass[c].empty);

  const ctx = document.getElementById('classChart').getContext('2d');

  if (state.chart) state.chart.destroy();

  state.chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: classes,
      datasets: [
        { label: 'Complete', data: complete, backgroundColor: '#4d6b3f' },
        { label: 'Partial',  data: partial,  backgroundColor: '#b8860b' },
        { label: 'Not started', data: empty, backgroundColor: '#a0522d' }
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

// ── Submissions table ────────────────────────────────

function renderSubmissions(data) {
  const tbody = document.querySelector('#submissionsTable tbody');
  tbody.innerHTML = '';

  document.getElementById('searchInput').oninput = filterSubmissions;
  document.getElementById('statusFilter').onchange = filterSubmissions;

  data.rows
    .sort((a, b) => a.class.localeCompare(b.class) || a.subject.localeCompare(b.subject))
    .forEach(row => {
      const tr = document.createElement('tr');
      tr.dataset.search = `${row.class} ${row.subject}`.toLowerCase();
      tr.dataset.status = row.complete ? 'complete'
                       : row.totalScores > 0 ? 'partial'
                       : 'empty';

      const statusClass = row.complete ? 'complete'
                        : row.totalScores > 0 ? 'partial'
                        : 'empty';
      const statusLabel = row.complete ? 'Complete'
                        : row.totalScores > 0 ? 'Partial'
                        : 'Not started';

      tr.innerHTML = `
        <td><strong>${row.class}</strong></td>
        <td>${row.subject}</td>
        <td>${row.students}</td>
        <td>${row.totalScores} / ${row.students * 7}</td>
        <td>
          <div class="progress-bar ${statusClass}">
            <div style="width: ${Math.min(100, row.percentComplete)}%"></div>
          </div>
          <small class="muted">${row.percentComplete}%</small>
        </td>
        <td><small class="muted">${formatDate(row.lastModified)}</small></td>
        <td><a href="${row.fileUrl}" target="_blank" rel="noopener">Open</a></td>
      `;
      tbody.appendChild(tr);
    });
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

// ── Teachers table ───────────────────────────────────

function renderTeachers(data) {
  const tbody = document.querySelector('#teachersTable tbody');
  tbody.innerHTML = '';

  data.rows
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName))
    .forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.teacherName}</td>
        <td>${row.class}</td>
        <td>${row.subject}</td>
        <td>
          <div class="progress-bar">
            <div style="width: ${Math.min(100, row.percentComplete)}%"></div>
          </div>
          <small class="muted">${row.percentComplete}%</small>
        </td>
        <td><small class="muted">${formatDate(row.lastModified)}</small></td>
      `;
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
