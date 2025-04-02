document.addEventListener("DOMContentLoaded", function () {
  initClickableRows();
  initDriverFilter();
  initEditMode();
  initTabs();
  initDriverModalActions();
});

// Кликабельные строки
function initClickableRows() {
  const rows = document.querySelectorAll(".clickable-row");
  rows.forEach(row => {
    row.addEventListener("click", () => {
      const href = row.getAttribute("data-href");
      if (href) window.location.href = href;
    });
  });
}

// Фильтрация водителей
function initDriverFilter() {
  const searchNameInput = document.getElementById("searchNameInput");
  const searchUnitInput = document.getElementById("searchUnitNumberInput");
  const searchDispatcherSelect = document.getElementById("searchDispatcherSelect");
  const driversTable = document.getElementById("driversTable");

  function filterDrivers() {
    const nameFilter = searchNameInput.value.toLowerCase();
    const unitFilter = searchUnitInput.value.toLowerCase();
    const dispatcherFilter = searchDispatcherSelect.value.toLowerCase();
    const rows = driversTable.querySelectorAll("tbody tr");

    rows.forEach(row => {
      const name = row.querySelector(".driver-name")?.textContent.toLowerCase() || "";
      const unit = row.querySelector(".truck-unit")?.textContent.toLowerCase() || "";
      const dispatcher = row.querySelector(".dispatcher-name")?.textContent.toLowerCase() || "";

      const matchName = name.includes(nameFilter);
      const matchUnit = unit.includes(unitFilter);
      const matchDispatcher = dispatcher.includes(dispatcherFilter);

      row.style.display = (matchName && matchUnit && matchDispatcher) ? "" : "none";
    });
  }

  searchNameInput?.addEventListener("input", filterDrivers);
  searchUnitInput?.addEventListener("input", filterDrivers);
  searchDispatcherSelect?.addEventListener("change", filterDrivers);
}

// Режим редактирования на странице деталей водителя
function initEditMode() {
  const editBtn = document.getElementById("editBtn");
  const saveBtn = document.getElementById("saveBtn");
  const form = document.getElementById("editForm");

  if (editBtn && saveBtn && form) {
    editBtn.addEventListener("click", () => {
      form.querySelectorAll("input, select").forEach(field => {
        field.removeAttribute("disabled");
      });
      editBtn.style.display = "none";
      saveBtn.style.display = "inline-block";
    });
  }
}

// Вкладки "Инфо / Грузы"
function initTabs() {
  const btnInfo = document.getElementById("btn-info");
  const btnLoads = document.getElementById("btn-loads");
  const infoSection = document.getElementById("info-section");
  const loadsSection = document.getElementById("loads-section");

  if (btnInfo && btnLoads && infoSection && loadsSection) {
    btnInfo.addEventListener("click", () => {
      infoSection.style.display = "block";
      loadsSection.style.display = "none";
    });

    btnLoads.addEventListener("click", () => {
      infoSection.style.display = "none";
      loadsSection.style.display = "block";
    });
  }
}

// Модальное окно добавления/редактирования водителей
function initDriverModalActions() {
  const driverModal = document.getElementById("driverModal");
  const addDriverBtn = document.getElementById("addDriverBtn");
  const driverSpan = document.getElementById("driverCloseBtn");
  const driverForm = document.getElementById("driverForm");
  const driverModalTitle = document.getElementById("driverModalTitle");
  const driverSaveButton = document.getElementById("driverSaveButton");

  window.openEditDriverModal = function (driverId) {
    const row = document.getElementById(`driver-${driverId}`);
    if (!row) return;

    const name = row.querySelector(".driver-name")?.textContent.trim();
    const license = row.querySelector(".driver-license")?.textContent.trim();
    const phone = row.querySelector(".driver-phone")?.textContent.trim();

    driverForm.name.value = name;
    driverForm.license_number.value = license;
    driverForm.contact_number.value = phone;

    driverForm.action = `/edit_driver/${driverId}`;
    driverModalTitle.textContent = "Редактировать водителя";
    driverModal.style.display = "block";
  };

  window.deleteDriver = function (driverId) {
    if (confirm("Вы уверены, что хотите удалить этого водителя?")) {
      fetch(`/delete_driver/${driverId}`, {
        method: "POST",
      }).then(response => {
        if (response.ok) {
          document.getElementById(`driver-${driverId}`).remove();
        } else {
          alert("Ошибка при удалении водителя.");
        }
      });
    }
  };

  if (addDriverBtn && driverModal) {
    addDriverBtn.addEventListener("click", () => {
      driverForm.reset();
      driverForm.action = "/drivers";
      driverModalTitle.textContent = "Добавить водителя";
      driverModal.style.display = "block";
    });
  }

  if (driverSpan) {
    driverSpan.addEventListener("click", () => {
      driverModal.style.display = "none";
    });
  }

  window.addEventListener("click", (event) => {
    if (event.target === driverModal) {
      driverModal.style.display = "none";
    }
  });
}