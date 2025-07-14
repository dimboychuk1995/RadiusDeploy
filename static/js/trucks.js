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


// === две функции для того чтобы блоки всегда были открыты ===
function toggleCompanySection(companyId) {
  const section = document.getElementById("section-" + companyId);
  const icon = document.getElementById("icon-" + companyId);

  if (!section || !icon) return;

  const isVisible = section.style.display === "block";
  section.style.display = isVisible ? "none" : "block";
  icon.innerHTML = isVisible ? "&#9654;" : "&#9660;";

  const openSections = JSON.parse(localStorage.getItem("openTruckSections") || "[]");

  if (!isVisible) {
    if (!openSections.includes(companyId)) openSections.push(companyId);
  } else {
    const index = openSections.indexOf(companyId);
    if (index !== -1) openSections.splice(index, 1);
  }

  localStorage.setItem("openTruckSections", JSON.stringify(openSections));
}

function restoreOpenTruckSections() {
  const openSections = JSON.parse(localStorage.getItem("openTruckSections") || "[]");
  const validCompanyIds = [];

  openSections.forEach(companyId => {
    const section = document.getElementById("section-" + companyId);
    const icon = document.getElementById("icon-" + companyId);

    if (section) {
      section.style.display = "block";
      if (icon) icon.innerHTML = "&#9660;";
      console.log("✅ Открыта секция:", companyId);
      validCompanyIds.push(companyId);
    } else {
      console.warn("⚠️ Секция не найдена — скорее всего, компания без грузов:", companyId);
    }
  });

  // Очистка от несуществующих ID
  localStorage.setItem("openTruckSections", JSON.stringify(validCompanyIds));
}

  // Динамический поиск 
function filterTrucks() {
  const searchValue = document.getElementById("truckSearchInput").value.trim().toLowerCase();
  const showExpiring = document.getElementById("expiringOnly").checked;

  document.querySelectorAll("tbody tr").forEach(row => {
    const unitNumber = row.children[0]?.textContent?.toLowerCase() || "";
    const description = row.children[1]?.textContent?.toLowerCase() || "";
    const vin = row.children[4]?.textContent?.toLowerCase() || "";  // если VIN в "Описание", можно изменить
    const assignedDriver = row.children[4]?.textContent?.toLowerCase() || "";
    const truckId = row.id || "";

    const allText = row.textContent.toLowerCase();

    // Проверка на VIN (последние 6 символов)
    const matchVinLast6 = vin.slice(-6).includes(searchValue);
    const matchFull = allText.includes(searchValue) || matchVinLast6;

    // Проверка на истекающий статус
    const hasExpiringClass = row.classList.contains("table-warning") || row.classList.contains("table-danger");

    const visible = (!searchValue || matchFull) && (!showExpiring || hasExpiringClass);
    row.style.display = visible ? "" : "none";
  });
}

function clearTruckSearch() {
  document.getElementById("truckSearchInput").value = "";
  document.getElementById("expiringOnly").checked = false;
  filterTrucks();
}