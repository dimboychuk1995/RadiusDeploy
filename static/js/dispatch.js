let currentBaseDate = new Date(); // глобальная переменная

function bindWeekSwitchers() {
  document.getElementById('globalPrevWeekBtn')?.addEventListener('click', () => {
    currentBaseDate.setDate(currentBaseDate.getDate() - 7);
    initDispatcherCalendars();
  });

  document.getElementById('globalNextWeekBtn')?.addEventListener('click', () => {
    currentBaseDate.setDate(currentBaseDate.getDate() + 7);
    initDispatcherCalendars();
  });
}

const collapsedDispatchers = new Set();

function initDispatcherCalendars() {
  const blocks = document.querySelectorAll('.dispatcher-block');

  blocks.forEach(block => {
    const drivers = JSON.parse(block.dataset.drivers || '[]');
    const loads = JSON.parse(block.dataset.loads || '[]');
    const listContainer = block.querySelector('.driver-calendar-list');

    const dispatcherId = block.dataset.dispatcherId;
    if (collapsedDispatchers.has(dispatcherId)) {
      listContainer.classList.add('collapsed');
      listContainer.style.maxHeight = '0px';
    }

    const weekDates = getWeekDates(currentBaseDate);
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

      const occupiedSlots = [];

      const barHeight = 20;
      const barGap = 4;

      driverLoads.forEach(load => {
        const pickup = parseAndNormalizeDate(load?.pickup?.date);

        let deliveryDateStr;
        if (Array.isArray(load.extra_delivery) && load.extra_delivery.length > 0) {
          deliveryDateStr = load.extra_delivery[load.extra_delivery.length - 1].date;
        } else {
          deliveryDateStr = load?.delivery?.date;
        }
        const delivery = parseAndNormalizeDate(deliveryDateStr);

        if (!pickup || !delivery) return;
        if (pickup > weekEnd || delivery < weekStart) return;

        const effectiveStart = pickup < weekStart ? weekStart : pickup;
        const effectiveEnd = delivery > weekEnd ? weekEnd : delivery;

        const offsetDays = Math.floor((effectiveStart - weekStart) / dayMs);
        const durationDays = Math.floor((effectiveEnd - effectiveStart) / dayMs) + 1;

        let leftPercent, widthPercent;

        if (durationDays === 1) {
          leftPercent = (offsetDays + 0.25) / 7 * 100;
          widthPercent = 0.5 / 7 * 100;
        } else {
          leftPercent = (offsetDays + 0.5) / 7 * 100;
          widthPercent = (durationDays - 1) / 7 * 100;
        }

        const barStart = offsetDays + (durationDays === 1 ? 0.25 : 0.5);
        const barEnd = offsetDays + (durationDays === 1 ? 0.75 : durationDays - 0.5);

        let layer = 0;
        while (true) {
          const conflicts = (occupiedSlots[layer] || []).some(other =>
            !(barEnd <= other.start || barStart >= other.end)
          );
          if (!conflicts) break;
          layer++;
        }

        if (!occupiedSlots[layer]) occupiedSlots[layer] = [];
        occupiedSlots[layer].push({ start: barStart, end: barEnd });

        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.left = `${leftPercent}%`;
        bar.style.width = `${widthPercent}%`;
        bar.style.top = `${layer * (barHeight + barGap)}px`;
        bar.style.height = `${barHeight}px`;

        const status = (load.status || '').toLowerCase();
        if (status === 'new') {
          bar.style.backgroundColor = '#9b59b6';
        } else if (status === 'picked up') {
          bar.style.backgroundColor = '#3498db';
        } else if (status === 'delivered') {
          bar.style.backgroundColor = '#2ecc71';
        } else {
          bar.style.backgroundColor = '#bdc3c7';
        }

        const pickupState = load.pickup?.address?.split(',').pop()?.trim() || '';
        let deliveryState = load.delivery?.address?.split(',').pop()?.trim() || '';
        if (Array.isArray(load.extra_delivery) && load.extra_delivery.length > 0) {
          const lastExtra = load.extra_delivery[load.extra_delivery.length - 1];
          if (lastExtra?.address) {
            deliveryState = lastExtra.address.split(',').pop()?.trim() || '';
          }
        }

        const price = load.price || load.total_price || '';
        const rpm = load.rpm !== undefined ? load.rpm : (load.RPM ?? '');
        const barText = `${pickupState} → ${deliveryState} | $${price} | ${rpm}`;
        bar.title = barText;
        bar.innerText = barText;

        bar.addEventListener('click', () => {
          bar.classList.toggle('selected');
          updateConsolidationButtonVisibility();
          bar.dataset.loadId = load._id?.$oid || load._id;
        });

        timeline.appendChild(bar);
      });

      const totalLayers = occupiedSlots.length;
      let timelineHeight = totalLayers > 0
        ? barHeight * totalLayers + barGap * (totalLayers - 1)
        : barHeight;

      timeline.style.height = `${timelineHeight}px`;

      row.appendChild(timeline);
      listContainer.appendChild(row);
    });
  });

  updateGlobalWeekLabel();
  renderWeekLabels();
  bindDispatcherToggles();

  // 👇 Привязка кнопки после рендера
  const consolidationBtn = document.getElementById('startConsolidationBtn');
  if (consolidationBtn && !consolidationBtn.dataset.bound) {
    consolidationBtn.dataset.bound = 'true';
    consolidationBtn.addEventListener('click', async () => {
      console.log('🔥 Нажата кнопка консолидации');

      const selectedBars = Array.from(document.querySelectorAll('.bar.selected'));
      const loadIds = [...new Set(selectedBars.map(bar => bar.dataset.loadId || bar.getAttribute('data-load-id')))].filter(Boolean);

      if (loadIds.length === 0) {
        alert('Нет выбранных грузов');
        return;
      }

      try {
        const res = await fetch('/api/consolidation/prep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ load_ids: loadIds })
        });

        const json = await res.json();
        if (json.success) {
          console.log('🟢 openConsolidationModal()', json.pickup_points, json.delivery_points);
          openConsolidationModal(json.pickup_points, json.delivery_points);
        } else {
          alert('Ошибка: ' + json.error);
        }
      } catch (err) {
        console.error(err);
        alert('Не удалось загрузить точки консолидации');
      }
    });
  }
}

function updateConsolidationButtonVisibility() {
  const anySelected = document.querySelector('.bar.selected');
  const controls = document.getElementById('consolidateControls');
  controls.style.display = anySelected ? 'block' : 'none';
}

function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseAndNormalizeDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
  let year, month, day;
  if (dateStr.includes('/')) {
    [month, day, year] = parts.map(Number);
  } else {
    [year, month, day] = parts.map(Number);
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
  const week = getWeekDates(currentBaseDate);
  const fmt = d => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
  document.getElementById('globalWeekLabel').innerText = `${fmt(week[0])} — ${fmt(week[6])}`;
}

function renderWeekLabels() {
  const week = getWeekDates(currentBaseDate);
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

function bindDispatcherToggles() {
  document.querySelectorAll('.toggle-dispatcher-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const block = btn.closest('.dispatcher-block');
      const list = block.querySelector('.driver-calendar-list');
      const dispatcherId = block.dataset.dispatcherId;

      if (list.classList.contains('collapsed')) {
        list.classList.remove('collapsed');
        list.style.maxHeight = list.scrollHeight + 'px';
        btn.innerText = '−';
        collapsedDispatchers.delete(dispatcherId);
      } else {
        list.style.maxHeight = list.scrollHeight + 'px';
        requestAnimationFrame(() => {
          list.classList.add('collapsed');
          list.style.maxHeight = '0px';
        });
        btn.innerText = '+';
        collapsedDispatchers.add(dispatcherId);
      }
    });
  });
}

function openConsolidationModal(pickups, deliveries) {
  console.log('🟢 openConsolidationModal()', pickups, deliveries); // 👈 добавить
  const pickupList = document.getElementById('pickupList');
  const deliveryList = document.getElementById('deliveryList');

  pickupList.innerHTML = '';
  pickups.forEach((point, i) => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.draggable = true;
    li.dataset.loadId = point.original_load_id;
    li.innerText = `${point.address} — ${point.scheduled_at}`;
    pickupList.appendChild(li);
  });

  deliveryList.innerHTML = '';
  deliveries.forEach((point, i) => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.draggable = true;
    li.dataset.loadId = point.original_load_id;
    li.innerText = `${point.address} — ${point.scheduled_at}`;
    deliveryList.appendChild(li);
  });

  document.getElementById('consolidationModal').classList.add('show');
  document.getElementById('consolidationBackdrop').classList.add('show');

  enableDragAndDrop('pickupList');
  enableDragAndDrop('deliveryList');
  setupPointClickOrdering();
}

function setupPointClickOrdering() {
  const allItems = document.querySelectorAll('#pickupList li, #deliveryList li');
  const selectionOrder = [];

  allItems.forEach(item => {
    item.addEventListener('click', () => {
      const existingIndex = selectionOrder.indexOf(item);
      if (existingIndex !== -1) {
        // Удалить из порядка
        selectionOrder.splice(existingIndex, 1);
        item.querySelector('.order-badge')?.remove();
      } else {
        // Добавить в порядок
        selectionOrder.push(item);
        const badge = document.createElement('span');
        badge.className = 'order-badge';
        badge.innerText = selectionOrder.length;
        item.appendChild(badge);
      }

      // Перенумеровать всё
      selectionOrder.forEach((el, idx) => {
        const badge = el.querySelector('.order-badge');
        if (badge) badge.innerText = idx + 1;
      });
    });
  });
}


function closeConsolidationModal() {
  document.getElementById('consolidationModal').classList.remove('show');
  document.getElementById('consolidationBackdrop').classList.remove('show');
}

// Универсальная drag-and-drop инициализация
function enableDragAndDrop(listId) {
  const list = document.getElementById(listId);
  let dragged;

  list.querySelectorAll('li').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragged = item;
      item.style.opacity = 0.5;
    });

    item.addEventListener('dragend', e => {
      item.style.opacity = '';
    });

    item.addEventListener('dragover', e => {
      e.preventDefault();
    });

    item.addEventListener('drop', e => {
      e.preventDefault();
      if (dragged && dragged !== item) {
        const siblings = Array.from(list.children);
        const dropIndex = siblings.indexOf(item);
        list.insertBefore(dragged, dropIndex > siblings.indexOf(dragged) ? item.nextSibling : item);
      }
    });
  });
}

//отвечает за открытые модалки
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('startConsolidationBtn')?.addEventListener('click', async () => {
    console.log('🔥 Нажата кнопка консолидации');
    const selectedBars = Array.from(document.querySelectorAll('.bar.selected'));
    const loadIds = [...new Set(selectedBars.map(bar => bar.dataset.loadId || bar.getAttribute('data-load-id')))].filter(Boolean);

    if (loadIds.length === 0) {
      alert('Нет выбранных грузов');
      return;
    }

    try {
      const res = await fetch('/api/consolidation/prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ load_ids: loadIds })
      });

      const json = await res.json();
      if (json.success) {
        openConsolidationModal(json.pickup_points, json.delivery_points);
      } else {
        alert('Ошибка: ' + json.error);
      }
    } catch (err) {
      console.error(err);
      alert('Не удалось загрузить точки консолидации');
    }
  });
});
