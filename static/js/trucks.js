document.addEventListener("DOMContentLoaded", function () {
  initTruckModalActions();
  initSamsaraLinkingEvents(); // ✅ инициализация событий Samsara-секции
});

// ==============================
// === МОДАЛКА ДОБАВЛЕНИЯ ТРАКА ===
// ==============================
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
            Swal.fire("Ошибка", "Ошибка при удалении грузовика.", "error");
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
          Swal.fire("Ошибка", "Ошибка при сохранении назначения", "error");
        }
      })
      .catch(err => {
        Swal.fire("Ошибка", "Ошибка при назначении: " + err, "error");
      });
  });
}

// ==============================
// === ОТКРЫТЬ/ЗАКРЫТЬ truckModal ===
// ==============================
function openTruckModal() {
  document.getElementById("truckModal")?.classList.add("show");
  document.querySelector("#truckModal + .custom-offcanvas-backdrop")?.classList.add("show");

  const unitTypeSelect = document.getElementById("unitTypeSelect");
  const subtypeSelect = document.getElementById("subtypeSelect");

  const subtypeDataDiv = document.getElementById("subtypes-data");
  const truckSubtypes = JSON.parse(subtypeDataDiv?.dataset?.truckSubtypes || "[]");
  const trailerSubtypes = JSON.parse(subtypeDataDiv?.dataset?.trailerSubtypes || "[]");

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

  try { typeof initTruckParser === "function" && initTruckParser(); } catch (_) {}
}

function closeTruckModal() {
  document.getElementById("truckModal")?.classList.remove("show");
  document.querySelector("#truckModal + .custom-offcanvas-backdrop")?.classList.remove("show");
}

// ==============================
// === Показать детали юнита ===
// ==============================
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
      Swal.fire("Ошибка", "Ошибка загрузки деталей юнита: " + err, "error");
    });
}

// ===================================
// === МОДАЛКА НАЗНАЧЕНИЯ ЮНИТА (+Samsara) ===
// ===================================
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

  initSamsaraSection(truckId);
}

function closeUnitAssignment() {
  document.getElementById("unitAssignment")?.classList.remove("show");
  document.querySelector("#unitAssignment + .custom-offcanvas-backdrop")?.classList.remove("show");
}

// ===================================
// === две функции для того чтобы блоки всегда были открыты ===
// ===================================
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
      validCompanyIds.push(companyId);
    } else {
      Swal.fire("Внимание", "Секция не найдена — скорее всего, компания без грузов: " + companyId, "warning");
    }
  });

  localStorage.setItem("openTruckSections", JSON.stringify(validCompanyIds));
}

// ==============================
// === Динамический поиск траков ===
// ==============================
function filterTrucks() {
  const searchValue = document.getElementById("truckSearchInput").value.trim().toLowerCase();
  const showExpiring = document.getElementById("expiringOnly").checked;

  document.querySelectorAll("tbody tr").forEach(row => {
    const unitNumber = row.children[0]?.textContent?.toLowerCase() || "";
    const description = row.children[1]?.textContent?.toLowerCase() || "";
    const vin = row.children[4]?.textContent?.toLowerCase() || "";
    const assignedDriver = row.children[4]?.textContent?.toLowerCase() || "";
    const truckId = row.id || "";

    const allText = row.textContent.toLowerCase();
    const matchVinLast6 = vin.slice(-6).includes(searchValue);
    const matchFull = allText.includes(searchValue) || matchVinLast6;

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

// =====================================================
// === SAMSARA LINKING — логика для модалки назначения ===
// =====================================================
let __samsaraVehiclesCache = null;

let $SAMSARA = {
  badge: null,
  currentLinkWrap: null,
  currentLinkText: null,
  btnUnlink: null,
  searchInput: null,
  btnSearch: null,
  listBody: null,
  countInfo: null,
  btnPrev: null,
  btnNext: null
};

let SAMSARA_STATE = {
  all: [],
  filtered: [],
  page: 0,
  pageSize: 50,
  currentUnitId: null
};

function initSamsaraLinkingEvents() {}

async function initSamsaraSection(truckId) {
  SAMSARA_STATE.currentUnitId = truckId;

  $SAMSARA.badge           = document.getElementById("samsaraLinkedBadge");
  $SAMSARA.currentLinkWrap = document.getElementById("samsaraCurrentLink");
  $SAMSARA.currentLinkText = document.getElementById("samsaraCurrentLinkText");
  $SAMSARA.btnUnlink       = document.getElementById("btnSamsaraUnlink");
  $SAMSARA.searchInput     = document.getElementById("samsaraSearch");
  $SAMSARA.btnSearch       = document.getElementById("samsaraSearch");
  $SAMSARA.listBody        = document.getElementById("samsaraList");
  $SAMSARA.countInfo       = document.getElementById("samsaraCountInfo");
  $SAMSARA.btnPrev         = document.getElementById("btnSamsaraPrev");
  $SAMSARA.btnNext         = document.getElementById("btnSamsaraNext");

  await renderLinkedStateFromServer(truckId);

  if (!Array.isArray(__samsaraVehiclesCache)) {
    __samsaraVehiclesCache = await loadSamsaraVehicles();
  }
  SAMSARA_STATE.all = Array.isArray(__samsaraVehiclesCache) ? __samsaraVehiclesCache.slice() : [];
  SAMSARA_STATE.filtered = SAMSARA_STATE.all.slice();

  bindSamsaraSearchAndPaging();
  renderSamsaraPage(0);
}

async function loadSamsaraVehicles() {
  try {
    const res = await fetch(`/api/samsara/vehicles`);
    if (!res.ok) {
      Swal.fire("Ошибка", "Не удалось загрузить список машин Samsara: " + await res.text(), "error");
      return [];
    }
    return await res.json();
  } catch (e) {
    Swal.fire("Ошибка", "Ошибка при получении списка машин Samsara: " + e, "error");
    return [];
  }
}

async function renderLinkedStateFromServer(truckId) {
  const url = `/api/units/${truckId}`;

  try {
    const res = await fetch(url);
    if (res.ok) {
      const unit = await res.json();
      renderLinkedState(unit?.samsara_vehicle_id || null);
      return;
    }
  } catch (_) {}

  renderLinkedState(null);
}

function renderLinkedState(samsaraVehicleId) {
  if (!$SAMSARA.badge) return;

  if (samsaraVehicleId) {
    $SAMSARA.badge.textContent = "Linked";
    $SAMSARA.badge.className = "badge badge-success ml-2";
    $SAMSARA.badge.style.display = "";
    if ($SAMSARA.currentLinkWrap) $SAMSARA.currentLinkWrap.style.display = "";
    if ($SAMSARA.currentLinkText) $SAMSARA.currentLinkText.textContent = String(samsaraVehicleId);
    if ($SAMSARA.btnUnlink) {
      $SAMSARA.btnUnlink.onclick = onSamsaraUnlink;
      $SAMSARA.btnUnlink.disabled = false;
    }
  } else {
    $SAMSARA.badge.textContent = "Not linked";
    $SAMSARA.badge.className = "badge badge-secondary ml-2";
    $SAMSARA.badge.style.display = "";
    if ($SAMSARA.currentLinkWrap) $SAMSARA.currentLinkWrap.style.display = "none";
    if ($SAMSARA.currentLinkText) $SAMSARA.currentLinkText.textContent = "";
    if ($SAMSARA.btnUnlink) {
      $SAMSARA.btnUnlink.onclick = null;
      $SAMSARA.btnUnlink.disabled = true;
    }
  }
}

function bindSamsaraSearchAndPaging() {
  if ($SAMSARA.btnSearch && $SAMSARA.searchInput) {
    $SAMSARA.btnSearch.onclick = (e) => {
      e.preventDefault();
      samsaraApplyFilter($SAMSARA.searchInput.value);
      renderSamsaraPage(0);
    };
    $SAMSARA.searchInput.onkeyup = (e) => {
      if (e.key === "Enter") {
        samsaraApplyFilter($SAMSARA.searchInput.value);
        renderSamsaraPage(0);
      }
    };
  }
  if ($SAMSARA.btnPrev) $SAMSARA.btnPrev.onclick = () => renderSamsaraPage(SAMSARA_STATE.page - 1);
  if ($SAMSARA.btnNext) $SAMSARA.btnNext.onclick = () => renderSamsaraPage(SAMSARA_STATE.page + 1);
}

function samsaraApplyFilter(q) {
  const query = String(q || "").trim().toLowerCase();
  if (!query) {
    SAMSARA_STATE.filtered = SAMSARA_STATE.all.slice();
    return;
  }
  SAMSARA_STATE.filtered = SAMSARA_STATE.all.filter(v => {
    const name = (v.name || "").toLowerCase();
    const vin = (v.vin || "").toLowerCase();
    const plate = (v.licensePlate || "").toLowerCase();
    const serial = (v.serial || v.serialNumber || "").toLowerCase();
    const tags = ((v.tags || []).map(t => t.name || "").join(" ") || "").toLowerCase();
    return (
      name.includes(query) ||
      vin.includes(query) ||
      plate.includes(query) ||
      serial.includes(query) ||
      tags.includes(query)
    );
  });
}

function renderSamsaraPage(pageIndex) {
  const total = SAMSARA_STATE.filtered.length;
  const pageSize = SAMSARA_STATE.pageSize;

  SAMSARA_STATE.page = Math.max(0, Math.min(pageIndex, Math.floor(Math.max(total - 1, 0) / pageSize)));
  const start = SAMSARA_STATE.page * pageSize;
  const end = Math.min(start + pageSize, total);

  if ($SAMSARA.listBody) {
    const rows = SAMSARA_STATE.filtered.slice(start, end).map(v => {
      const id = v.id;
      const name = escapeHtml(v.name || "");
      const vin = escapeHtml(v.vin || "");
      const plate = escapeHtml(v.licensePlate || "");
      const serial = escapeHtml(v.serial || v.serialNumber || "");
      return `
        <tr>
          <td>${name}</td>
          <td>${vin}</td>
          <td>${plate}</td>
          <td>${serial}</td>
          <td class="text-right">
            <button class="btn btn-sm btn-outline-primary" data-samsara-link="${id}">Link</button>
          </td>
        </tr>
      `;
    }).join("");
    $SAMSARA.listBody.innerHTML = rows;

    $SAMSARA.listBody.querySelectorAll("button[data-samsara-link]").forEach(btn => {
      btn.addEventListener("click", () => onSamsaraLink(btn.getAttribute("data-samsara-link")));
    });
  }

  if ($SAMSARA.countInfo) {
    $SAMSARA.countInfo.textContent = total
      ? `Показано ${start + 1}-${end} из ${total}`
      : "Ничего не найдено";
  }

  if ($SAMSARA.btnPrev) $SAMSARA.btnPrev.disabled = SAMSARA_STATE.page <= 0;
  if ($SAMSARA.btnNext) $SAMSARA.btnNext.disabled = end >= total;
}

async function onSamsaraLink(samsaraVehicleId) {
  const unitId = SAMSARA_STATE.currentUnitId;
  if (!unitId) return;

  try {
    const res = await fetch("/api/samsara/link_vehicle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unit_id: unitId, samsara_vehicle_id: String(samsaraVehicleId) })
    });

    if (!res.ok) {
      const txt = await res.text();
      Swal.fire("Ошибка", "Link failed: " + txt, "error");
      return;
    }
    renderLinkedState(String(samsaraVehicleId));
  } catch (e) {
    Swal.fire("Ошибка", "Link failed: " + e, "error");
  }
}

async function onSamsaraUnlink() {
  const unitId = SAMSARA_STATE.currentUnitId;
  if (!unitId) return;

  try {
    const res = await fetch("/api/samsara/unlink_vehicle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unit_id: unitId })
    });

    if (!res.ok) {
      const txt = await res.text();
      Swal.fire("Ошибка", "Unlink failed: " + txt, "error");
      return;
    }
    renderLinkedState(null);
  } catch (e) {
    Swal.fire("Ошибка", "Unlink failed: " + e, "error");
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"'`=\/]/g, function (c) {
    return ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
      "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
    })[c];
  });
}
