// static/js/samsara.js

// ==== Глобалы ===============================================================
let __map = null;
const __markersBySamsaraId = Object.create(null); // samsara_vehicle_id -> { marker, popup }

// ==== Bootstrap =============================================================
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("samsara-map")) initSamsara();
});

// ==== Главный вход ==========================================================
function initSamsara() {
  const mapEl = document.getElementById("samsara-map");
  if (!mapEl) return;

  const token = mapEl.dataset.mapboxToken || "";
  if (!token) {
    console.warn("ℹ️ Mapbox token отсутствует, карта не инициализирована");
    return;
  }

  __map = initMap(token);
  addMapControls(__map);

  // Грузим ПАРАЛЛЕЛЬНО: список юнитов (из нашей БД) и позиции (из Samsara)
  loadUnitsSidebar();          // /api/samsara/units_by_company  → список справа
  loadSamsaraPositions(__map); // /api/samsara/linked_vehicles  → маркеры на карте
}

// ==== Карта =================================================================
function initMap(token) {
  mapboxgl.accessToken = token;
  return new mapboxgl.Map({
    container: "samsara-map",
    style: "mapbox://styles/mapbox/navigation-day-v1",
    center: [-98.5795, 39.8283], // USA
    zoom: 4
  });
}

function addMapControls(map) {
  map.addControl(new mapboxgl.NavigationControl(), "top-right");
}

function fitToBounds(map, bounds) {
  map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 600 });
}

// ==== Сайдбар: наши юниты из БД ============================================
async function loadUnitsSidebar() {
  try {
    const res = await fetch("/api/samsara/units_by_company");
    if (!res.ok) {
      console.error("❌ /api/samsara/units_by_company failed:", await res.text());
      renderUnitsSidebar([]); // очистим список
      return;
    }
    const data = await res.json();
    const companies = Array.isArray(data.companies) ? data.companies : [];
    renderUnitsSidebar(companies);
  } catch (e) {
    console.error("❌ loadUnitsSidebar error:", e);
    renderUnitsSidebar([]);
  }
}

function renderUnitsSidebar(companies) {
  const container = document.getElementById("units-list");
  if (!container) return;
  container.innerHTML = "";

  companies.forEach(company => {
    const block = document.createElement("div");
    block.style.marginBottom = "12px";

    const header = document.createElement("div");
    header.textContent = company.company_name || "Без компании";
    header.style.fontWeight = "bold";
    header.style.borderBottom = "1px solid #ddd";
    header.style.marginBottom = "6px";
    block.appendChild(header);

    (company.units || []).forEach(u => {
      const row = document.createElement("div");
      row.style.padding = "4px 6px";
      row.style.cursor = "pointer";

      const title = `${u.unit_number || "Unit"}${u.vin ? ` (VIN: ${u.vin})` : ""}`;
      row.textContent = title;

      // Подсветка несвязанных
      if (!u.is_linked) {
        row.style.color = "red";
        row.title = "Не привязан к Samsara";
      } else {
        row.style.color = "#333";
      }

      // Сохраним samsara id для клика
      if (u.samsara_vehicle_id) {
        row.dataset.samsaraId = String(u.samsara_vehicle_id);
      }

      // Клик по юниту: если есть связанный маркер — сфокусируемся
      row.addEventListener("click", () => {
        const samsaraId = row.dataset.samsaraId;
        if (!samsaraId) return; // юнит не связан — нечего фокусировать

        const rec = __markersBySamsaraId[samsaraId];
        if (rec && rec.marker) {
          const lngLat = rec.marker.getLngLat();
          __map.flyTo({ center: lngLat, zoom: Math.max(__map.getZoom(), 10), duration: 500 });
          try { rec.marker.togglePopup(); } catch (_) {}
        } else {
          // Связан, но координат нет (или ещё не подгружены)
          // Можно показать уведомление, но не спамим консоль
        }
      });

      block.appendChild(row);
    });

    container.appendChild(block);
  });
}

// ==== Маркеры: позиции Samsara для связанных юнитов =========================
async function loadSamsaraPositions(map) {
  try {
    const res = await fetch("/api/samsara/linked_vehicles");
    if (!res.ok) {
      console.error("❌ /api/samsara/linked_vehicles failed:", await res.text());
      clearMarkers();
      return;
    }

    const data = await res.json();
    const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];

    clearMarkers();

    const bounds = new mapboxgl.LngLatBounds();
    let plotted = 0;

    vehicles.forEach(v => {
      const lon = v?.coords?.lon;
      const lat = v?.coords?.lat;
      if (lon == null || lat == null) return;

      const samsaraId = String(v.id || v.samsara_vehicle_id || "");
      if (!samsaraId) return;

      const popup = new mapboxgl.Popup({ offset: 12 }).setHTML(buildPopupHtml(v));
      const marker = new mapboxgl.Marker({ color: "#e53935" })
        .setLngLat([lon, lat])
        .setPopup(popup)
        .addTo(map);

      __markersBySamsaraId[samsaraId] = { marker, popup };

      bounds.extend([lon, lat]);
      plotted++;
    });

    if (plotted > 0) fitToBounds(map, bounds);
  } catch (e) {
    console.error("❌ loadSamsaraPositions error:", e);
    clearMarkers();
  }
}

function clearMarkers() {
  for (const k in __markersBySamsaraId) {
    try { __markersBySamsaraId[k].marker.remove(); } catch (_) {}
    delete __markersBySamsaraId[k];
  }
}

function buildPopupHtml(v) {
  const title = escapeHtml(v.name || v.unit_number || "Unit");
  const line2 = `${escapeHtml(v.make || "")} ${escapeHtml(v.model || "")} ${escapeHtml(v.year || "")}`.trim();
  const vin = v.vin ? `VIN: ${escapeHtml(v.vin)}` : "";
  const plate = v.licensePlate ? `Plate: ${escapeHtml(v.licensePlate)}` : "";
  const speed = (v.coords && v.coords.speedMph != null) ? `Speed: ${Number(v.coords.speedMph).toFixed(1)} mph` : "";
  const driver = v.driver_name ? `Driver: ${escapeHtml(v.driver_name)}` : "";

  const lines = [line2, vin, plate, driver, speed].filter(Boolean);
  return `
    <div style="min-width:220px">
      <div style="font-weight:600">${title}</div>
      ${lines.map(l => `<div>${l}</div>`).join("")}
    </div>
  `;
}

// ==== Утил ===================================================================
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"'`=\/]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
    "'": "&#39;", "/": "&#x2F;", "`": "&#x60;", "=": "&#x3D;"
  })[c]);
}
