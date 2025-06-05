function initUnitsMileage() {
  const input = document.getElementById("dateRangePicker");
  if (!input) return;

  const lastWeekStart = moment().subtract(1, 'weeks').startOf('isoWeek');
  const lastWeekEnd = moment().subtract(1, 'weeks').endOf('isoWeek');

  $(input).daterangepicker({
    startDate: lastWeekStart,
    endDate: lastWeekEnd,
    showDropdowns: true,
    autoApply: false,
    linkedCalendars: false,
    alwaysShowCalendars: true,
    opens: 'center',
    showCustomRangeLabel: true,
    locale: {
      format: 'MM / DD / YYYY',
      applyLabel: 'APPLY',
      cancelLabel: 'CANCEL',
      daysOfWeek: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
      monthNames: moment.months(),
      firstDay: 1
    },
    ranges: {
      'Last Week': [lastWeekStart, lastWeekEnd],
      'Reset': [moment(), moment()]
    }
  });

  // ✅ Только нажатие "Apply" — основной обработчик
  $(input).on('apply.daterangepicker', function(ev, picker) {
    const startIso = picker.startDate.toISOString();
    const endIso = picker.endDate.toISOString();

    // Если пользователь выбрал Reset, сбросим таблицу
    const isReset = picker.startDate.isSame(moment(), 'day') && picker.endDate.isSame(moment(), 'day');
    if (isReset) {
      document.getElementById("mileageResultsBody").innerHTML = "";
      return;
    }

    fetchMileage(startIso, endIso);
  });
}


async function fetchMileage(startIso, endIso) {
  const overlay = document.getElementById("mileageOverlay");
  const tbody = document.getElementById("mileageResultsBody");
  tbody.innerHTML = "";
  overlay.style.display = "flex"; // Показать затемнение

  try {
    const vehicleResponse = await fetch("/api/samsara/vehicles");
    const vehicles = await vehicleResponse.json();

    for (const vehicle of vehicles) {
      const url = `/api/samsara/vehicle_mileage?vehicle_id=${vehicle.id}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`;

      let data = null;
      try {
        const response = await fetch(url);

        if (response.status === 204 || !response.ok) continue;

        data = await response.json();
        if (!data || typeof data.total_miles !== "number") continue;
      } catch (e) {
        continue;
      }

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${vehicle.name || vehicle.id}</td>
        <td>${data.start_miles?.toFixed(2) || '-'}</td>
        <td>${data.end_miles?.toFixed(2) || '-'}</td>
        <td>${data.total_miles?.toFixed(2) || '-'}</td>
      `;
      tbody.appendChild(row);
    }
  } catch (error) {
    console.error("Ошибка при получении пробега:", error);
  } finally {
    overlay.style.display = "none"; // Скрыть затемнение
  }
}
