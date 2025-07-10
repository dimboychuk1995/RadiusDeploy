document.addEventListener("DOMContentLoaded", function () {
  initTruckModalActions();
});

// === МОДАЛКА ДОБАВЛЕНИЯ ГРУЗОВИКА ===
function initTruckModalActions() {
  const truckForm = document.getElementById("truckForm");
  const truckModalTitle = document.getElementById("truckModalTitle");

  window.deleteTruck = function (truckId) {
    if (confirm("Вы уверены, что хотите удалить этот грузовик?")) {
      fetch(`/delete_truck/${truckId}`, { method: "POST" })
        .then(response => {
          if (response.ok) {
            document.getElementById(`truck-${truckId}`)?.remove();
          } else {
            alert("Ошибка при удалении грузовика.");
          }
        });
    }
  };

  document.getElementById("addTruckBtn")?.addEventListener("click", () => {
    if (truckForm && truckModalTitle) {
      truckForm.reset();
      truckForm.action = "/add_truck";
      truckModalTitle.textContent = "Добавить грузовик";
      openTruckModal();
    }
  });

  document.getElementById("assignmentForm")?.addEventListener("submit", function (e) {
    e.preventDefault();

    const formData = new FormData(this);

    fetch("/api/driver/assign", {
      method: "POST",
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          closeUnitAssignment();
          location.reload();
        } else {
          alert("Ошибка при сохранении назначения");
        }
      })
      .catch(err => {
        console.error("Ошибка при назначении:", err);
        alert("Ошибка сети");
      });
  });
}

// === ОТКРЫТЬ/ЗАКРЫТЬ truckModal ===
function openTruckModal() {
  document.getElementById("truckModal")?.classList.add("show");
  document.querySelector("#truckModal + .custom-offcanvas-backdrop")?.classList.add("show");

  const unitTypeSelect = document.getElementById("unitTypeSelect");
  const subtypeSelect = document.getElementById("subtypeSelect");

  const subtypeDataDiv = document.getElementById("subtypes-data");
  const truckSubtypes = JSON.parse(subtypeDataDiv.dataset.truckSubtypes || "[]");
  const trailerSubtypes = JSON.parse(subtypeDataDiv.dataset.trailerSubtypes || "[]");

  if (unitTypeSelect && subtypeSelect) {
    const updateSubtypeOptions = () => {
      const selectedType = unitTypeSelect.value.trim();
      let options = [];

      if (selectedType === "Truck") {
        options = truckSubtypes;
      } else if (selectedType === "Trailer") {
        options = trailerSubtypes;
      }

      subtypeSelect.innerHTML = "";

      options.forEach(subtype => {
        const opt = document.createElement("option");
        opt.value = subtype;
        opt.textContent = subtype;
        subtypeSelect.appendChild(opt);
      });
    };

    unitTypeSelect.removeEventListener("change", updateSubtypeOptions);
    unitTypeSelect.addEventListener("change", updateSubtypeOptions);
    updateSubtypeOptions();
  }

  initTruckParser?.();
}

function closeTruckModal() {
  document.getElementById("truckModal")?.classList.remove("show");
  document.querySelector("#truckModal + .custom-offcanvas-backdrop")?.classList.remove("show");
}

// === Показать детали юнита ===
function showUnitDetails(truckId) {
  fetch(`/fragment/unit_details/${truckId}`)
    .then(response => response.text())
    .then(html => {
      const section = document.getElementById("section-trucks");
      const details = document.getElementById("unit_details_fragment");

      if (section && details) {
        section.style.display = "none";
        details.innerHTML = html;
        details.style.display = "block";
      }
    })
    .catch(err => {
      console.error("Ошибка загрузки деталей юнита:", err);
      alert("Не удалось загрузить детали.");
    });
}

// === МОДАЛКА НАЗНАЧЕНИЯ ЮНИТА ===
function openUnitAssignment(truckId, driverId = "", companyId = "") {
  document.getElementById("assignmentTruckId").value = truckId;

  const driverSelect = document.getElementById("assignmentDriver");
  const companySelect = document.getElementById("assignmentCompany");

  if (driverSelect) {
    Array.from(driverSelect.options).forEach(option => {
      option.selected = option.value === driverId;
    });
  }

  if (companySelect) {
    Array.from(companySelect.options).forEach(option => {
      option.selected = option.value === companyId;
    });
  }

  document.getElementById("unitAssignment")?.classList.add("show");
  document.querySelector("#unitAssignment + .custom-offcanvas-backdrop")?.classList.add("show");
}

function closeUnitAssignment() {
  document.getElementById("unitAssignment")?.classList.remove("show");
  document.querySelector("#unitAssignment + .custom-offcanvas-backdrop")?.classList.remove("show");
}

function initTruckTooltips() {
  if (document.querySelector(".truck-tooltip")) return;

  const style = document.createElement("style");
  style.innerHTML = `
    .truck-tooltip {
      position: absolute;
      background-color: rgba(50, 50, 50, 0.95);
      color: #fff;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.4;
      max-width: 320px;
      z-index: 9999;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
      white-space: pre-line;
    }
  `;
  document.head.appendChild(style);

  const tooltip = document.createElement("div");
  tooltip.className = "truck-tooltip";
  document.body.appendChild(tooltip);

  const elements = document.querySelectorAll("[data-tooltip]");
  console.log(`🔍 Найдено ${elements.length} элементов с data-tooltip`);

  elements.forEach(el => {
    el.addEventListener("mouseenter", () => {
      const message = el.getAttribute("data-tooltip");
      if (!message) return;

      // Разбиваем по " | " и отображаем каждую строку отдельно
      const lines = message.split(" | ").map(line => `<div>${line}</div>`).join("");
      tooltip.innerHTML = lines;
      tooltip.style.opacity = 1;

      const rect = el.getBoundingClientRect();
      tooltip.style.top = `${rect.top + window.scrollY - tooltip.offsetHeight - 8}px`;
      tooltip.style.left = `${rect.left + window.scrollX + 8}px`;
    });

    el.addEventListener("mousemove", (e) => {
      tooltip.style.top = `${e.pageY - tooltip.offsetHeight - 12}px`;
      tooltip.style.left = `${e.pageX + 12}px`;
    });

    el.addEventListener("mouseleave", () => {
      tooltip.style.opacity = 0;
    });
  });
}