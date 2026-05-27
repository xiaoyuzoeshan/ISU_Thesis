// ─── Data Model ───────────────────────────────────────────────────────────────

const defaultData = {
  settings: {
    deadline: '',
    currentPhase: 'Literature Review',
    phases: ['Proposal', 'Literature Review', 'Data Collection', 'Analysis', 'Writing', 'Revision', 'Submission'],
    studentName: 'Student',
    supervisorName: 'Supervisor',
    thesisTitle: 'My Thesis',
    githubToken: ''
  },
  chapters: [
    { name: 'Chapter 1: Introduction', percentage: 0 },
    { name: 'Chapter 2: Literature Review', percentage: 0 },
    { name: 'Chapter 3: Methodology', percentage: 0 },
    { name: 'Chapter 4: Results', percentage: 0 },
    { name: 'Chapter 5: Discussion', percentage: 0 },
    { name: 'Chapter 6: Conclusion', percentage: 0 },
  ],
  weeks: {},      // keyed by "YYYY-Www"
  documents: [],  // { id, name, weekKey, uploadDate, dataUrl, size, type, feedback[] }
  posts: []       // { id, postType, title, content, date, resolved }
};

function loadData() {
  try {
    const raw = localStorage.getItem('thesis-logbook');
    if (!raw) return JSON.parse(JSON.stringify(defaultData));
    return Object.assign({}, JSON.parse(JSON.stringify(defaultData)), JSON.parse(raw));
  } catch { return JSON.parse(JSON.stringify(defaultData)); }
}

function saveData() {
  localStorage.setItem('thesis-logbook', JSON.stringify(appData));
  showSaveIndicator();
}

let appData = loadData();
let currentRole = 'student'; // 'student' | 'supervisor'
let currentSection = 'dashboard';
let currentWeekKey = getWeekKey(new Date());

// ─── Utilities ────────────────────────────────────────────────────────────────

function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function parseWeekKey(key) {
  const [year, w] = key.split('-W');
  const week = parseInt(w, 10);
  const jan4 = new Date(parseInt(year, 10), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const monday = new Date(startOfWeek1);
  monday.setDate(startOfWeek1.getDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date);
}

function weeksUntilDeadline() {
  if (!appData.settings.deadline) return null;
  const now = new Date();
  const dl = new Date(appData.settings.deadline);
  const diff = dl - now;
  if (diff < 0) return 0;
  return Math.ceil(diff / (7 * 86400000));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function offsetWeek(key, delta) {
  const { monday } = parseWeekKey(key);
  monday.setDate(monday.getDate() + delta * 7);
  return getWeekKey(monday);
}

function getWeekData(key) {
  if (!appData.weeks[key]) {
    appData.weeks[key] = { plan: '', progress: '', status: 'not-started', syncNodes: [], duties: [] };
  }
  if (!appData.weeks[key].duties) appData.weeks[key].duties = [];
  return appData.weeks[key];
}

function statusLabel(s) {
  return { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'completed': 'Completed', 'delayed': 'Delayed' }[s] || s;
}

function showSaveIndicator() {
  const el = document.getElementById('saveIndicator');
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function navigate(section) {
  currentSection = section;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === section);
  });
  document.querySelectorAll('.section').forEach(el => {
    el.classList.toggle('active', el.id === 'section-' + section);
  });
  renderSection(section);
}

function renderSection(section) {
  if (section === 'dashboard') renderDashboard();
  else if (section === 'calendar') renderCalendar();
  else if (section === 'documents') renderDocuments();
  else if (section === 'posts') renderPosts();
  else if (section === 'settings') renderSettings();
}

function setRole(role) {
  currentRole = role;
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.role === role);
  });
  // dashboard chapter inputs depend on role
  renderSection(currentSection);
  // re-build week select options when switching sections
  buildWeekSelectOptions();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function renderDashboard() {
  const weeks = weeksUntilDeadline();
  document.getElementById('dash-weeks').textContent = weeks !== null ? weeks : '—';
  document.getElementById('dash-deadline').textContent =
    appData.settings.deadline ? formatDate(new Date(appData.settings.deadline)) : 'Not set';

  document.getElementById('dash-phase').textContent = appData.settings.currentPhase || '—';

  const overallPct = appData.chapters.length
    ? Math.round(appData.chapters.reduce((s, c) => s + c.percentage, 0) / appData.chapters.length)
    : 0;
  document.getElementById('dash-overall').textContent = overallPct + '%';

  const chaptersEl = document.getElementById('dash-chapters');
  chaptersEl.innerHTML = '';
  appData.chapters.forEach((ch, i) => {
    const pct = Math.min(100, Math.max(0, ch.percentage));
    const high = pct >= 70;
    chaptersEl.innerHTML += `
      <div class="chapter-row">
        <div class="chapter-name">${escHtml(ch.name)}</div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill${high ? ' high' : ''}" style="width:${pct}%"></div>
        </div>
        ${currentRole === 'student'
          ? `<input type="number" class="chapter-pct-input" min="0" max="100" value="${pct}"
               oninput="updateChapterPct(${i}, this.value)" />`
          : `<div class="chapter-pct">${pct}%</div>`
        }
      </div>`;
  });

  updateDashSyncNotice();
  renderPostsNotice();
  renderDashWeekPanel();
}

function updateDashSyncNotice() {
  const now = new Date();
  const allSyncs = [];
  Object.entries(appData.weeks).forEach(([wk, wd]) => {
    (wd.syncNodes || []).forEach(d => allSyncs.push({ date: new Date(d) }));
  });
  allSyncs.sort((a, b) => a.date - b.date);
  const upcoming = allSyncs.filter(s => s.date >= now);
  const syncNotice = document.getElementById('dash-sync-notice');
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const daysUntil = Math.ceil((next.date - now) / 86400000);
    syncNotice.style.display = 'flex';
    syncNotice.querySelector('.sync-notice-text').textContent =
      `Next supervisor sync: ${formatDate(next.date)} (in ${daysUntil} day${daysUntil !== 1 ? 's' : ''})`;
  } else {
    syncNotice.style.display = 'none';
  }
}

function renderPostsNotice() {
  const unresolved = appData.posts.filter(p => !p.resolved);
  const el = document.getElementById('dash-posts-alert');
  if (unresolved.length > 0) {
    el.style.display = 'flex';
    const actionCount = unresolved.filter(p => p.postType === 'action-needed').length;
    let msg = `${unresolved.length} unresolved post${unresolved.length > 1 ? 's' : ''}`;
    if (actionCount > 0) msg += ` — ${actionCount} require${actionCount === 1 ? 's' : ''} action`;
    el.querySelector('.posts-alert-text').innerHTML =
      `<span class="posts-alert-count">${msg}</span>. Click to view.`;
  } else {
    el.style.display = 'none';
  }
}

function renderDashWeekPanel() {
  const key = CALENDAR_START_KEY;
  const wd = getWeekData(key);
  const { monday, sunday } = parseWeekKey(key);

  document.getElementById('dash-week-label').textContent =
    `${key.replace('-W', 'W')}  (${formatShortDate(monday)} – ${formatShortDate(sunday)})`;

  // Task list
  const taskListEl = document.getElementById('dash-task-list');
  const duties = wd.duties || [];
  if (duties.length === 0) {
    taskListEl.innerHTML = '<div class="dash-task-empty">No tasks for this week. Add duties in the Calendar.</div>';
  } else {
    taskListEl.innerHTML = duties.map((duty, i) => {
      const st = duty.taskStatus || 'not-started';
      return `<div class="dash-task-row">
        <span class="dash-task-num">Task ${i + 1}</span>
        <span class="dash-task-title">${escHtml(duty.title) || '<span style="color:var(--text-muted);font-style:italic;">Untitled</span>'}</span>
        <span class="status-badge ${st}">${statusLabel(st)}</span>
      </div>`;
    }).join('');
  }

  const addRow = document.getElementById('dash-add-sync-row');
  if (addRow) addRow.style.display = currentRole === 'supervisor' ? 'none' : 'flex';

  renderDashSyncNodes();
}

function renderDashSyncNodes() {
  const wd = getWeekData(CALENDAR_START_KEY);
  const listEl = document.getElementById('dash-sync-node-list');
  listEl.innerHTML = '';
  (wd.syncNodes || []).forEach((date, i) => {
    const chip = document.createElement('span');
    chip.className = 'sync-node-chip';
    chip.innerHTML = `${escHtml(date)}<button class="remove-btn" onclick="removeDashSyncNode(${i})">x</button>`;
    listEl.appendChild(chip);
  });
}

function addDashSyncNode() {
  const input = document.getElementById('dash-sync-date-input');
  if (!input.value) return;
  const wd = getWeekData(CALENDAR_START_KEY);
  if (!wd.syncNodes) wd.syncNodes = [];
  if (!wd.syncNodes.includes(input.value)) {
    wd.syncNodes.push(input.value);
    wd.syncNodes.sort();
    saveData();
  }
  input.value = '';
  renderDashSyncNodes();
  updateDashSyncNotice();
}

function removeDashSyncNode(index) {
  const wd = getWeekData(CALENDAR_START_KEY);
  wd.syncNodes.splice(index, 1);
  saveData();
  renderDashSyncNodes();
  updateDashSyncNotice();
}

function updateChapterPct(index, value) {
  const v = Math.min(100, Math.max(0, parseInt(value, 10) || 0));
  appData.chapters[index].percentage = v;
  saveData();
  // update progress bar fill for this row
  const rows = document.querySelectorAll('#dash-chapters .chapter-row');
  if (rows[index]) {
    const fill = rows[index].querySelector('.progress-bar-fill');
    fill.style.width = v + '%';
    fill.classList.toggle('high', v >= 70);
  }
  // refresh Overall Completion in real-time
  const overallPct = appData.chapters.length
    ? Math.round(appData.chapters.reduce((s, c) => s + c.percentage, 0) / appData.chapters.length)
    : 0;
  document.getElementById('dash-overall').textContent = overallPct + '%';
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

function renderCalendar() {
  renderWeekMap();
  renderWeekView();
}

const CALENDAR_START_KEY = getWeekKey(new Date());
const CALENDAR_END_KEY = getWeekKey(new Date('2026-12-31'));

function clampToCalendarRange(key) {
  if (key < CALENDAR_START_KEY) return CALENDAR_START_KEY;
  if (key > CALENDAR_END_KEY) return CALENDAR_END_KEY;
  return key;
}

function renderWeekMap() {
  const mapEl = document.getElementById('week-map');
  mapEl.innerHTML = '';

  const todayKey = CALENDAR_START_KEY;
  const endKey = CALENDAR_END_KEY;

  // Enumerate all weeks from today through end of 2026
  const allKeys = new Set();
  let k = todayKey;
  while (k <= endKey) {
    allKeys.add(k);
    k = offsetWeek(k, 1);
  }
  // Also include any weeks that have data (in case they were added before this constraint)
  Object.keys(appData.weeks).forEach(wk => {
    if (wk >= todayKey && wk <= endKey) allKeys.add(wk);
  });

  const sorted = [...allKeys].sort();
  sorted.forEach(key => {
    const { monday } = parseWeekKey(key);
    const hasData = appData.weeks[key] && (
      appData.weeks[key].plan ||
      appData.weeks[key].progress ||
      (appData.weeks[key].duties || []).length > 0
    );
    const hasSyncs = appData.weeks[key] && (appData.weeks[key].syncNodes || []).length > 0;
    const isToday = key === todayKey;
    const isSelected = key === currentWeekKey;
    const chip = document.createElement('button');
    chip.className = `week-chip${hasData || hasSyncs ? ' has-data' : ''}${isSelected ? ' current-selected' : ''}`;
    chip.title = formatDate(monday);
    chip.textContent = (isToday ? '> ' : '') + key.replace('-W', ' W') + (hasSyncs ? ' *' : '');
    chip.onclick = () => { currentWeekKey = key; renderCalendar(); };
    mapEl.appendChild(chip);
  });
}

function renderWeekView() {
  const { monday, sunday } = parseWeekKey(currentWeekKey);

  document.getElementById('week-label').textContent =
    `${currentWeekKey.replace('-W', ' — Week ')}  (${formatShortDate(monday)} – ${formatShortDate(sunday)})`;

  const addDutyBtn = document.getElementById('add-duty-btn');
  if (addDutyBtn) addDutyBtn.style.display = currentRole === 'supervisor' ? 'none' : '';

  renderDutyList();
  renderWeekDocs();
}

function renderDutyList() {
  const wd = getWeekData(currentWeekKey);
  const duties = wd.duties || [];
  const listEl = document.getElementById('duty-list');
  if (!listEl) return;

  if (duties.length === 0) {
    listEl.innerHTML = currentRole === 'student'
      ? '<div class="empty-state"><div class="empty-state-title">No duties yet</div><div class="empty-state-desc">Add a duty to track individual tasks for this week</div></div>'
      : '<div class="empty-state"><div class="empty-state-title">No duties recorded for this week</div></div>';
    return;
  }

  const ro = currentRole === 'supervisor';
  listEl.innerHTML = duties.map((duty, i) => {
    const st = duty.taskStatus || 'not-started';
    const notes = duty.notes || duty.progress || '';
    return `
    <div class="duty-item">
      <div class="duty-item-header">
        <span class="duty-num">Task ${i + 1}</span>
        <input type="text" class="duty-title-input"
          value="${escHtml(duty.title)}"
          placeholder="Task name..."
          ${ro ? 'readonly style="opacity:.7;"' : ''}
          oninput="updateDutyField(${i}, 'title', this.value)" />
        ${ro ? '' : `<button class="delete-btn-sm" onclick="removeDuty(${i})">Remove</button>`}
      </div>
      <div class="duty-progress-wrap">
        <div class="duty-status-row">
          <div class="field-label" style="margin:0;">Progress</div>
          ${ro
            ? `<span class="status-badge ${st}">${statusLabel(st)}</span>`
            : `<select class="status-select" onchange="updateDutyStatus(${i}, this.value)">
                <option value="not-started"${st === 'not-started' ? ' selected' : ''}>Not Started</option>
                <option value="in-progress"${st === 'in-progress' ? ' selected' : ''}>In Progress</option>
                <option value="completed"${st === 'completed' ? ' selected' : ''}>Completed</option>
                <option value="delayed"${st === 'delayed' ? ' selected' : ''}>Delayed</option>
              </select>
              <span class="status-badge ${st}" id="duty-badge-${i}">${statusLabel(st)}</span>`
          }
        </div>
        <div class="field-label" style="margin-bottom:5px;margin-top:10px;">Notes</div>
        <textarea class="duty-progress-input"
          placeholder="Additional notes..."
          ${ro ? 'readonly style="opacity:.7;"' : ''}
          oninput="updateDutyField(${i}, 'notes', this.value)">${escHtml(notes)}</textarea>
      </div>
    </div>`;
  }).join('');
}

function addDuty() {
  const wd = getWeekData(currentWeekKey);
  wd.duties.push({ id: uid(), title: '', taskStatus: 'not-started', notes: '' });
  saveData();
  renderDutyList();
}

function removeDuty(index) {
  const wd = getWeekData(currentWeekKey);
  wd.duties.splice(index, 1);
  saveData();
  renderDutyList();
}

function updateDutyField(index, field, value) {
  const wd = getWeekData(currentWeekKey);
  if (!wd.duties || !wd.duties[index]) return;
  wd.duties[index][field] = value;
  saveData();
}

function updateDutyStatus(index, value) {
  updateDutyField(index, 'taskStatus', value);
  // Update the inline badge without full re-render
  const badge = document.getElementById('duty-badge-' + index);
  if (badge) {
    badge.className = 'status-badge ' + value;
    badge.textContent = statusLabel(value);
  }
  // Refresh dashboard task list if it's visible
  if (currentSection === 'dashboard') renderDashWeekPanel();
  else if (currentSection === 'calendar' && currentWeekKey === CALENDAR_START_KEY) {
    // also refresh dashboard data silently
  }
}

function renderWeekDocs() {
  const weekDocsEl = document.getElementById('week-doc-list');
  const docs = appData.documents.filter(d => d.weekKey === currentWeekKey);
  if (!weekDocsEl) return;
  if (docs.length === 0) {
    weekDocsEl.innerHTML = '<div style="font-size:12.5px;color:var(--text-muted);padding:8px 0;">No documents attached to this week.</div>';
    return;
  }
  weekDocsEl.innerHTML = docs.map(doc => `
    <div class="feedback-file-chip" onclick="switchToDoc('${doc.id}')" style="cursor:pointer;">
      ${escHtml(doc.name)} — uploaded ${escHtml(doc.uploadDate)}
    </div>
  `).join('');
}

function switchToDoc(docId) {
  navigate('documents');
  setTimeout(() => {
    const el = document.getElementById('doc-card-' + docId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('expanded');
    }
  }, 50);
}



function prevWeek() {
  const next = offsetWeek(currentWeekKey, -1);
  if (next < CALENDAR_START_KEY) return;
  currentWeekKey = next;
  renderCalendar();
}
function nextWeek() {
  const next = offsetWeek(currentWeekKey, 1);
  if (next > CALENDAR_END_KEY) return;
  currentWeekKey = next;
  renderCalendar();
}
function goToday() { currentWeekKey = CALENDAR_START_KEY; renderCalendar(); }

// ─── Documents ────────────────────────────────────────────────────────────────

function renderDocuments() {
  buildWeekSelectOptions();
  const listEl = document.getElementById('doc-list');
  listEl.innerHTML = '';

  if (appData.documents.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state-title">No documents yet</div><div class="empty-state-desc">Upload a document to get started</div></div>`;
    return;
  }

  // Group by week
  const byWeek = {};
  appData.documents.forEach(doc => {
    if (!byWeek[doc.weekKey || 'unassigned']) byWeek[doc.weekKey || 'unassigned'] = [];
    byWeek[doc.weekKey || 'unassigned'].push(doc);
  });

  const sortedWeeks = Object.keys(byWeek).sort().reverse();
  sortedWeeks.forEach(wk => {
    const groupLabel = document.createElement('div');
    groupLabel.style.cssText = 'font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin:18px 0 10px;';
    groupLabel.textContent = wk === 'unassigned' ? 'Unassigned' : wk.replace('-W', ' — Week ');
    listEl.appendChild(groupLabel);

    byWeek[wk].forEach(doc => {
      const el = buildDocCard(doc);
      listEl.appendChild(el);
    });
  });
}

function buildDocCard(doc) {
  const wrapper = document.createElement('div');
  wrapper.className = 'doc-card';
  wrapper.id = 'doc-card-' + doc.id;

  const feedbackCount = (doc.feedback || []).length;
  wrapper.innerHTML = `
    <div class="doc-card-header" onclick="toggleDocCard('${doc.id}')">
      <div class="doc-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2C7A9B" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div class="doc-info">
        <div class="doc-name">${escHtml(doc.name)}</div>
        <div class="doc-meta">Uploaded ${escHtml(doc.uploadDate)}${feedbackCount > 0 ? ` &bull; ${feedbackCount} feedback item${feedbackCount > 1 ? 's' : ''}` : ''}</div>
      </div>
      <span class="doc-expand-icon">&#9660;</span>
    </div>
    <div class="doc-body">
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
        <a class="doc-download" onclick="downloadDoc('${doc.id}')">Download</a>
        ${currentRole === 'student' ? `<button class="delete-btn-sm" onclick="deleteDoc('${doc.id}')">Remove</button>` : ''}
      </div>
      <div class="field-label">Feedback</div>
      <div class="feedback-list" id="feedback-list-${doc.id}">
        ${renderFeedbackItems(doc)}
      </div>
      ${buildFeedbackForm(doc.id)}
    </div>`;
  return wrapper;
}

function renderFeedbackItems(doc) {
  if (!doc.feedback || doc.feedback.length === 0) {
    return '<div style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px;">No feedback yet.</div>';
  }
  return doc.feedback.map((fb, i) => {
    if (fb.type === 'text') {
      return `<div class="feedback-item">
        <div class="feedback-meta">${escHtml(fb.author)} &bull; ${escHtml(fb.date)}</div>
        <div class="feedback-content">${escHtml(fb.content)}</div>
        ${currentRole === 'supervisor' ? `<button class="delete-btn-sm" style="margin-top:8px;" onclick="deleteFeedback('${doc.id}',${i})">Remove</button>` : ''}
      </div>`;
    } else {
      return `<div class="feedback-item">
        <div class="feedback-meta">${escHtml(fb.author)} &bull; ${escHtml(fb.date)} &bull; File attachment</div>
        <div class="feedback-content">
          <span class="feedback-file-chip" onclick="downloadFeedbackFile('${doc.id}',${i})" style="cursor:pointer;">${escHtml(fb.name)}</span>
        </div>
        ${currentRole === 'supervisor' ? `<button class="delete-btn-sm" style="margin-top:8px;" onclick="deleteFeedback('${doc.id}',${i})">Remove</button>` : ''}
      </div>`;
    }
  }).join('');
}

function buildFeedbackForm(docId) {
  if (currentRole !== 'supervisor') return '';
  return `
    <div class="divider"></div>
    <div class="field-label">Add Feedback (as Supervisor)</div>
    <div class="add-feedback-form">
      <textarea id="fb-text-${docId}" placeholder="Write feedback here..."></textarea>
      <div class="feedback-actions">
        <button class="btn btn-secondary btn-sm" onclick="submitFeedbackText('${docId}')">Add Comment</button>
        <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
          Upload Feedback File
          <input type="file" style="display:none;" onchange="submitFeedbackFile('${docId}', this)">
        </label>
      </div>
    </div>`;
}

function toggleDocCard(id) {
  const card = document.getElementById('doc-card-' + id);
  card.classList.toggle('expanded');
}

function submitFeedbackText(docId) {
  const textarea = document.getElementById('fb-text-' + docId);
  const content = textarea.value.trim();
  if (!content) return;
  const doc = appData.documents.find(d => d.id === docId);
  if (!doc) return;
  if (!doc.feedback) doc.feedback = [];
  doc.feedback.push({
    type: 'text',
    content,
    author: appData.settings.supervisorName || 'Supervisor',
    date: new Date().toISOString().slice(0, 10)
  });
  textarea.value = '';
  saveData();
  document.getElementById('feedback-list-' + docId).innerHTML = renderFeedbackItems(doc);
}

function submitFeedbackFile(docId, input) {
  const file = input.files[0];
  if (!file) return;
  const doc = appData.documents.find(d => d.id === docId);
  if (!doc) return;
  if (!doc.feedback) doc.feedback = [];
  const reader = new FileReader();
  reader.onload = e => {
    doc.feedback.push({
      type: 'file',
      name: file.name,
      dataUrl: e.target.result,
      author: appData.settings.supervisorName || 'Supervisor',
      date: new Date().toISOString().slice(0, 10)
    });
    saveData();
    document.getElementById('feedback-list-' + docId).innerHTML = renderFeedbackItems(doc);
    input.value = '';
  };
  reader.readAsDataURL(file);
}

function deleteFeedback(docId, index) {
  const doc = appData.documents.find(d => d.id === docId);
  if (!doc || !doc.feedback) return;
  doc.feedback.splice(index, 1);
  saveData();
  document.getElementById('feedback-list-' + docId).innerHTML = renderFeedbackItems(doc);
}

function downloadDoc(docId) {
  const doc = appData.documents.find(d => d.id === docId);
  if (!doc || !doc.dataUrl) return;
  const a = document.createElement('a');
  a.href = doc.dataUrl;
  a.download = doc.name;
  a.click();
}

function downloadFeedbackFile(docId, index) {
  const doc = appData.documents.find(d => d.id === docId);
  if (!doc || !doc.feedback || !doc.feedback[index]) return;
  const fb = doc.feedback[index];
  const a = document.createElement('a');
  a.href = fb.dataUrl;
  a.download = fb.name;
  a.click();
}

function deleteDoc(docId) {
  if (!confirm('Remove this document?')) return;
  appData.documents = appData.documents.filter(d => d.id !== docId);
  saveData();
  renderDocuments();
}

function handleDocUpload(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const weekKey = document.getElementById('doc-week-select')?.value || currentWeekKey;
  let loaded = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      appData.documents.unshift({
        id: uid(),
        name: file.name,
        weekKey: weekKey || currentWeekKey,
        uploadDate: new Date().toISOString().slice(0, 10),
        size: file.size,
        type: file.type,
        dataUrl: e.target.result,
        feedback: []
      });
      loaded++;
      if (loaded === files.length) {
        saveData();
        renderDocuments();
        renderWeekDocs();
      }
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function handleDocDragOver(e) {
  e.preventDefault();
  document.getElementById('doc-upload-zone').classList.add('drag-over');
}

function handleDocDragLeave() {
  document.getElementById('doc-upload-zone').classList.remove('drag-over');
}

function handleDocDrop(e) {
  e.preventDefault();
  document.getElementById('doc-upload-zone').classList.remove('drag-over');
  const fakeInput = { files: e.dataTransfer.files };
  handleDocUpload(fakeInput);
}

function buildWeekSelectOptions() {
  const sel = document.getElementById('doc-week-select');
  if (!sel) return;
  sel.innerHTML = '';
  const todayKey = getWeekKey(new Date());
  const keys = new Set([todayKey, ...Object.keys(appData.weeks)]);
  for (let i = -4; i <= 12; i++) keys.add(offsetWeek(todayKey, i));
  [...keys].sort().forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k.replace('-W', ' Week ');
    if (k === currentWeekKey) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ─── Posts ────────────────────────────────────────────────────────────────────

function renderPosts() {
  const listEl = document.getElementById('post-list');
  const posts = [...appData.posts].sort((a, b) => b.date.localeCompare(a.date));

  if (posts.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state-title">No posts yet</div><div class="empty-state-desc">Create a post to flag items for your supervisor</div></div>`;
    return;
  }

  listEl.innerHTML = posts.map(post => `
    <div class="post-card ${post.postType}${post.resolved ? ' post-resolved' : ''}" id="post-${post.id}">
      <div class="post-card-header">
        <span class="post-type-badge ${post.postType}">${post.postType === 'action-needed' ? 'Action Needed' : 'FYI'}</span>
        <div style="flex:1;">
          <div class="post-title">${escHtml(post.title)}</div>
          <div class="post-meta">${escHtml(post.date)}${post.resolved ? ' &bull; Resolved' : ''}</div>
        </div>
      </div>
      ${post.content ? `<div class="post-body">${escHtml(post.content)}</div>` : ''}
      <div class="post-actions">
        ${currentRole === 'student' && !post.resolved
          ? `<button class="btn btn-secondary btn-sm" onclick="resolvePost('${post.id}')">Mark Resolved</button>`
          : ''}
        ${post.resolved
          ? `<button class="btn btn-ghost btn-sm" onclick="unresolvePost('${post.id}')">Reopen</button>`
          : ''}
        ${currentRole === 'student'
          ? `<button class="delete-btn-sm" onclick="deletePost('${post.id}')">Delete</button>`
          : ''}
      </div>
    </div>
  `).join('');
}

function openPostModal() {
  document.getElementById('post-type-select').value = 'action-needed';
  document.getElementById('post-title-input').value = '';
  document.getElementById('post-content-input').value = '';
  openModal('post-modal');
}

function submitPost() {
  const type = document.getElementById('post-type-select').value;
  const title = document.getElementById('post-title-input').value.trim();
  const content = document.getElementById('post-content-input').value.trim();
  if (!title) { alert('Please enter a title.'); return; }
  appData.posts.unshift({
    id: uid(),
    postType: type,
    title,
    content,
    date: new Date().toISOString().slice(0, 10),
    resolved: false
  });
  saveData();
  closeModal('post-modal');
  renderPosts();
}

function resolvePost(id) {
  const post = appData.posts.find(p => p.id === id);
  if (post) { post.resolved = true; saveData(); renderPosts(); }
}

function unresolvePost(id) {
  const post = appData.posts.find(p => p.id === id);
  if (post) { post.resolved = false; saveData(); renderPosts(); }
}

function deletePost(id) {
  if (!confirm('Delete this post?')) return;
  appData.posts = appData.posts.filter(p => p.id !== id);
  saveData();
  renderPosts();
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function renderSettings() {
  document.getElementById('setting-thesis-title').value = appData.settings.thesisTitle || '';
  document.getElementById('setting-student-name').value = appData.settings.studentName || '';
  document.getElementById('setting-supervisor-name').value = appData.settings.supervisorName || '';
  document.getElementById('setting-deadline').value = appData.settings.deadline || '';
  document.getElementById('setting-phase').value = appData.settings.currentPhase || '';
  document.getElementById('setting-github-token').value = appData.settings.githubToken || '';

  // Phase dropdown options
  const phaseSelect = document.getElementById('setting-phase');
  phaseSelect.innerHTML = '';
  (appData.settings.phases || []).forEach(ph => {
    const opt = document.createElement('option');
    opt.value = ph;
    opt.textContent = ph;
    phaseSelect.appendChild(opt);
  });
  phaseSelect.value = appData.settings.currentPhase || '';

  renderChapterSettings();
}

function renderChapterSettings() {
  const el = document.getElementById('chapter-settings-list');
  el.innerHTML = '';
  appData.chapters.forEach((ch, i) => {
    const row = document.createElement('div');
    row.className = 'chapter-edit-row';
    row.innerHTML = `
      <span class="drag-handle">&#9776;</span>
      <input type="text" value="${escHtml(ch.name)}" placeholder="Chapter name"
        oninput="appData.chapters[${i}].name = this.value; saveData();" />
      <button class="delete-btn-sm" onclick="removeChapter(${i})">Remove</button>`;
    el.appendChild(row);
  });
}

function addChapter() {
  appData.chapters.push({ name: 'New Chapter', percentage: 0 });
  saveData();
  renderChapterSettings();
}

function removeChapter(i) {
  appData.chapters.splice(i, 1);
  saveData();
  renderChapterSettings();
}

function saveSettings() {
  appData.settings.thesisTitle = document.getElementById('setting-thesis-title').value.trim();
  appData.settings.studentName = document.getElementById('setting-student-name').value.trim();
  appData.settings.supervisorName = document.getElementById('setting-supervisor-name').value.trim();
  appData.settings.deadline = document.getElementById('setting-deadline').value;
  appData.settings.currentPhase = document.getElementById('setting-phase').value;
  appData.settings.githubToken = document.getElementById('setting-github-token').value.trim();
  saveData();
  // Update sidebar subtitle
  document.querySelector('.sidebar-subtitle').textContent =
    appData.settings.studentName + ' / ' + appData.settings.supervisorName;
  renderDashboard();
  alert('Settings saved.');
}

// ─── GitHub Repo Sync ─────────────────────────────────────────────────────────

const GITHUB_REPO = 'xiaoyuzoeshan/ISU_Thesis';
const GITHUB_DATA_FILE = 'logbook-data.json';

function updateSyncStatus(msg, isError) {
  const el = document.getElementById('gist-sync-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#C53030' : 'var(--text-muted)';
}

async function pushToRepo() {
  appData.settings.githubToken = document.getElementById('setting-github-token').value.trim();
  saveData();

  const token = appData.settings.githubToken;
  if (!token) { updateSyncStatus('No token — enter your GitHub Personal Access Token first.', true); return; }

  updateSyncStatus('Pushing...');

  const dataToSync = JSON.parse(JSON.stringify(appData));
  delete dataToSync.settings.githubToken;
  // btoa with unicode support
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(dataToSync, null, 2))));

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' };
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_DATA_FILE}`;

  try {
    // Get current SHA (required for updates; 404 means first push)
    let sha = null;
    const getRes = await fetch(url, { headers });
    if (getRes.ok) {
      sha = (await getRes.json()).sha;
    } else if (getRes.status !== 404) {
      const err = await getRes.json().catch(() => ({}));
      updateSyncStatus('Error: ' + (err.message || getRes.statusText), true);
      return;
    }

    const putRes = await fetch(url, {
      method: 'PUT', headers,
      body: JSON.stringify({
        message: `Update logbook data — ${new Date().toISOString().slice(0, 10)}`,
        content,
        ...(sha ? { sha } : {})
      })
    });

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      updateSyncStatus('Error: ' + (err.message || putRes.statusText), true);
      return;
    }

    const t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    updateSyncStatus('Pushed at ' + t);
  } catch (e) {
    updateSyncStatus('Network error: ' + e.message, true);
  }
}

async function pullFromRepo() {
  appData.settings.githubToken = document.getElementById('setting-github-token').value.trim();
  saveData();

  updateSyncStatus('Pulling...');

  const token = appData.settings.githubToken;
  const headers = { 'Accept': 'application/vnd.github+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_DATA_FILE}`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 404) { updateSyncStatus('No data file in repo yet — push first.', true); return; }
      const err = await res.json().catch(() => ({}));
      updateSyncStatus('Error: ' + (err.message || res.statusText), true);
      return;
    }

    const file = await res.json();
    const rawContent = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
    const pulled = JSON.parse(rawContent);

    const localToken = appData.settings.githubToken;
    appData = Object.assign({}, pulled);
    appData.settings.githubToken = localToken;
    saveData();

    const t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    updateSyncStatus('Pulled at ' + t);

    document.querySelector('.sidebar-subtitle').textContent =
      (appData.settings.studentName || 'Student') + ' / ' + (appData.settings.supervisorName || 'Supervisor');
    renderSettings();
    renderSection(currentSection);
  } catch (e) {
    updateSyncStatus('Error: ' + e.message, true);
  }
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar subtitle
  document.querySelector('.sidebar-subtitle').textContent =
    (appData.settings.studentName || 'Student') + ' / ' + (appData.settings.supervisorName || 'Supervisor');

  navigate('dashboard');

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // Build week select in documents section
  buildWeekSelectOptions();
});
