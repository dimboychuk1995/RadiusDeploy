function initDispatcherCalendars() {
  const blocks = document.querySelectorAll('.dispatcher-block');

  blocks.forEach(block => {
    const drivers = JSON.parse(block.dataset.drivers || '[]');
    const loads = JSON.parse(block.dataset.loads || '[]');
    const listContainer = block.querySelector('.driver-calendar-list');

    const weekDates = getWeekDates(new Date());
    const weekStart = normalizeDate(weekDates[0]);
    const weekEnd = normalizeDate(weekDates[6]);
    const dayMs = 86400000;

    listContainer.innerHTML = '';

    drivers.forEach(driver => {
      const row = document.createElement('div');
      row.className = 'driver-row';

      const info = document.createElement('div');
      info.className = 'driver-info';
      const unit = driver.truck?.unit_number || '';
      info.innerText = `${unit} — ${driver.name}`;
      row.appendChild(info);

      const timeline = document.createElement('div');
      timeline.className = 'timeline';

      const driverId = normalizeId(driver._id);

      const driverLoads = loads.filter(load => normalizeId(load?.assigned_driver) === driverId);

      driverLoads.forEach(load => {
        const pickup = parseAndNormalizeDate(load?.pickup?.date);
        const delivery = parseAndNormalizeDate(load?.delivery?.date);
        if (!pickup || !delivery) return;

        // Пропускаем, если груз не попадает в текущую неделю
        if (pickup > weekEnd || delivery < weekStart) return;

        const effectiveStart = pickup < weekStart ? weekStart : pickup;
        const effectiveEnd = delivery > weekEnd ? weekEnd : delivery;

        const offsetDays = Math.floor((effectiveStart - weekStart) / dayMs);
        const durationDays = Math.floor((effectiveEnd - effectiveStart) / dayMs) + 1;

        const leftPercent = (offsetDays / 7) * 100;
        const widthPercent = (durationDays / 7) * 100;

        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.left = `${leftPercent}%`;
        bar.style.width = `${widthPercent}%`;
        bar.title = `${load.load_id || load._id} | ${load.pickup?.address} → ${load.delivery?.address}`;
        bar.innerText = `#${load.load_id || load._id}`;

        timeline.appendChild(bar);
      });

      row.appendChild(timeline);
      listContainer.appendChild(row);
    });
  });

  updateGlobalWeekLabel();
  renderWeekLabels();
}

// Очищает дату до полуночи локально
function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseAndNormalizeDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
  let year, month, day;
  if (dateStr.includes('/')) {
    [month, day, year] = parts.map(Number); // MM/DD/YYYY
  } else {
    [year, month, day] = parts.map(Number); // YYYY-MM-DD
  }
  return new Date(year, month - 1, day);
}

function normalizeId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value && value.$oid) return value.$oid;
  return String(value);
}

function getWeekDates(baseDate) {
  const date = new Date(baseDate);
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((day + 6) % 7));
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    result.push(d);
  }
  return result;
}

function updateGlobalWeekLabel() {
  const week = getWeekDates(new Date());
  const fmt = d => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
  document.getElementById('globalWeekLabel').innerText = `${fmt(week[0])} — ${fmt(week[6])}`;
}

function renderWeekLabels() {
  const week = getWeekDates(new Date());
  const container = document.getElementById('weekLabels');
  container.innerHTML = '';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  week.forEach(date => {
    const div = document.createElement('div');
    div.className = 'day-label';
    div.innerText = `${dayNames[date.getDay()]} ${date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit'
    })}`;
    container.appendChild(div);
  });
}
