(function () {
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  const ICON_OK = '<span class="perm-check">✓</span>';
  const ICON_NO = '<span class="perm-cross">✗</span>';

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

  // Делегированное переключение прав (клики по любой ячейке .perm-cell)
  function enableDelegatedToggle() {
    const root = $('#perm-root');
    if (!root) return;

    root.addEventListener('click', (e) => {
      const td = e.target.closest('td.perm-cell');
      if (!td || !root.contains(td)) return;
      toggleCell(td);
    });

    // Поддержка клавиатуры (Space/Enter)
    root.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const td = e.target.closest('td.perm-cell[tabindex]');
      if (!td) return;
      e.preventDefault();
      toggleCell(td);
    });
  }

  function toggleCell(td) {
    // не даём случайно переключать "служебные" клетки, если такие появятся
    if (td.hasAttribute('data-disabled')) return;

    const has = td.dataset.has === '1';
    const next = has ? '0' : '1';
    td.dataset.has = next;
    td.setAttribute('aria-pressed', next === '1' ? 'true' : 'false');
    td.innerHTML = next === '1' ? ICON_OK : ICON_NO;
  }

  function wireTabs() {
    const tabs = $$('.perm-tab');
    const cats = $$('.perm-cat');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.target;
        cats.forEach(c => c.classList.toggle('d-none', c.id !== target));
      });
    });
  }

  function gatherPayload() {
    const roles = {};
    $$('.perm-cell').forEach(td => {
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

  async function saveRoles() {
    const payload = gatherPayload();
    const res = await fetch('/api/authz/roles', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const t = await res.json();
        if (t && t.error) msg = t.error;
      } catch (_) {}
      throw new Error(msg);
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Save failed');
    return data;
  }

  function wireSave() {
    const btn = $('#btnPermSave');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.classList.add('disabled');
      try {
        await saveRoles();
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

  document.addEventListener('DOMContentLoaded', () => {
    wireTabs();
    enableDelegatedToggle();
    wireSave();
  });
})();
