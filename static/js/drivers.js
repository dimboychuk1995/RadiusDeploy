document.addEventListener("DOMContentLoaded", () => {
    initDriverFilter();
    initDriverModalActions();
    initDispatcherAssignment();
    initTruckAssignment();
});

function initDriverFilter() {
    const nameInput = document.getElementById("searchNameInput");
    const unitInput = document.getElementById("searchUnitNumberInput");
    const dispatcherSelect = document.getElementById("searchDispatcherSelect");
    const table = document.getElementById("driversTable");

    if (!nameInput || !unitInput || !dispatcherSelect || !table) return;

    const filterDrivers = () => {
        const name = nameInput.value.toLowerCase();
        const unit = unitInput.value.toLowerCase();
        const dispatcher = dispatcherSelect.value.toLowerCase();

        table.querySelectorAll("tbody tr").forEach(row => {
            const rowName = row.querySelector(".driver-name")?.textContent.toLowerCase() || "";
            const rowUnit = row.querySelector(".truck-unit")?.textContent.toLowerCase() || "";
            const rowDispatcher = row.querySelector(".dispatcher-name")?.textContent.toLowerCase() || "";

            const matches = rowName.includes(name) && rowUnit.includes(unit) && rowDispatcher.includes(dispatcher);
            row.style.display = matches ? "" : "none";
        });
    };

    nameInput.addEventListener("input", filterDrivers);
    unitInput.addEventListener("input", filterDrivers);
    dispatcherSelect.addEventListener("change", filterDrivers);
}

function initDriverModalActions() {
    const modal = document.getElementById("driverModal");
    const form = document.getElementById("driverForm");
    const title = document.getElementById("driverModalTitle");

    window.openDriverModal = () => {
        form.reset();
        form.action = "/add_driver";
        title.textContent = "Добавить водителя";
        modal.classList.add("open");
    };

    window.openEditDriverModal = function (driverId) {
        const row = document.getElementById(`driver-${driverId}`);
        if (!row) return;

        form.name.value = row.querySelector(".driver-name")?.textContent.trim();
        form.license_number.value = row.querySelector(".driver-license")?.textContent.trim();
        form.contact_number.value = row.querySelector(".driver-phone")?.textContent.trim();
        form.address.value = row.querySelector(".driver-address")?.textContent.trim();
        form.email.value = row.querySelector(".driver-email")?.textContent.trim();
        form.dob.value = row.querySelector(".driver-dob")?.textContent.trim();
        form.driver_type.value = row.querySelector(".driver-type")?.textContent.trim();

        const truckId = row.getAttribute("data-truck-id");
        const dispatcherId = row.getAttribute("data-dispatcher-id");
        if (truckId) form.truck.value = truckId;
        if (dispatcherId) form.dispatcher.value = dispatcherId;

        form.action = `/edit_driver/${driverId}`;
        title.textContent = "Редактировать водителя";
        modal.classList.add("open");
    };

    window.deleteDriver = function (driverId) {
        if (confirm("Удалить водителя?")) {
            fetch(`/delete_driver/${driverId}`, { method: "POST" }).then(res => {
                if (res.ok) {
                    document.getElementById(`driver-${driverId}`)?.remove();
                } else {
                    alert("Ошибка при удалении");
                }
            });
        }
    };

    window.closeDriverModal = () => {
        modal.classList.remove("open");
    };
}

function loadDriverDetailsFragment(href) {
    fetch(href)
        .then(response => response.text())
        .then(html => {
            document.getElementById("section-drivers").style.display = "none";
            const details = document.getElementById("driver-details");
            details.innerHTML = html;
            details.style.display = "block";

            const script = document.createElement("script");
            script.src = "/static/js/driver_detail.js";
            script.onload = () => {
                if (typeof initDriverDetailActions === "function") {
                    initDriverDetailActions();
                }
            };
            document.body.appendChild(script);
        })
        .catch(error => {
            console.error("Ошибка загрузки данных водителя:", error);
        });
}

window.showDriverDetails = function(href) {
    loadDriverDetailsFragment(href);
};

function highlightExpiringDrivers() {
    const rows = document.querySelectorAll('#driversTable tbody tr');
    const today = new Date();

    rows.forEach(row => {
        const status = row.children[6]?.innerText.trim();
        if (status !== 'Active') return;

        const warnings = [];
        let rowClass = '';

        const checks = [
            { label: 'Driver License', index: 12 },
            { label: 'Medical Card', index: 15 },
            { label: 'Drug Test', index: 17 }
        ];

        for (const check of checks) {
            const dateStr = row.children[check.index]?.innerText.trim();
            if (!dateStr) continue;

            const [month, day, year] = dateStr.split('/');
            if (!month || !day || !year) continue;

            const expDate = new Date(`${year}-${month}-${day}`);
            const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                rowClass = 'table-danger';
                warnings.push(`❌ ${check.label} Expired`);
            } else if (diffDays <= 30) {
                if (rowClass !== 'table-danger') rowClass = 'table-warning';
                warnings.push(`⚠️ ${check.label} Expiring Soon`);
            }
        }

        if (rowClass) {
            row.classList.add(rowClass);
            row.setAttribute('data-toggle', 'tooltip');
            row.setAttribute('data-html', 'true');
            row.setAttribute('title', warnings.join('<br>'));
        }
    });

    $('[data-toggle="tooltip"]').tooltip({
        trigger: 'hover',
        placement: 'top',
        container: 'body',
        html: true
    });
}

function initDispatcherAssignment() {
    document.addEventListener("change", (e) => {
        if (e.target.matches(".dispatcher-select")) {
            const select = e.target;
            const driverId = select.dataset.driverId;
            const dispatcherId = select.value;
            const dispatcherName = select.options[select.selectedIndex].text;

            Swal.fire({
                title: 'Подтвердите действие',
                text: `Назначить диспетчера "${dispatcherName}" этому водителю?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Да, назначить',
                cancelButtonText: 'Отмена'
            }).then((result) => {
                if (result.isConfirmed) {
                    fetch("/api/edit_driver_dispatch/" + driverId, {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams({ dispatcher: dispatcherId })
                    })
                    .then(res => {
                        if (!res.ok) throw new Error("Ошибка при обновлении диспетчера");
                    })
                    .catch(err => {
                        Swal.fire("Ошибка", "Не удалось сохранить диспетчера", "error");
                    });
                } else {
                    // Сбросим обратно, если пользователь отменил
                    select.selectedIndex = [...select.options].findIndex(opt => opt.defaultSelected);
                }
            });
        }
    });
}

function initTruckAssignment() {
    document.addEventListener("change", (e) => {
        if (e.target.matches(".truck-select")) {
            const select = e.target;
            const driverId = select.dataset.driverId;
            const truckId = select.value;
            const truckName = select.options[select.selectedIndex].text;

            Swal.fire({
                title: 'Подтвердите действие',
                text: `Назначить трак "${truckName}" этому водителю?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Да, назначить',
                cancelButtonText: 'Отмена'
            }).then((result) => {
                if (result.isConfirmed) {
                    fetch("/api/edit_driver_truck/" + driverId, {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams({ truck: truckId })
                    })
                    .then(res => {
                        if (!res.ok) throw new Error("Ошибка при обновлении трака");
                    })
                    .catch(err => {
                        Swal.fire("Ошибка", "Не удалось сохранить трак", "error");
                    });
                } else {
                    // ⛔ Вернуть предыдущее значение
                    select.selectedIndex = [...select.options].findIndex(opt => opt.defaultSelected);
                }
            });
        }
    });
}

function initGlobalTooltips() {
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

  let activeTarget = null;

  document.body.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-tooltip]");
    if (!el) return;

    activeTarget = el;
    const message = el.getAttribute("data-tooltip");
    if (!message) return;

    const lines = message.split(" | ").map(line => `<div>${line}</div>`).join("");
    tooltip.innerHTML = lines;
    tooltip.style.opacity = 1;

    const rect = el.getBoundingClientRect();
    tooltip.style.top = `${rect.top + window.scrollY - tooltip.offsetHeight - 8}px`;
    tooltip.style.left = `${rect.left + window.scrollX + 8}px`;
  });

  document.body.addEventListener("mousemove", (e) => {
    if (activeTarget) {
      tooltip.style.top = `${e.pageY - tooltip.offsetHeight - 12}px`;
      tooltip.style.left = `${e.pageX + 12}px`;
    }
  });

  document.body.addEventListener("mouseout", (e) => {
    if (e.target.closest("[data-tooltip]")) {
      tooltip.style.opacity = 0;
      activeTarget = null;
    }
  });
}

function toggleDriverCompanySection(companyId) {
  const section = document.getElementById("section-" + companyId);
  const icon = document.getElementById("icon-" + companyId);

  if (!section || !icon) return;

  const isVisible = section.style.display === "block";
  section.style.display = isVisible ? "none" : "block";
  icon.innerHTML = isVisible ? "&#9654;" : "&#9660;";

  const openSections = JSON.parse(localStorage.getItem("openDriverSections") || "[]");

  if (!isVisible) {
    if (!openSections.includes(companyId)) openSections.push(companyId);
  } else {
    const index = openSections.indexOf(companyId);
    if (index !== -1) openSections.splice(index, 1);
  }

  localStorage.setItem("openDriverSections", JSON.stringify(openSections));
}

function restoreOpenDriverSections() {

  const openSections = JSON.parse(localStorage.getItem("openDriverSections") || "[]");

  const validCompanyIds = [];

  openSections.forEach(companyId => {
    const sectionId = "section-" + companyId;
    const iconId = "icon-" + companyId;

    const section = document.getElementById(sectionId);
    const icon = document.getElementById(iconId);

    if (section) {
      // ✅ Наблюдение за изменением display
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (mutation.attributeName === "style") {
            const newDisplay = section.style.display;
            if (newDisplay === "none") {
                console.trace();
            }
            }
        });
      });
      observer.observe(section, { attributes: true });

      // Установка состояния секции
      section.style.display = "block";
      if (icon) icon.innerHTML = "&#9660;";
      validCompanyIds.push(companyId);
    } else {
    }
  });

  localStorage.setItem("openDriverSections", JSON.stringify(validCompanyIds));
}

function filterDrivers() {
  const searchValue = document.getElementById("driverSearchInput").value.trim().toLowerCase();
  const showExpiring = document.getElementById("expiringDriversOnly").checked;

  document.querySelectorAll("tr[id^='driver-']").forEach(row => {
    const allText = row.textContent.toLowerCase();

    // Содержит ли строка нужный текст
    const matchesSearch = !searchValue || allText.includes(searchValue);

    // Имеет ли класс просроченности
    const hasExpiringClass =
      row.classList.contains("table-warning") || row.classList.contains("table-danger");

    // Финальная логика
    const visible = matchesSearch && (!showExpiring || hasExpiringClass);
    row.style.display = visible ? "" : "none";
  });

  // Если у компании не осталось видимых строк — скрываем всю секцию
  document.querySelectorAll(".company-section").forEach(section => {
    const visibleRows = section.querySelectorAll("tr[id^='driver-']:not([style*='display: none'])");
    section.style.display = visibleRows.length > 0 ? "block" : "none";
  });
}

function clearDriverSearch() {
  document.getElementById("driverSearchInput").value = "";
  document.getElementById("expiringDriversOnly").checked = false;
  filterDrivers();
}