(function () {
  'use strict';

  /** Возвращает первый элемент по селектору. */
  const $ = (sel, el = document) => el.querySelector(sel);

  /** Возвращает массив элементов по селектору. */
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // Чёткие SVG-иконки (без изгибов)
  const ICON_OK =
    '<svg class="perm-ico perm-check" viewBox="0 0 24 24" aria-hidden="true">' +
    '<polyline points="4 12 9 17 20 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/></svg>';

  const ICON_NO =
    '<svg class="perm-ico perm-cross" viewBox="0 0 24 24" aria-hidden="true">' +
    '<line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="3" stroke-linecap="square"/>' +
    '<line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="3" stroke-linecap="square"/></svg>';

  // ── Глобальное состояние страницы ────────────────────────────────────────────
  const root = $('#perm-root');
  let currentMode = 'roles'; // 'roles' | 'user'

  // Состояние выбранного пользователя
  let currentUserId = '';
  let userRole = '';
  let userAllow = new Set();
  let userDeny  = new Set();

  // Карта прав для ролей: { role: [caps...] }
  let roleCapsMap = null;

  // Координация асинхронной инициализации user-режима
  let isUserInit = false;
  let userLoadingPromise = null;

  // Антидребезг первого клика
  const DEBOUNCE_MS = 150;
  const lastClickAt = new WeakMap(); // td -> timestamp

  // ── Утилиты ──────────────────────────────────────────────────────────────────

  /** Показать системное уведомление (Swal или alert). */
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

  /** fetch JSON с нормальной обработкой ошибок. */
  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const t = await res.json();
        if (t && t.error) msg = t.error;
      } catch (_) {}
      throw new Error(msg);
    }
    return res.json();
  }

  /** Гарантированно загрузить карту прав по ролям (один раз). */
  async function ensureRoleCaps() {
    if (roleCapsMap) return;
    const data = await fetchJSON('/api/authz/roles');
    roleCapsMap = data.roles || {};
  }

  /** Получить выбранного в Select2 пользователя (id). */
  function getSelectedUserId() {
    const jq = window.jQuery;
    if (jq && jq('#userSelect').length) {
      const v = jq('#userSelect').val();
      if (Array.isArray(v)) return v[0] || '';
      return v ? String(v) : '';
    }
    const el = $('#userSelect');
    return el ? String(el.value || '') : '';
  }

  // ── Select2 ──────────────────────────────────────────────────────────────────

  /** Инициализировать Select2 для выбора пользователя (с AJAX-поиском). */
  function initSelect2() {
    const jq = window.jQuery;
    if (!jq || !jq.fn || !jq.fn.select2) return;

    const $sel = jq('#userSelect');

    // Пересоздаём каждый раз на входе в режим User (устойчиво к навигациям).
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

  // ── Переключение режима Roles/User ───────────────────────────────────────────

  /** Установить режим страницы: 'roles' или 'user' и перерисовать колоноки. */
  async function setMode(mode) {
    currentMode = mode;
    root.dataset.mode = mode;
    $('#modeLabel').textContent = mode === 'roles' ? 'Roles' : 'User';

    // Визуал кнопок/селекта
    $('#modeRolesBtn').classList.toggle('btn-primary', mode === 'roles');
    $('#modeRolesBtn').classList.toggle('btn-outline-secondary', mode !== 'roles');
    $('#modeUserBtn').classList.toggle('btn-primary', mode === 'user');
    $('#modeUserBtn').classList.toggle('btn-outline-secondary', mode !== 'user');
    $('#userPicker').classList.toggle('d-none', mode !== 'user');

    const roleCols  = $$('.role-col');
    const userHead  = $$('.user-col-head');
    const userCells = $$('.user-col');

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
        // Единый промис загрузки — клики ждут его завершения
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

  /** Навешивает обработчики кнопок «Roles»/«User». */
  function wireModeButtons() {
    $('#modeRolesBtn')?.addEventListener('click', () => setMode('roles'));
    $('#modeUserBtn')?.addEventListener('click', () => setMode('user'));
  }

  // ── Загрузка и отрисовка прав пользователя ──────────────────────────────────

  /** Считать с бэка роль/allow/deny для выбранного пользователя. */
  async function loadUserCaps(userId) {
    currentUserId = userId || '';
    userAllow.clear(); userDeny.clear(); userRole = '';
    if (!currentUserId) return;

    const data = await fetchJSON('/api/authz/user_caps?user_id=' + encodeURIComponent(currentUserId));
    userAllow = new Set(data.allow || []);
    userDeny  = new Set(data.deny || []);
    userRole  = (data.role || '').toLowerCase();
  }

  /** Обработчик смены пользователя в Select2: загрузить и перерисовать столбец. */
  async function onUserChange() {
    isUserInit = true;
    root.classList.add('busy');

    const userId = getSelectedUserId();
    $$('.user-col').forEach(td => { td.innerHTML = ''; td.dataset.u = ''; td.dataset.eff = ''; lastClickAt.delete(td); });

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

  /** Перерисовать единственный столбец «User» (эффективные права). */
  function paintUserColumn() {
    const base = new Set((roleCapsMap && roleCapsMap[userRole]) || []);
    $$('.user-col').forEach(td => {
      const slug = td.dataset.slug;

      // Текущий override
      let ovr = '';
      if (userAllow.has(slug)) ovr = 'allow';
      else if (userDeny.has(slug)) ovr = 'deny';
      td.dataset.u = ovr;

      // Эффективное право: override > роль
      const eff = ovr === 'allow' ? true : ovr === 'deny' ? false : (base.has(slug) || base.has('*'));
      td.dataset.eff = eff ? '1' : '0';
      td.innerHTML = eff ? ICON_OK : ICON_NO;
    });
  }

  // ── Вкладки категорий ────────────────────────────────────────────────────────

  /** Навигация по табам категорий: показать нужную таблицу и (при user) перерисовать. */
  function wireTabs() {
    const tabs = $$('.perm-tab');
    const cats = $$('.perm-cat');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.target;
        cats.forEach(c => c.classList.toggle('d-none', c.id !== target));
        if (currentMode === 'user' && (currentUserId || getSelectedUserId())) paintUserColumn();
      });
    });
  }

  // ── Переключение клеток ──────────────────────────────────────────────────────

  /** Делегированный обработчик кликов/клавиш в таблице (и антидребезг). */
  function enableDelegatedToggle() {
    root.addEventListener('click', async (e) => {
      if (currentMode === 'user') {
        const tdU = e.target.closest('td.perm-cell.user-col');
        if (tdU && root.contains(tdU)) {
          e.preventDefault();
          e.stopPropagation();

          if (isUserInit) return;
          if (userLoadingPromise) { try { await userLoadingPromise; } catch (_) {} }

          const now = performance.now();
          const prev = lastClickAt.get(tdU) || 0;
          if (now - prev < DEBOUNCE_MS || tdU.dataset.lock === '1') return;
          tdU.dataset.lock = '1';

          await toggleUserOverride(tdU, e);

          lastClickAt.set(tdU, now);
          requestAnimationFrame(() => { tdU.dataset.lock = '0'; });
          return;
        }
      }
      const td = e.target.closest('td.perm-cell.role-col');
      if (td && root.contains(td) && currentMode === 'roles') toggleRoleCell(td);
    });

    root.addEventListener('keydown', async (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (currentMode === 'user') {
        const tdU = e.target.closest('td.perm-cell.user-col[tabindex]');
        if (tdU) {
          e.preventDefault();
          if (isUserInit) return;
          if (userLoadingPromise) { try { await userLoadingPromise; } catch (_) {} }

          const now = performance.now();
          const prev = lastClickAt.get(tdU) || 0;
          if (now - prev < DEBOUNCE_MS || tdU.dataset.lock === '1') return;
          tdU.dataset.lock = '1';

          await toggleUserOverride(tdU, e);

          lastClickAt.set(tdU, now);
          requestAnimationFrame(() => { tdU.dataset.lock = '0'; });
        }
      } else {
        const td = e.target.closest('td.perm-cell.role-col[tabindex]');
        if (td) { e.preventDefault(); toggleRoleCell(td); }
      }
    });
  }

  /** Переключить клетку в режиме ролей (галка ↔ крестик). */
  function toggleRoleCell(td) {
    const has = td.dataset.has === '1';
    const next = has ? '0' : '1';
    td.dataset.has = next;
    td.setAttribute('aria-pressed', next === '1' ? 'true' : 'false');
    td.innerHTML = next === '1' ? ICON_OK : ICON_NO;
  }

  /**
   * Переключить override для одной capability в режиме пользователя.
   * Обычный клик: allow ↔ deny. Если override пуст — поставить противоположное базовому.
   * Ctrl/Meta/Alt: очистить override (вернуться к праву из роли).
   */
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

  // ── Сохранение ───────────────────────────────────────────────────────────────

  /** Собрать payload по ролям из таблицы. */
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
    Object.entries(roles).forEach(([role, set]) => { out[role] = Array.from(set).sort(); });
    return { roles: out };
  }

  /** Собрать payload override’ов пользователя. */
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
    return { user_id: currentUserId || getSelectedUserId(), allow, deny };
  }

  /** Отправить изменения на бэк (режим ролей или пользователя). */
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
      // Перезагрузим состояние после сохранения
      await loadUserCaps(currentUserId);
      paintUserColumn();
    }
  }

  /** Навешивает обработчик на кнопку Save с защитой от повторных нажатий. */
  function wireSave() {
    const btn = $('#btnPermSave');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      if (btn.classList.contains('is-saving')) return; // защёлка от дублей
      btn.classList.add('is-saving');
      btn.disabled = true;
      try {
        await save();
        alertFallback('Saved', '', 'success');
      } catch (e) {
        console.error(e);
        alertFallback('Error', e.message || 'Failed to save', 'error');
      } finally {
        btn.disabled = false;
        btn.classList.remove('is-saving');
      }
    });
  }

  // ── Инициализация ────────────────────────────────────────────────────────────

  /** Точка входа: навешиваем обработчики и стартуем в режиме ролей. */
  document.addEventListener('DOMContentLoaded', () => {
    wireTabs();
    enableDelegatedToggle();
    wireSave();
    wireModeButtons();
    setMode('roles');
  });
})();
