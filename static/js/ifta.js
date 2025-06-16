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
            <button class="btn btn-sm btn-primary" data-name="${item.name}">Действие</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error("❌ Ошибка загрузки IFTA интеграций:", err);
    });
}
