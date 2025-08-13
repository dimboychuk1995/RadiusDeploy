// static/js/samsara.js

// ==== Глобалы ===============================================================
let __map = null;
const __markersBySamsaraId = Object.create(null); // samsara_vehicle_id -> { marker, popup }
let __currentVehicleId = null;                    // выбранный samsara_vehicle_id

// Имена источников/слоёв трека
const VH_SRC_LINE   = "vh-route";
const VH_LYR_LINE   = "vh-route";
const VH_SRC_START  = "vh-start";
const VH_LYR_START  = "vh-start";
const VH_SRC_END    = "vh-end";
const VH_LYR_END    = "vh-end";
const VH_SRC_STOPS  = "vh-stops";
const VH_LYR_STOPS  = "vh-stops";

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
  wireTrackControls();

  loadUnitsSidebar();          // список справа
  loadSamsaraPositions(__map); // маркеры на карте
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

// ==== A11y guard ============================================================
function blurActiveIfPopupClose() {
  const ae = document.activeElement;
  if (ae && ae.classList && ae.classList.contains("mapboxgl-popup-close-button")) {
    try { ae.blur(); } catch(_) {}
  }
}

// ==== Контролы трека ========================================================
function wireTrackControls() {
  const inDate  = document.getElementById("vh-date");
  const btnShow = document.getElementById("vh-show");
  const btnClear= document.getElementById("vh-clear");

  if (inDate && !inDate.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    inDate.value = `${yyyy}-${mm}-${dd}`;
  }

  btnShow?.addEventListener("click", async () => {
    if (!__currentVehicleId) {
      flashCurrent("Сначала выберите юнит (справа или клик по маркеру)");
      return;
    }
    blurActiveIfPopupClose();
    await fetchAndRenderVehicleHistory({
      vehicleId: __currentVehicleId,
      date: getSelectedDateYMD(),
      map: __map
    });
  });

  btnClear?.addEventListener("click", () => {
    blurActiveIfPopupClose();
    clearTrackLayers(__map);
  });
}

function getSelectedDateYMD() {
  const el = document.getElementById("vh-date");
  return (el && el.value) ? el.value : undefined; // YYYY-MM-DD
}

function setCurrentVehicle(samsaraId, label) {
  __currentVehicleId = samsaraId;
  const el = document.getElementById("vh-current");
  if (el) el.textContent = samsaraId ? `Выбран: ${label || samsaraId}` : "Юнит не выбран";
}

function flashCurrent(text) {
  const el = document.getElementById("vh-current");
  if (!el) return;
  const old = el.textContent;
  el.textContent = text;
  setTimeout(() => { el.textContent = old; }, 2000);
}

// ==== Сайдбар: наши юниты из БД ============================================
async function loadUnitsSidebar() {
  try {
    const res = await fetch("/api/samsara/units_by_company");
    if (!res.ok) {
      console.error("❌ /api/samsara/units_by_company failed:", await res.text());
      renderUnitsSidebar([]);
      return;
    }
    const data = await res.json();
    renderUnitsSidebar(Array.isArray(data.companies) ? data.companies : []);
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
      row.style.padding = "6px 6px";
      row.style.cursor = u.is_linked ? "pointer" : "not-allowed";

      const unitLabel = `${u.unit_number || "Unit"}${u.vin ? ` (VIN: ${u.vin})` : ""}`;
      const driverLabel = u.driver_name ? ` — ${u.driver_name}` : "";
      row.textContent = `${unitLabel}${driverLabel}`;

      if (!u.is_linked) {
        row.style.color = "red";
        row.title = "Не привязан к Samsara";
      } else {
        row.style.color = "#333";
      }

      if (u.samsara_vehicle_id) {
        row.dataset.samsaraId = String(u.samsara_vehicle_id);
      }

      row.addEventListener("click", async () => {
        const samsaraId = row.dataset.samsaraId;
        if (!samsaraId) return;

        setCurrentVehicle(samsaraId, `${u.unit_number || ""}${u.driver_name ? ` — ${u.driver_name}` : ""}`);

        const rec = __markersBySamsaraId[samsaraId];
        if (rec && rec.marker) {
          blurActiveIfPopupClose();
          const lngLat = rec.marker.getLngLat();
          __map.flyTo({ center: lngLat, zoom: Math.max(__map.getZoom(), 10), duration: 500 });
          try { rec.marker.togglePopup(); } catch (_) {}
        }
        await fetchAndRenderVehicleHistory({
          vehicleId: samsaraId,
          date: getSelectedDateYMD(),
          map: __map
        });
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

      // ВАЖНО: closeButton: false, чтобы не было focus на крестике
      const popup = new mapboxgl.Popup({ offset: 12, closeButton: false })
        .setHTML(buildPopupHtml(v));
      const marker = new mapboxgl.Marker({ color: "#e53935" })
        .setLngLat([lon, lat])
        .setPopup(popup)
        .addTo(map);

      marker.getElement().addEventListener("click", async () => {
        setCurrentVehicle(samsaraId, v.unit_number || v.name || samsaraId);
        blurActiveIfPopupClose();
        await fetchAndRenderVehicleHistory({
          vehicleId: samsaraId,
          date: getSelectedDateYMD(),
          map: __map
        });
      });

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
  const driver = v.driver_name ? `Driver: ${escapeHtml(v.driver_name)}` : "";
  const updated = v.updatedAt ? `Updated: ${escapeHtml(v.updatedAt)}` : "";
  const lines = [line2, vin, plate, driver, updated].filter(Boolean);
  return `
    <div style="min-width:220px">
      <div style="font-weight:600">${title}</div>
      ${lines.map(l => `<div>${l}</div>`).join("")}
    </div>
  `;
}

// ==== Трек: API + отрисовка ================================================

async function fetchAndRenderVehicleHistory({ vehicleId, date, map }) {
  if (!vehicleId || !map) return;
  document.body.style.cursor = "progress";
  try {
    const url = new URL("/api/samsara/vehicle_history", location.origin);
    url.searchParams.set("samsara_vehicle_id", vehicleId);
    if (date) url.searchParams.set("date", date);

    // Временно форсим источник локаций (гарантированно есть точки),
    // пока не включишь скоуп "Read Vehicle Statistics" для токена.
    url.searchParams.set("force", "locations");

    const res = await fetch(url.toString(), { credentials: "include" });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Failed to fetch history");

    const points = (data.points || []).map(p => ({ lat: p.lat, lon: p.lon, time: p.time }));
    let stops = data.stops || [];

    if ((!stops || !stops.length) && points.length) {
      stops = computeStopsFromPoints(points, { radiusM: 30, minMinutes: 5 });
    }

    renderVehicleDayRoute(map, { points, stops });
  } catch (e) {
    console.error("❌ fetchAndRenderVehicleHistory:", e);
  } finally {
    document.body.style.cursor = "";
  }
}

function clearTrackLayers(map) {
  if (!map) return;
  const safeRemove = id => {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  };
  safeRemove(VH_LYR_LINE);  safeRemove(VH_SRC_LINE);
  safeRemove(VH_LYR_START); safeRemove(VH_SRC_START);
  safeRemove(VH_LYR_END);   safeRemove(VH_SRC_END);
  safeRemove(VH_LYR_STOPS); safeRemove(VH_SRC_STOPS);
}

function renderVehicleDayRoute(map, { points, stops }) {
  // Ждём загрузки стиля, иначе addSource/Layer игнорятся
  if (!map || !map.isStyleLoaded()) {
    map.once("load", () => renderVehicleDayRoute(map, { points, stops }));
    return;
  }

  clearTrackLayers(map);
  if (!points || points.length === 0) {
    flashCurrent("Точек за этот день нет");
    return;
  }

  map.addSource(VH_SRC_LINE, { type: "geojson", data: pointsToLineString(points) });
  map.addLayer({
    id: VH_LYR_LINE,
    type: "line",
    source: VH_SRC_LINE,
    paint: { "line-color": "#2E86DE", "line-width": 4, "line-opacity": 0.9 }
  });

  const start = points[0], end = points[points.length - 1];
  map.addSource(VH_SRC_START, { type: "geojson", data: pointFeature(start.lon, start.lat, { title: "Start", time: start.time }) });
  map.addLayer({
    id: VH_LYR_START,
    type: "circle",
    source: VH_SRC_START,
    paint: { "circle-radius": 6, "circle-color": "#2ecc71", "circle-stroke-width": 2, "circle-stroke-color": "#fff" }
  });
  map.addSource(VH_SRC_END, { type: "geojson", data: pointFeature(end.lon, end.lat, { title: "End", time: end.time }) });
  map.addLayer({
    id: VH_LYR_END,
    type: "circle",
    source: VH_SRC_END,
    paint: { "circle-radius": 6, "circle-color": "#e74c3c", "circle-stroke-width": 2, "circle-stroke-color": "#fff" }
  });

  if (stops && stops.length) {
    map.addSource(VH_SRC_STOPS, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: stops.map(s => pointFeature(s.lon, s.lat, s))
      }
    });
    map.addLayer({
      id: VH_LYR_STOPS,
      type: "circle",
      source: VH_SRC_STOPS,
      paint: { "circle-radius": 5, "circle-color": "#f1c40f", "circle-stroke-width": 2, "circle-stroke-color": "#333" }
    });

    __map.on("click", VH_LYR_STOPS, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties || {};
      new mapboxgl.Popup({ closeOnClick: true, closeButton: false })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font: 12px/1.4 sans-serif">
            <b>Stop</b><br/>
            ${fmtLocal(p.startTime)} → ${fmtLocal(p.endTime)}<br/>
            Duration: ${p.durationMinutes} min
          </div>`
        )
        .addTo(__map);
    });
    __map.on("mouseenter", VH_LYR_STOPS, () => __map.getCanvas().style.cursor = "pointer");
    __map.on("mouseleave", VH_LYR_STOPS, () => __map.getCanvas().style.cursor = "");
  }

  const bounds = new mapboxgl.LngLatBounds();
  points.forEach(p => bounds.extend([p.lon, p.lat]));
  map.fitBounds(bounds, { padding: 40, duration: 500 });
}

// ==== Гео/вспомогательные ===================================================
function pointsToLineString(points) {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: points.map(p => [p.lon, p.lat])
      }
    }]
  };
}

function pointFeature(lon, lat, props = {}) {
  return {
    type: "Feature",
    properties: props,
    geometry: { type: "Point", coordinates: [lon, lat] }
  };
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function computeStopsFromPoints(points, { radiusM = 30, minMinutes = 5 } = {}) {
  const stops = [];
  if (!points || points.length === 0) return stops;

  let clusterStart = 0;
  let center = { ...points[0] };
  let sumLat = 0, sumLon = 0, count = 0;

  const flushCluster = (endIdx) => {
    if (endIdx <= clusterStart) return;
    const t0 = new Date(points[clusterStart].time);
    const t1 = new Date(points[endIdx - 1].time);
    const durMin = (t1 - t0) / 60000;
    if (durMin >= minMinutes) {
      const avgLat = sumLat / count;
      const avgLon = sumLon / count;
      stops.push({
        startTime: points[clusterStart].time,
        endTime: points[endIdx - 1].time,
        durationMinutes: Math.round(durMin * 10) / 10,
        lat: +avgLat.toFixed(6),
        lon: +avgLon.toFixed(6),
      });
    }
  };

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const d = haversineMeters({lat: p.lat, lon: p.lon}, {lat: center.lat, lon: center.lon});
    if (d <= radiusM) {
      sumLat += p.lat; sumLon += p.lon; count++;
      center = { lat: sumLat / count, lon: sumLon / count };
    } else {
      flushCluster(i);
      clusterStart = i;
      center = { ...p };
      sumLat = p.lat; sumLon = p.lon; count = 1;
    }
  }
  flushCluster(points.length);
  return stops;
}

function fmtLocal(ts, tz = "America/Chicago") {
  try {
    return new Date(ts).toLocaleString("en-US", { timeZone: tz, hour12: false });
  } catch {
    return ts;
  }
}

// ==== Утил ===================================================================
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"'`=\/]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
    "'": "&#39;", "/": "&#x2F;", "`": "&#x60;", "=": "&#x3D;"
  })[c]);
}
