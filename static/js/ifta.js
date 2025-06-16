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
            <button class="btn btn-sm btn-primary" data-name="${item.name}">Посчитать ifta</button>
          </td>
        `;

        const btn = row.querySelector("button");
        btn.addEventListener("click", () => {
          openIftaModal();
          // Тут можно пробросить item.name / item.api_key в модалку
        });

        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error("❌ Ошибка загрузки IFTA интеграций:", err);
    });
}

function openIftaModal() {
  const modal = document.getElementById("calculateIftaModal");
  if (modal) {
    modal.classList.add("show");  // или "active", "open" — в зависимости от твоих CSS
  }
}

function closeIftaModal() {
  const modal = document.getElementById("calculateIftaModal");
  if (modal) {
    modal.classList.remove("show");  // тот же класс, что и в open
  }
}