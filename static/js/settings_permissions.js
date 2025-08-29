(function () {
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  const ICON_OK = '<span class="perm-check">✓</span>';
  const ICON_NO = '<span class="perm-cross">✗</span>';

  const root = $('#perm-root');
  let currentMode = 'roles'; // 'roles' | 'user'
  let usersCache = [];
  let currentUserId = '';
  let userRole = '';
  let userAllow = new Set();
  let userDeny  = new Set();
  let roleCapsMap = null; // { role: [caps...] }

  function alertFallback(title, text, type) {
    if (window.Swal) {
      Swal.fire({
        icon: type || 'info',
        title,
        text,
        timer: type==='success' ? 1400 : undefined,
        showConfirmButton: type!=='success'
      });
    } else {
      window.alert(`${title}${text ? ': ' + text : ''}`);
    }
  }

  async function fetchJSON(url, opts={}) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const t = await res.json();
        if (t && t.error) msg = t.error;
      } catch(_) {}
      throw new Error(msg);
    }
    return res.json();
  }

  // ── Режимы ───────────────────────────────────────────────────────────────────
  function setMode(mode) {
    currentMode = mode;
    root.dataset.mode = mode;
    $('#modeLabel').textContent = mode === 'roles' ? 'Roles' : 'User';

    // визуал кнопок
    $('#modeRolesBtn').classList.toggle('btn-primary', mode === 'roles');
    $('#modeRolesBtn').classList.toggle('btn-outline-secondary', mode !== 'roles');
    $('#modeUserBtn').classList.toggle('btn-primary', mode === 'user');
    $('#modeUserBtn').classList.toggle('btn-outline-secondary', mode !== 'user');

    // показ селекта пользователя
    $('#userPicker').classList.toggle('d-none', mode !== 'user');

    // переключение столбцов
    const roleCols  = $$('.role-col');
    const userHead  = $$('.user-col-head');
    const userCells = $$('.user-col');

    if (mode === 'user') {
      roleCols.forEach(el => el.classList.add('d-none'));
      userHead.forEach(el => el.classList.remove('d-none'));
      // очистим, затем, если выбран пользователь — сразу перерисуем итог
      userCells.forEach(el => { el.classList.remove('d-none'); el.innerHTML=''; el.dataset.u=''; el.dataset.eff=''; });
      if (currentUserId) {
        // если уже есть выбранный пользователь — дорисуем иконки без необходимости менять селект
        paintUserColumn();
      }
    } else {
      userHead.forEach(el => el.classList.add('d-none'));
      userCells.forEach(el => el.classList.add('d-none'));
      roleCols.forEach(el => el.classList.remove('d-none'));
    }
  }

  function wireModeButtons() {
    $('#modeRolesBtn')?.addEventListener('click', () => setMode('roles'));
    $('#modeUserBtn')?.addEventListener('click', async () => {
      setMode('user');
      // при входе в User — гарантируем наличие пользователей и карт ролей
      if (usersCache.length === 0) await reloadUsers();
      if (!roleCapsMap) {
        const data = await fetchJSON('/api/authz/roles');
        roleCapsMap = data.roles || {};
      }
      // если уже выбран пользователь — ещё раз подстрахуем перерисовку
      if (currentUserId) paintUserColumn();
    });
  }

  // ── Пользователи ─────────────────────────────────────────────────────────────
  async function reloadUsers() {
    const data = await fetchJSON('/api/authz/users');
    usersCache = data.users || [];
    const sel = $('#userSelect');
    sel.innerHTML = '<option value="">Select user…</option>';
    for (const u of usersCache) {
      const label = `${u.real_name || u.username}${u.role ? ' · ' + u.role : ''}`;
      const opt = document.createElement('option');
      opt.value = u._id;
      opt.textContent = label;
      sel.appendChild(opt);
    }
  }

  async function onUserChange() {
    const userId = $('#userSelect').value;
    currentUserId = userId || '';
    userAllow.clear(); userDeny.clear(); userRole = '';

    const userCells = $$('.user-col');
    userCells.forEach(td => { td.innerHTML = ''; td.dataset.u = ''; td.dataset.eff = ''; });

    if (!userId) return;

    const data = await fetchJSON('/api/authz/user_caps?user_id=' + encodeURIComponent(userId));
    userAllow = new Set(data.allow || []);
    userDeny  = new Set(data.deny || []);
    userRole  = (data.role || '').toLowerCase();

    paintUserColumn();
  }

  function paintUserColumn() {
    const base = new Set((roleCapsMap && roleCapsMap[userRole]) || []);
    $$('.user-col').forEach(td => {
      const slug = td.dataset.slug;

      // пользовательский override
      let ovr = '';
      if (userAllow.has(slug)) ovr = 'allow';
      else if (userDeny.has(slug)) ovr = 'deny';
      td.dataset.u = ovr;

      // эффективное право: override > роль
      const eff = ovr === 'allow' ? true : ovr === 'deny' ? false : (base.has(slug) || base.has('*'));
      td.dataset.eff = eff ? '1' : '0';
      td.innerHTML = eff ? ICON_OK : ICON_NO;
    });
  }

  // ── Вкладки ──────────────────────────────────────────────────────────────────
  function wireTabs() {
    const tabs = $$('.perm-tab');
    const cats = $$('.perm-cat');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.target;
        cats.forEach(c => c.classList.toggle('d-none', c.id !== target));
        // если мы в режиме User и пользователь выбран — перерисовать новый таб
        if (currentMode === 'user' && currentUserId) paintUserColumn();
      });
    });
  }

  // ── Клики ────────────────────────────────────────────────────────────────────
  function enableDelegatedToggle() {
    if (!root) return;

    root.addEventListener('click', (e) => {
      if (currentMode === 'user') {
        const tdU = e.target.closest('td.perm-cell.user-col');
        if (tdU && root.contains(tdU)) { toggleUserOverride(tdU); return; }
      }
      const td = e.target.closest('td.perm-cell.role-col');
      if (td && root.contains(td) && currentMode === 'roles') toggleRoleCell(td);
    });

    root.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (currentMode === 'user') {
        const tdU = e.target.closest('td.perm-cell.user-col[tabindex]');
        if (tdU) { e.preventDefault(); toggleUserOverride(tdU); }
      } else {
        const td = e.target.closest('td.perm-cell.role-col[tabindex]');
        if (td) { e.preventDefault(); toggleRoleCell(td); }
      }
    });
  }

  function toggleRoleCell(td) {
    const has = td.dataset.has === '1';
    const next = has ? '0' : '1';
    td.dataset.has = next;
    td.setAttribute('aria-pressed', next === '1' ? 'true' : 'false');
    td.innerHTML = next === '1' ? ICON_OK : ICON_NO;
  }

  // deny → allow → ''(clear) → deny
  function toggleUserOverride(td) {
    if (!currentUserId) {
      alertFallback('Select user', 'Choose a user first', 'info');
      return;
    }
    const slug = td.dataset.slug;
    const cur  = td.dataset.u || '';
    const next = (cur === 'deny') ? 'allow' : (cur === 'allow') ? '' : 'allow';
    td.dataset.u = next;

    const base = new Set((roleCapsMap && roleCapsMap[userRole]) || []);
    const eff = next === 'allow' ? true : next === 'deny' ? false : (base.has(slug) || base.has('*'));
    td.dataset.eff = eff ? '1' : '0';
    td.innerHTML = eff ? ICON_OK : ICON_NO;
  }

  // ── Сохранение ───────────────────────────────────────────────────────────────
  function gatherPayloadRoles() {
    const roles = {};
    $$('.perm-cell.role-col').forEach(td => {
      const role = td.dataset.role;
      const slug = td.dataset.slug;
      const has = td.dataset.has === '1';
      if (!roles[role]) roles[role] = new Set();
      if (has) roles[role].add(slug);
    });
    const out = {};
    Object.entries(roles).forEach(([role, set]) => {
      out[role] = Array.from(set).sort();
    });
    return { roles: out };
  }

  function gatherPayloadUser() {
    const allow = [];
    const deny  = [];
    $$('.perm-cell.user-col').forEach(td => {
      const slug = td.dataset.slug;
      const ovr = td.dataset.u || '';
      if (ovr === 'allow') allow.push(slug);
      else if (ovr === 'deny') deny.push(slug);
    });
    allow.sort(); deny.sort();
    return { user_id: currentUserId, allow, deny };
  }

  async function save() {
    if (currentMode === 'roles') {
      const payload = gatherPayloadRoles();
      await fetchJSON('/api/authz/roles', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      if (!currentUserId) throw new Error('Select user first');
      const payload = gatherPayloadUser();
      await fetchJSON('/api/authz/user_caps', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      // после сохранения принудительно перерисовываем (на случай внешних модификаций)
      await onUserChange();
    }
  }

  function wireSave() {
    const btn = $('#btnPermSave');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.classList.add('disabled');
      try {
        await save();
        alertFallback('Saved', '', 'success');
      } catch (e) {
        console.error(e);
        alertFallback('Error', e.message || 'Failed to save', 'error');
      } finally {
        btn.disabled = false;
        btn.classList.remove('disabled');
      }
    });
  }

  function wireUserPicker() {
    $('#userSelect')?.addEventListener('change', onUserChange);
  }

  // init
  document.addEventListener('DOMContentLoaded', () => {
    wireTabs();
    enableDelegatedToggle();
    wireSave();
    wireModeButtons();
    wireUserPicker();
    setMode('roles');
  });
})();
