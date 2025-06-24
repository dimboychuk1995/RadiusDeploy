// ========== Глобальные переменные ==========
let currentBaseDate = new Date();
const collapsedDispatchers = new Set();

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

const consolidationColorMap = {};
const consolidationColors = [
  '#e74c3c', '#8e44ad', '#3498db', '#16a085', '#f39c12', '#d35400', '#2ecc71',
  '#1abc9c', '#c0392b', '#7f8c8d', '#e67e22', '#27ae60', '#2980b9', '#f1c40f'
];
let colorIndex = 0;

function getColorForConsolidation(consolidateId) {
  if (!consolidateId) return null;
  if (!consolidationColorMap[consolidateId]) {
    consolidationColorMap[consolidateId] = consolidationColors[colorIndex % consolidationColors.length];
    colorIndex++;
  }
  return consolidationColorMap[consolidateId];
}

// ========== Инициализация календарей диспетчеров ==========
function initDispatcherCalendars() {
  const blocks = document.querySelectorAll('.dispatcher-block');
  blocks.forEach(block => {
    const drivers = JSON.parse(block.dataset.drivers || '[]');
    const loads = JSON.parse(block.dataset.loads || '[]');
    const breaks = JSON.parse(block.dataset.breaks || '[]');
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
      row.className = 'driver-row d-flex justify-content-between align-items-center';

      const driverId = normalizeId(driver._id);
      const driverLoads = loads.filter(load => normalizeId(load?.assigned_driver) === driverId);
      const driverBreaks = breaks.filter(brk => String(brk.driver_id) === String(driver._id));

      const info = document.createElement('div');
      info.className = 'driver-info text-nowrap pe-3';
      info.style.width = '220px';

      const label = document.createElement('span');
      label.className = 'text-center w-100';
      label.innerText = `${driver.truck?.unit_number || ''} — ${driver.name}`;

      const breakBtn = document.createElement('button');
      breakBtn.className = 'btn btn-sm btn-outline-secondary ms-2 driver-break-btn';
      breakBtn.title = 'Break';
      breakBtn.innerText = 'Break';
      breakBtn.addEventListener('click', () => {
        openDriverBreakModal(driverId);
      });

      const infoInner = document.createElement('div');
      infoInner.className = 'd-flex align-items-center justify-content-between';
      infoInner.appendChild(label);
      infoInner.appendChild(breakBtn);
      info.appendChild(infoInner);

      const timelineWrapper = document.createElement('div');
      timelineWrapper.className = 'd-flex flex-column align-items-end w-100 ms-3';

      let weeklyGross = 0;
      driverLoads.forEach(load => {
        const pickup = parseAndNormalizeDate(load?.pickup?.date);
        let deliveryDateStr;
        if (Array.isArray(load.extra_delivery) && load.extra_delivery.length > 0) {
          deliveryDateStr = load.extra_delivery[load.extra_delivery.length - 1].date;
        } else {
          deliveryDateStr = load?.delivery?.date;
        }
        const delivery = parseAndNormalizeDate(deliveryDateStr);

        if (!pickup || !delivery || pickup > weekEnd || delivery < weekStart) return;

        const price = load.price || load.total_price || 0;
        weeklyGross += typeof price === 'number' ? price : parseFloat(price) || 0;
      });

      const grossDiv = document.createElement('div');
      grossDiv.className = 'text-muted small mb-1';
      grossDiv.innerHTML = `<i class="bi bi-cash-stack me-1"></i>$${weeklyGross.toLocaleString()}`;

      const timeline = document.createElement('div');
      timeline.className = 'timeline w-100';

      const occupiedSlots = [];
      const barHeight = 20;
      const barGap = 4;

      // === Сначала рисуем брейки ===
      driverBreaks.forEach(brk => {
        console.log('📆 BREAK', brk.reason, brk.start_date, brk.end_date); // <-- ВСТАВЬ СЮДА
        const start = parseAndNormalizeDate(brk.start_date);
        const end = parseAndNormalizeDate(brk.end_date);
        if (!start || !end || start > weekEnd || end < weekStart) return;

        const effectiveStart = start < weekStart ? weekStart : start;
        const effectiveEnd = end > weekEnd ? weekEnd : end;
        const offsetDays = Math.floor((effectiveStart - weekStart) / dayMs);
        const durationDays = Math.floor((effectiveEnd - effectiveStart) / dayMs) + 1;

        const leftPercent = (offsetDays + 0.5) / 7 * 100;
        const widthPercent = durationDays / 7 * 100;


        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.left = `${leftPercent}%`;
        bar.style.width = `${widthPercent}%`;
        bar.style.top = `0px`;
        bar.style.height = `${barHeight}px`;
        bar.style.backgroundColor = '#f39c12';
        bar.innerText = brk.reason;
        bar.title = brk.reason;
        bar.style.opacity = '0.5';

        timeline.appendChild(bar);
      });

      // === Потом рисуем грузы поверх ===
      driverLoads.forEach(load => {
        const pickup = parseAndNormalizeDate(load?.pickup?.date);
        let deliveryDateStr;
        if (Array.isArray(load.extra_delivery) && load.extra_delivery.length > 0) {
          deliveryDateStr = load.extra_delivery[load.extra_delivery.length - 1].date;
        } else {
          deliveryDateStr = load?.delivery?.date;
        }
        const delivery = parseAndNormalizeDate(deliveryDateStr);

        if (!pickup || !delivery || pickup > weekEnd || delivery < weekStart) return;

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
        while ((occupiedSlots[layer] || []).some(other => !(barEnd <= other.start || barStart >= other.end))) {
          layer++;
        }
        occupiedSlots[layer] = [...(occupiedSlots[layer] || []), { start: barStart, end: barEnd }];

        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.left = `${leftPercent}%`;
        bar.style.width = `${widthPercent}%`;
        bar.style.top = `${layer * (barHeight + barGap)}px`;
        bar.style.height = `${barHeight}px`;

        let barColor;
        const status = (load.status || '').toLowerCase();
        if (load.consolidated) {
          const consolidateId = normalizeId(load.consolidateId);
          barColor = getColorForConsolidation(consolidateId) || '#bdc3c7';
        } else {
          barColor = status === 'new' ? '#9b59b6'
                    : status === 'picked up' ? '#3498db'
                    : status === 'delivered' ? '#2ecc71'
                    : '#bdc3c7';
        }
        bar.style.backgroundColor = barColor;

        const pickupState = load.pickup?.address?.split(',').pop()?.trim() || '';
        let deliveryState = load.delivery?.address?.split(',').pop()?.trim() || '';
        if (Array.isArray(load.extra_delivery) && load.extra_delivery.length > 0) {
          deliveryState = load.extra_delivery[load.extra_delivery.length - 1]?.address?.split(',').pop()?.trim() || deliveryState;
        }

        const price = load.price || load.total_price || '';
        const rpm = load.rpm !== undefined ? load.rpm : (load.RPM ?? '');
        bar.innerText = `${pickupState} → ${deliveryState} | $${price} | ${rpm}`;
        bar.title = bar.innerText;
        bar.dataset.loadId = load._id?.$oid || load._id;

        bar.addEventListener('click', () => {
          bar.classList.toggle('selected');
          updateConsolidationButtonVisibility();
        });

        timeline.appendChild(bar);
      });

      timeline.style.height = `${occupiedSlots.length ? (barHeight + barGap) * occupiedSlots.length - barGap : barHeight}px`;

      timelineWrapper.appendChild(grossDiv);
      timelineWrapper.appendChild(timeline);

      row.appendChild(info);
      row.appendChild(timelineWrapper);
      listContainer.appendChild(row);
    });
  });

  updateGlobalWeekLabel();
  renderWeekLabels();
  bindDispatcherToggles();

  const consolidationBtn = document.getElementById('startConsolidationBtn');
  if (consolidationBtn && !consolidationBtn.dataset.bound) {
    consolidationBtn.dataset.bound = 'true';
    consolidationBtn.addEventListener('click', async () => {
      const selectedBars = Array.from(document.querySelectorAll('.bar.selected'));
      const loadIds = [...new Set(selectedBars.map(bar => bar.dataset.loadId))].filter(Boolean);
      if (!loadIds.length) return alert('Нет выбранных грузов');

      const res = await fetch('/api/consolidation/prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ load_ids: loadIds })
      });
      const json = await res.json();
      if (json.success) openConsolidationModal(json.pickup_points, json.delivery_points);
      else alert(json.error);
    });
  }
}

function openConsolidationModal(pickups, deliveries) {
  const pickupList = document.getElementById('pickupList');
  const deliveryList = document.getElementById('deliveryList');
  pickupList.innerHTML = '';
  deliveryList.innerHTML = '';

  pickups.forEach(point => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.draggable = true;
    li.dataset.loadId = point.load_id;
    li.innerText = `${point.address} — ${point.scheduled_at}`;
    pickupList.appendChild(li);
  });

  deliveries.forEach(point => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.draggable = true;
    li.dataset.loadId = point.load_id;
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
  const saveBtn = document.getElementById('saveConsolidationBtn');
  saveBtn.style.display = 'none';

  allItems.forEach(item => {
    item.addEventListener('click', () => {
      const existingIndex = selectionOrder.indexOf(item);
      if (existingIndex !== -1) {
        selectionOrder.splice(existingIndex, 1);
        item.querySelector('.order-badge')?.remove();
      } else {
        selectionOrder.push(item);
        const badge = document.createElement('span');
        badge.className = 'order-badge';
        badge.innerText = selectionOrder.length;
        item.appendChild(badge);
      }

      selectionOrder.forEach((el, idx) => {
        const badge = el.querySelector('.order-badge');
        if (badge) badge.innerText = idx + 1;
      });

      saveBtn.style.display = selectionOrder.length === allItems.length ? 'inline-block' : 'none';
    });
  });

  saveBtn.addEventListener('click', () => {
    const result = selectionOrder.map(li => ({
      address: li.innerText.replace(/\s+—\s+\d{2}\/\d{2}\/\d{4}$/, '').trim(),
      scheduled_at: li.innerText.match(/\d{2}\/\d{2}\/\d{4}$/)?.[0],
      load_id: li.dataset.loadId
    }));
    const loadIds = [...new Set(result.map(p => p.load_id))];
    submitConsolidationOrder(result, loadIds);
  });
}

async function submitConsolidationOrder(orderedPoints) {
  const cleanedPoints = orderedPoints
    .map(p => ({
      address: p.address?.trim(),
      scheduled_at: p.scheduled_at || p.date || '',
      load_id: p.load_id || null
    }))
    .filter(p => p.load_id && p.address);

  const loadIds = [...new Set(cleanedPoints.map(p => p.load_id))];

  if (!loadIds.length) {
    alert("❌ Нет валидных грузов для консолидации.");
    return;
  }

  try {
    const res = await fetch('/api/consolidation/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        load_ids: loadIds,
        route_points: cleanedPoints
      })
    });

    const json = await res.json();
    if (json.success) {
      closeConsolidationModal();
      alert(`✅ Грузы успешно консолидированы\n🚚 Miles: ${json.miles}\n📊 RPM: ${json.rpm}`);
    } else {
      alert("Ошибка сервера: " + json.error);
    }
  } catch (err) {
    console.error(err);
    alert("❌ Ошибка отправки запроса на сервер.");
  }
}

function closeConsolidationModal() {
  document.getElementById('consolidationModal').classList.remove('show');
  document.getElementById('consolidationBackdrop').classList.remove('show');
}

function enableDragAndDrop(listId) {
  const list = document.getElementById(listId);
  let dragged;
  list.querySelectorAll('li').forEach(item => {
    item.addEventListener('dragstart', () => {
      dragged = item;
      item.style.opacity = 0.5;
    });
    item.addEventListener('dragend', () => {
      item.style.opacity = '';
    });
    item.addEventListener('dragover', e => e.preventDefault());
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

function updateConsolidationButtonVisibility() {
  const anySelected = document.querySelector('.bar.selected');
  document.getElementById('consolidateControls').style.display = anySelected ? 'block' : 'none';
}

function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseAndNormalizeDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date)) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}


function normalizeId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value && value.$oid) return value.$oid;
  return String(value);
}

function getWeekDates(baseDate) {
  const date = new Date(baseDate);
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
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
    div.innerText = `${dayNames[date.getDay()]} ${date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}`;
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


function openDriverBreakModal(driverId) {
  window.currentBreakDriverId = driverId;
  document.getElementById('driverBreakModal').classList.add('show');
  document.getElementById('driverBreakBackdrop').classList.add('show');
  initDriverBreakDateRange();
  initDriverBreakFormListener();
}

function closeDriverBreakModal() {
  document.getElementById('driverBreakModal').classList.remove('show');
  document.getElementById('driverBreakBackdrop').classList.remove('show');
}


function initDriverBreakFormListener() {
  const form = document.getElementById('driverBreakForm');
  if (!form || form.dataset.bound === 'true') return;

  form.dataset.bound = 'true';

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const reason = document.getElementById('breakReason').value;
    const range = $('#breakDateRange').data('daterangepicker');
    const startDate = range?.startDate?.toISOString();
    const endDate = range?.endDate?.toISOString();
    const driverId = window.currentBreakDriverId;

    if (!driverId || !reason || !startDate || !endDate) {
      return alert("Все поля обязательны");
    }

    const res = await fetch('/api/drivers/break', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driver_id: driverId,
        reason,
        start_date: startDate,
        end_date: endDate
      })
    });

    const json = await res.json();
    if (json.success) {
      alert("Брейк успешно сохранён");
      closeDriverBreakModal();
    } else {
      alert("Ошибка: " + (json.error || "Не удалось сохранить"));
    }
  });
}


function initDriverBreakDateRange() {
  const input = document.getElementById("breakDateRange");
  if (!input) return;

  const today = moment().startOf('day');
  const todayPlus3 = moment().add(2, 'days').endOf('day');
  const todayPlus7 = moment().add(6, 'days').endOf('day');
  const nextWeekStart = moment().add(1, 'weeks').startOf('isoWeek');
  const nextWeekEnd = moment().add(1, 'weeks').endOf('isoWeek');

  $(input).daterangepicker({
    startDate: today,
    endDate: todayPlus3,
    showDropdowns: true,
    autoApply: true, // 👈 Убирает кнопку "Apply"
    linkedCalendars: false,
    alwaysShowCalendars: true,
    opens: 'center',
    showCustomRangeLabel: true,
    locale: {
      format: 'MM / DD / YYYY',
      cancelLabel: 'CANCEL',
      daysOfWeek: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
      monthNames: moment.months(),
      firstDay: 1
    },
    ranges: {
      '3 дня от сегодня': [today, todayPlus3],
      'Неделя от сегодня': [today, todayPlus7],
      'Вся следующая неделя': [nextWeekStart, nextWeekEnd],
      'Сброс': [moment(), moment()]
    }
  });

  $(input).on('apply.daterangepicker', function(ev, picker) {
    const startIso = picker.startDate.toISOString();
    const endIso = picker.endDate.toISOString();
    const isReset = picker.startDate.isSame(moment(), 'day') && picker.endDate.isSame(moment(), 'day');

    if (isReset) {
      input.value = '';
      return;
    }

    console.log(`📅 Break range selected: ${startIso} to ${endIso}`);
  });
}
