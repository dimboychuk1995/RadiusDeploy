// settings_permissions.js (SPA-safe с плавным переключением категорий)
(function () {
  'use strict';

  // ── helpers ───────────────────────────────────────────────────────────
  const $  = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  function getRoot() {
    return (
      document.getElementById('perm-root') ||
      document.querySelector('[data-permissions-root]') ||
      document.getElementById('settings-content') ||
      document
    );
  }

  const ICON_OK =
    '<svg class="perm-ico perm-check" viewBox="0 0 24 24" aria-hidden="true">' +
    '<polyline points="4 12 9 17 20 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/></svg>';
  const ICON_NO =
    '<svg class="perm-ico perm-cross" viewBox="0 0 24 24" aria-hidden="true">' +
    '<line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="3" stroke-linecap="square"/>' +
    '<line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="3" stroke-linecap="square"/></svg>';

  // ── state ─────────────────────────────────────────────────────────────
  let currentMode = 'roles'; // 'roles' | 'user'
  let currentUserId = '';
  let userRole = '';
  let userAllow = new Set();
  let userDeny  = new Set();
  let roleCapsMap = null;

  let isUserInit = false;
  let userLoadingPromise = null;

  const DEBOUNCE_MS = 150;
  const lastClickAt = new WeakMap(); // td -> timestamp
  let listenersBound = false;

  // ── utils ─────────────────────────────────────────────────────────────
  function alertFallback(title, text, type) {
    if (window.Swal) {
      Swal.fire({
        icon: type || 'info',
        title,
        text,
        timer: type === 'success' ? 1400 : undefined,
        showConfirmButton: type !== 'success'
      });
    } else {
      window.alert(`${title}${text ? ': ' + text : ''}`);
    }
  }

  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const t = await res.json(); if (t && t.error) msg = t.error; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function ensureRoleCaps() {
    if (roleCapsMap) return;
    const data = await fetchJSON('/api/authz/roles');
    roleCapsMap = data.roles || {};
  }

  function getSelectedUserId() {
    const jq = window.jQuery;
    if (jq && jq('#userSelect').length) {
      const v = jq('#userSelect').val();
      if (Array.isArray(v)) return v[0] || '';
      return v ? String(v) : '';
    }
    const el = $('#userSelect', getRoot());
    return el ? String(el.value || '') : '';
  }

  // ── Select2 ───────────────────────────────────────────────────────────
  function initSelect2() {
    const jq = window.jQuery;
    if (!jq || !jq.fn || !jq.fn.select2) return;
    const $sel = jq('#userSelect');

    if ($sel.data('select2')) {
      $sel.off('change.select2authz');
      $sel.select2('destroy');
    }

    $sel.select2({
      placeholder: 'Select user…',
      allowClear: true,
      width: 'resolve',
      minimumInputLength: 0,
      ajax: {
        url: '/api/authz/users',
        dataType: 'json',
        delay: 200,
        data: params => ({ q: params.term || '' }),
        processResults: data => ({
          results: (data.users || []).map(u => ({
            id: u._id,
            text: (u.real_name || u.username) + (u.role ? ' · ' + u.role : '')
          }))
        }),
        cache: true
      }
    });

    $sel.on('change.select2authz', onUserChange);
  }

  // ── режим Roles/User ──────────────────────────────────────────────────
  async function setMode(mode) {
    currentMode = mode;
    const root = getRoot();
    root.dataset.mode = mode;
    $('#modeLabel', root).textContent = mode === 'roles' ? 'Roles' : 'User';

    $('#modeRolesBtn', root)?.classList.toggle('btn-primary', mode === 'roles');
    $('#modeRolesBtn', root)?.classList.toggle('btn-outline-secondary', mode !== 'roles');
    $('#modeUserBtn',  root)?.classList.toggle('btn-primary', mode === 'user');
    $('#modeUserBtn',  root)?.classList.toggle('btn-outline-secondary', mode !== 'user');
    $('#userPicker',   root)?.classList.toggle('d-none', mode !== 'user');

    const roleCols  = $$('.role-col', root);
    const userHead  = $$('.user-col-head', root);
    const userCells = $$('.user-col', root);

    if (mode === 'user') {
      isUserInit = true;
      root.classList.add('busy');

      roleCols.forEach(el => el.classList.add('d-none'));
      userHead.forEach(el => el.classList.remove('d-none'));
      userCells.forEach(el => { el.classList.remove('d-none'); el.innerHTML=''; el.dataset.u=''; el.dataset.eff=''; });

      initSelect2();
      await ensureRoleCaps();

      const pre = getSelectedUserId();
      if (pre) {
        userLoadingPromise = (async () => {
          await loadUserCaps(pre);
          paintUserColumn();
        })();
        await userLoadingPromise;
        userLoadingPromise = null;
      }

      isUserInit = false;
      root.classList.remove('busy');
    } else {
      userHead.forEach(el => el.classList.add('d-none'));
      userCells.forEach(el => el.classList.add('d-none'));
      roleCols.forEach(el => el.classList.remove('d-none'));
    }
  }

  function wireModeButtons() {
    const root = getRoot();
    $('#modeRolesBtn', root)?.addEventListener('click', () => setMode('roles'));
    $('#modeUserBtn',  root)?.addEventListener('click', () => setMode('user'));
  }

  // ── user caps ─────────────────────────────────────────────────────────
  async function loadUserCaps(userId) {
    currentUserId = userId || '';
    userAllow.clear(); userDeny.clear(); userRole = '';
    if (!currentUserId) return;

    const data = await fetchJSON('/api/authz/user_caps?user_id=' + encodeURIComponent(currentUserId));
    userAllow = new Set(data.allow || []);
    userDeny  = new Set(data.deny || []);
    userRole  = (data.role || '').toLowerCase();
  }

  async function onUserChange() {
    const root = getRoot();
    isUserInit = true;
    root.classList.add('busy');

    const userId = getSelectedUserId();
    $$('.user-col', root).forEach(td => { td.innerHTML = ''; td.dataset.u = ''; td.dataset.eff = ''; lastClickAt.delete(td); });

    if (!userId) {
      currentUserId = '';
      isUserInit = false;
      root.classList.remove('busy');
      return;
    }

    await ensureRoleCaps();

    userLoadingPromise = (async () => {
      await loadUserCaps(userId);
      paintUserColumn();
    })();
    await userLoadingPromise;
    userLoadingPromise = null;

    isUserInit = false;
    root.classList.remove('busy');
  }

  function paintUserColumn() {
    const root = getRoot();
    const base = new Set((roleCapsMap && roleCapsMap[userRole]) || []);
    $$('.user-col', root).forEach(td => {
      const slug = td.dataset.slug;
      let ovr = '';
      if (userAllow.has(slug)) ovr = 'allow';
      else if (userDeny.has(slug)) ovr = 'deny';
      td.dataset.u = ovr;

      const eff = ovr === 'allow' ? true : ovr === 'deny' ? false : (base.has(slug) || base.has('*'));
      td.dataset.eff = eff ? '1' : '0';
      td.innerHTML = eff ? ICON_OK : ICON_NO;
    });
  }

  // ── tabs (с плавной анимацией) ────────────────────────────────────────
  function handleTabClick(btn) {
    const root = getRoot();
    const tabs = $$('.perm-tab', root);
    const cats = $$('.perm-cat', root);
    const targetId = btn.dataset.target;
    const next = $('#' + targetId, root);
    if (!next) return;

    const prev = cats.find(el => !el.classList.contains('d-none')) || null;
    if (prev === next) {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      return;
    }

    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const wrap = $('#perm-cats', root) || next.parentElement;
    const fromH = prev ? prev.offsetHeight : next.offsetHeight;
    wrap.style.height = fromH + 'px';

    next.classList.remove('d-none');
    next.classList.add('is-enter');

    requestAnimationFrame(() => {
      const toH = next.offsetHeight;
      wrap.style.height = toH + 'px';

      next.classList.add('is-enter-active');
      if (prev) {
        prev.classList.add('is-exit', 'is-exit-active');
      }

      setTimeout(() => {
        if (prev) {
          prev.classList.add('d-none');
          prev.classList.remove('is-exit', 'is-exit-active');
        }
        next.classList.remove('is-enter', 'is-enter-active');
        wrap.style.height = '';

        if (currentMode === 'user' && (currentUserId || getSelectedUserId())) {
          paintUserColumn();
        }
      }, 220);
    });
  }

  function wireTabs() {
    const root = getRoot();
    $$('.perm-tab', root).forEach(btn => {
      btn.addEventListener('click', () => handleTabClick(btn));
    });
  }

  // ── toggles (делегировано) ────────────────────────────────────────────
  function enableDelegatedToggle() {
    if (listenersBound) return;

    document.addEventListener('click', async (e) => {
      const root = getRoot();
      if (!root.querySelector('#modeRolesBtn') && !root.querySelector('#modeUserBtn')) return;

      const rolesBtn = e.target.closest('#modeRolesBtn');
      if (rolesBtn) { e.preventDefault(); await setMode('roles'); return; }

      const userBtn = e.target.closest('#modeUserBtn');
      if (userBtn) { e.preventDefault(); await setMode('user');  return; }

      const tabBtn = e.target.closest('.perm-tab');
      if (tabBtn && root.contains(tabBtn)) { e.preventDefault(); handleTabClick(tabBtn); return; }

      const saveBtn = e.target.closest('#btnPermSave');
      if (saveBtn && root.contains(saveBtn)) {
        if (saveBtn.classList.contains('is-saving')) return;
        saveBtn.classList.add('is-saving'); saveBtn.disabled = true;
        try { await save(); alertFallback('Saved', '', 'success'); }
        catch (err) { console.error(err); alertFallback('Error', err.message || 'Failed to save', 'error'); }
        finally { saveBtn.disabled = false; saveBtn.classList.remove('is-saving'); }
        return;
      }

      if (currentMode === 'user') {
        const tdU = e.target.closest('td.perm-cell.user-col');
        if (tdU && root.contains(tdU)) {
          e.preventDefault();
          if (isUserInit) return;
          if (userLoadingPromise) { try { await userLoadingPromise; } catch {} }

          const now = performance.now();
          const prev = lastClickAt.get(tdU) || 0;
          if (now - prev < DEBOUNCE_MS || tdU.dataset.lock === '1') return;
          tdU.dataset.lock = '1';

          await toggleUserOverride(tdU, e);

          lastClickAt.set(tdU, now);
          requestAnimationFrame(() => { tdU.dataset.lock = '0'; });
          return;
        }
      } else {
        const tdR = e.target.closest('td.perm-cell.role-col');
        if (tdR && root.contains(tdR)) { e.preventDefault(); toggleRoleCell(tdR); return; }
      }
    });

    document.addEventListener('keydown', async (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;

      const root = getRoot();
      if (!root.querySelector('#modeRolesBtn') && !root.querySelector('#modeUserBtn')) return;

      if (currentMode === 'user') {
        const tdU = e.target.closest('td.perm-cell.user-col[tabindex]');
        if (tdU) {
          e.preventDefault();
          if (isUserInit) return;
          if (userLoadingPromise) { try { await userLoadingPromise; } catch {} }

          const now = performance.now();
          const prev = lastClickAt.get(tdU) || 0;
          if (now - prev < DEBOUNCE_MS || tdU.dataset.lock === '1') return;
          tdU.dataset.lock = '1';

          await toggleUserOverride(tdU, e);

          lastClickAt.set(tdU, now);
          requestAnimationFrame(() => { tdU.dataset.lock = '0'; });
        }
      } else {
        const tdR = e.target.closest('td.perm-cell.role-col[tabindex]');
        if (tdR) { e.preventDefault(); toggleRoleCell(tdR); }
      }
    });

    listenersBound = true;
  }

  function toggleRoleCell(td) {
    const has = td.dataset.has === '1';
    const next = has ? '0' : '1';
    td.dataset.has = next;
    td.setAttribute('aria-pressed', next === '1' ? 'true' : 'false');
    td.innerHTML = next === '1' ? ICON_OK : ICON_NO;
  }

  async function toggleUserOverride(td, evt) {
    if (!currentUserId) currentUserId = getSelectedUserId();
    if (!currentUserId) { alertFallback('Select user', 'Choose a user first', 'info'); return; }
    if (!userRole) { await ensureRoleCaps(); await loadUserCaps(currentUserId); }

    const slug = td.dataset.slug;
    const baseCaps = new Set((roleCapsMap && roleCapsMap[userRole]) || []);
    const effBase  = baseCaps.has(slug) || baseCaps.has('*');
    const curOvr   = td.dataset.u || '';

    let nextOvr;
    if (evt && (evt.ctrlKey || evt.metaKey || evt.altKey)) {
      nextOvr = '';
    } else if (curOvr === 'allow') {
      nextOvr = 'deny';
    } else if (curOvr === 'deny') {
      nextOvr = 'allow';
    } else {
      nextOvr = effBase ? 'deny' : 'allow';
    }

    td.dataset.u = nextOvr;

    const eff = nextOvr === 'allow' ? true : nextOvr === 'deny' ? false : effBase;
    td.dataset.eff = eff ? '1' : '0';
    td.innerHTML = eff ? ICON_OK : ICON_NO;
  }

  // ── save ──────────────────────────────────────────────────────────────
  function gatherPayloadRoles() {
    const roles = {};
    $$('.perm-cell.role-col', getRoot()).forEach(td => {
      const role = td.dataset.role;
      const slug = td.dataset.slug;
      const has = td.dataset.has === '1';
      if (!roles[role]) roles[role] = new Set();
      if (has) roles[role].add(slug);
    });
    const out = {};
    Object.entries(roles).forEach(([role, set]) => { out[role] = Array.from(set).sort(); });
    return { roles: out };
  }

  function gatherPayloadUser() {
    const allow = [], deny = [];
    $$('.perm-cell.user-col', getRoot()).forEach(td => {
      const slug = td.dataset.slug;
      const ovr = td.dataset.u || '';
      if (ovr === 'allow') allow.push(slug);
      else if (ovr === 'deny') deny.push(slug);
    });
    allow.sort(); deny.sort();
    return { user_id: currentUserId || getSelectedUserId(), allow, deny };
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
      currentUserId = currentUserId || getSelectedUserId();
      if (!currentUserId) throw new Error('Select user first');
      const payload = gatherPayloadUser();
      await fetchJSON('/api/authz/user_caps', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await loadUserCaps(currentUserId);
      paintUserColumn();
    }
  }

  function wireSave() {
    const btn = $('#btnPermSave', getRoot());
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (btn.classList.contains('is-saving')) return;
      btn.classList.add('is-saving'); btn.disabled = true;
      try { await save(); alertFallback('Saved', '', 'success'); }
      catch (e) { console.error(e); alertFallback('Error', e.message || 'Failed to save', 'error'); }
      finally { btn.disabled = false; btn.classList.remove('is-saving'); }
    });
  }

  // ── init ──────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    wireTabs();
    enableDelegatedToggle();
    wireSave();
    wireModeButtons();
    setMode('roles');
  });
})();
