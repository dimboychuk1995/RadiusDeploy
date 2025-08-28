// Таймзоны: загрузка списка, выбор и сохранение
window.initTimezoneSettings = function initTimezoneSettings(currentTz) {
  const sel = document.getElementById('timezoneSelect');
  const cur = document.getElementById('timezoneCurrent');
  const btn = document.getElementById('btnSaveTimezone');

  if (!sel || !btn) return;

  // загрузить список
  fetch('/api/settings/timezones', { credentials: 'same-origin' })
    .then(r => r.json())
    .then(data => {
      if (!data.success) throw new Error('Failed to load timezones');
      const zones = data.timezones || [];
      sel.innerHTML = '';
      zones.forEach(z => {
        const opt = document.createElement('option');
        opt.value = z;
        opt.textContent = z;
        if (z === currentTz) opt.selected = true;
        sel.appendChild(opt);
      });
    })
    .catch(err => {
      console.error(err);
      if (window.Swal) Swal.fire('Error', 'Failed to load timezones', 'error');
    });

  // сохранить
  btn.addEventListener('click', () => {
    const tz = sel.value;
    fetch('/api/settings/timezone', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: tz })
    })
      .then(r => r.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Save failed');
        if (cur) cur.textContent = data.timezone;
        if (window.Swal) Swal.fire({ icon: 'success', title: 'Saved', timer: 1200, showConfirmButton: false });
      })
      .catch(err => {
        console.error(err);
        if (window.Swal) Swal.fire('Error', err.message || 'Failed to save', 'error');
      });
  });
};
