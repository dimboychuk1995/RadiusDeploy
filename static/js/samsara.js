// === Инициализация карты Mapbox + логика Samsara ===
function initSamsara() {
    console.log("🚀 initSamsara started");

    const mapEl = document.getElementById("samsara-map");
    if (!mapEl) {
        console.error("❌ Элемент #samsara-map не найден");
        return;
    }

    const token = mapEl.dataset.mapboxToken;
    if (!token) {
        console.error("❌ Mapbox token не найден в элементе #samsara-map");
        return;
    }

    // 1. Инициализируем карту
    const map = initMap(token);

    // 2. Подключаем контролы
    addMapControls(map);

    // 3. Загружаем и отрисовываем юниты Samsara
    loadAndRenderSamsaraUnits(map);
}

// === Создание карты ===
function initMap(token) {
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
        container: 'samsara-map',
        style: 'mapbox://styles/mapbox/navigation-day-v1',
        center: [-98.5795, 39.8283], // центр США
        zoom: 4
    });

    console.log("🗺️ Map initialized");
    return map;
}

// === Добавление контролов управления картой ===
function addMapControls(map) {
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    console.log("🛠️ Controls added");
}

// === Загрузка юнитов Samsara и отрисовка ===
function loadAndRenderSamsaraUnits(map) {
    console.log("📡 Загрузка юнитов Samsara...");
    
    fetch("/api/samsara/vehicles") // <-- тут можно будет подставить API для получения списка юнитов
        .then(res => res.json())
        .then(data => {
            if (!data.success || !data.vehicles) {
                console.warn("⚠️ Не удалось получить юниты Samsara", data);
                return;
            }

            console.log(`✅ Загружено юнитов: ${data.vehicles.length}`);
            data.vehicles.forEach(vehicle => {
                if (vehicle.lng && vehicle.lat) {
                    addVehicleMarker(map, vehicle);
                }
            });
        })
        .catch(err => console.error("❌ Ошибка загрузки юнитов Samsara", err));
}

// === Добавление маркера для юнита ===
function addVehicleMarker(map, vehicle) {
    new mapboxgl.Marker({ color: "red" })
        .setLngLat([vehicle.lng, vehicle.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`
            <strong>${vehicle.name || "Без имени"}</strong><br>
            ${vehicle.licensePlate || ""}
        `))
        .addTo(map);
}
