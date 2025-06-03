async function loadSamsaraMileage() {
  console.log("📥 Функция loadSamsaraMileage вызвана");

  const tbody = document.getElementById("mileageTableBody");
  if (!tbody) {
    console.error("❌ tbody не найден в DOM");
    return;
  }

  tbody.innerHTML = '<tr><td colspan="4">Загрузка...</td></tr>';

  try {
    const res = await fetch('/api/samsara/driver_mileage');

    if (!res.ok) {
      console.error("❌ Ошибка ответа сервера:", res.status);
      tbody.innerHTML = `<tr><td colspan="4">Ошибка: ${res.status}</td></tr>`;
      return;
    }

    const data = await res.json();
    console.log("✅ Получены данные:", data);

    if (!Array.isArray(data)) {
      tbody.innerHTML = '<tr><td colspan="4">Ошибка: формат данных</td></tr>';
      return;
    }

    tbody.innerHTML = "";

    data.forEach(item => {
      const row = `
        <tr>
          <td>${item.vehicle_id}</td>
          <td>${item.vehicle_name}</td>
          <td>${item.mileage}</td>
          <td>${item.timestamp}</td>
        </tr>
      `;
      tbody.insertAdjacentHTML("beforeend", row);
    });

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">Нет данных</td></tr>';
    }

  } catch (error) {
    console.error("💥 Ошибка при получении данных:", error);
    tbody.innerHTML = '<tr><td colspan="4">Ошибка загрузки</td></tr>';
  }
}

// Привязываем к кнопке по ID, когда DOM загрузится
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("refreshMileageBtn");
  if (btn) {
    btn.addEventListener("click", loadSamsaraMileage);
    console.log("🔗 Кнопка обновления привязана");
  } else {
    console.warn("⚠️ Кнопка с id='refreshMileageBtn' не найдена");
  }
});
