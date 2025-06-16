function initIFTA() {
  console.log("🔧 initIFTA() called — инициализация IFTA секции");

  const tbody = document.querySelector("#ifta-table tbody");
  if (!tbody) {
    console.warn("⚠️ Таблица IFTA не найдена в DOM");
    return;
  }

  fetch("/api/ifta/integrations")
    .then(response => {
      if (!response.ok) throw new Error("Ошибка при получении данных IFTA");
      return response.json();
    })
    .then(data => {
      tbody.innerHTML = "";

      data.forEach(item => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${item.name}</td>
          <td>${item.parent_name}</td>
          <td>
            <button class="btn btn-sm btn-primary">Посчитать ifta</button>
          </td>
        `;

        const btn = row.querySelector("button");
        btn.addEventListener("click", () => openIftaModal(item));  // ← важно: item передаётся

        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error("❌ Ошибка загрузки IFTA интеграций:", err);
    });
}

function openIftaModal(item) {
  const modal = document.getElementById("calculateIftaModal");
  const content = document.getElementById("iftaModalContent");

  if (!modal || !content) return;

  modal.classList.add("show");

  content.innerHTML = `
    <p><strong>Интеграция:</strong> ${item.name}</p>
    <p><strong>Источник:</strong> ${item.parent_name}</p>
    <div id="truckListContainer" class="mt-3">
      <div class="text-muted">Загружаем список траков...</div>
    </div>
  `;

  fetch(`/api/ifta/trucks/${encodeURIComponent(item.parent_name)}/${encodeURIComponent(item.name)}`)
    .then(res => {
      if (!res.ok) throw new Error("Ошибка получения траков");
      return res.json();
    })
    .then(trucks => {
      const container = document.getElementById("truckListContainer");

      if (!Array.isArray(trucks) || trucks.length === 0) {
        container.innerHTML = `<div class="text-warning">Нет доступных траков</div>`;
        return;
      }

      const rows = trucks.map(truck => `
        <tr>
          <td>${truck.truckNumber || "—"}</td>
          <td>${truck.make || "—"}</td>
          <td>${truck.model || "—"}</td>
          <td>${truck.modelYear || "—"}</td>
          <td>${truck.vin || "—"}</td>
          <td>${truck.status || "—"}</td>
        </tr>
      `).join('');

      container.innerHTML = `
        <table class="table table-bordered table-sm">
          <thead class="table-light">
            <tr>
              <th>Truck #</th>
              <th>Make</th>
              <th>Model</th>
              <th>Year</th>
              <th>VIN</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    })
    .catch(err => {
      const container = document.getElementById("truckListContainer");
      container.innerHTML = `<div class="text-danger">❌ ${err.message}</div>`;
    });
}


function closeIftaModal() {
  const modal = document.getElementById("calculateIftaModal");
  if (modal) {
    modal.classList.remove("show");  // тот же класс, что и в open
  }
}