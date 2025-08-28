(function () {
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  const ICON_OK = '<span class="perm-check">✓</span>';
  const ICON_NO = '<span class="perm-cross">✗</span>';

  function renderTabs(categories) {
    const tabs = $('#perm-tabs');
    tabs.innerHTML = '';
    categories.forEach((cat, idx) => {
      const a = document.createElement('button');
      a.className = 'perm-tab btn border-0' + (idx === 0 ? ' active' : '');
      a.type = 'button';
      a.dataset.cat = cat.category;
      a.textContent = cat.category;
      a.addEventListener('click', () => {
        $$('.perm-tab', tabs).forEach(x => x.classList.remove('active'));
        a.classList.add('active');
        renderTable(cat);
      });
      tabs.appendChild(a);
    });
  }

  function buildHeader(roles) {
    const tr = document.createElement('tr');
    tr.className = 'perm-sticky-head';
    const th0 = document.createElement('th');
    th0.className = 'perm-function perm-sticky-first';
    th0.textContent = 'Function';
    tr.appendChild(th0);
    roles.forEach(r => {
      const th = document.createElement('th');
      th.innerHTML = `<span class="badge perm-badge-role text-wrap">${r}</span>`;
      tr.appendChild(th);
    });
    return tr;
  }

  function rowGroup(title, count) {
    const tr = document.createElement('tr');
    tr.className = 'perm-group-row';
    const td = document.createElement('td');
    td.className = 'perm-sticky-first';
    td.innerHTML = `<span class="me-2">›</span> ${title} ${count != null ? `(${count})` : ''}`;
    td.colSpan = 999;
    tr.appendChild(td);
    return tr;
  }

  function rowItem(item, roles, state) {
    const tr = document.createElement('tr');
    const td0 = document.createElement('td');
    td0.className = 'perm-sticky-first';
    td0.textContent = item.label;
    tr.appendChild(td0);

    roles.forEach(r => {
      const td = document.createElement('td');
      td.className = 'perm-cell text-center';
      const has = (state[r] && state[r].has(item.slug)) ? 1 : 0;
      td.dataset.slug = item.slug;
      td.dataset.role = r;
      td.innerHTML = has ? ICON_OK : ICON_NO;
      td.addEventListener('click', () => {
        toggle(state, r, item.slug);
        td.innerHTML = (state[r].has(item.slug)) ? ICON_OK : ICON_NO;
      });
      tr.appendChild(td);
    });

    return tr;
  }

  function toggle(state, role, slug) {
    if (!state[role]) state[role] = new Set();
    if (state[role].has(slug)) state[role].delete(slug);
    else state[role].add(slug);
  }

  function serialize(state) {
    const out = {};
    Object.entries(state).forEach(([role, set]) => {
      out[role] = Array.from(set).sort();
    });
    return out;
  }

  let CATEGORIES = [];
  let ROLES = [];
  let STATE = {};

  function renderTable(category) {
    const wrap = $('#perm-table-wrapper');
    wrap.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'table table-hover align-middle';
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    thead.appendChild(buildHeader(ROLES));
    table.appendChild(thead);

    category.groups.forEach(grp => {
      tbody.appendChild(rowGroup(grp.group, grp.items.length));
      grp.items.forEach(item => {
        tbody.appendChild(rowItem(item, ROLES, STATE));
      });
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  async function loadAll() {
    const [catRes, roleRes] = await Promise.all([
      fetch('/api/authz/catalog', { credentials: 'same-origin' }),
      fetch('/api/authz/roles',   { credentials: 'same-origin' }),
    ]);
    const cat = await catRes.json();
    const roles = await roleRes.json();
    if (!cat.success || !roles.success) throw new Error('load failed');

    CATEGORIES = cat.categories || [];
    ROLES = (cat.roles || []).filter(r => r !== 'superadmin');

    const rolesMap = roles.roles || {};
    STATE = {};
    ROLES.forEach(r => {
      const caps = new Set((rolesMap[r] || []).filter(Boolean));
      STATE[r] = caps;
    });

    renderTabs(CATEGORIES);
    renderTable(CATEGORIES[0]);
  }

  function wireSave() {
    const btn = $('#btnPermSave');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const payload = { roles: serialize(STATE) };
        const res = await fetch('/api/authz/roles', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Save failed');
        if (window.Swal) Swal.fire({ icon: 'success', title: 'Saved', timer: 1200, showConfirmButton: false });
      } catch (e) {
        console.error(e);
        if (window.Swal) Swal.fire('Error', e.message || 'Failed to save', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  window.initPermissions = function initPermissions() {
    loadAll().then(wireSave).catch(err => {
      console.error(err);
      const wrap = $('#perm-table-wrapper');
      if (wrap) wrap.innerHTML = '<div class="alert alert-danger">Failed to load permissions.</div>';
    });
  };
})();
