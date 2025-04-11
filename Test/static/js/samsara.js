function initSamsara() {
    console.log('🌐 Init Samsara Map');

    mapboxgl.accessToken = 'pk.eyJ1IjoiZGltYm95Y2h1azE5OTUiLCJhIjoiY205YnQ4ZWFhMGtsZDJrcG5ncmNydXA1OSJ9.2TL3NMfPdfTtZzJJ5gYj2w';

    const map = new mapboxgl.Map({
        container: 'samsara-map',
        style: 'mapbox://styles/mapbox/navigation-day-v1',
        center: [-98.5795, 39.8283],
        zoom: 4
    });

    map.addControl(new mapboxgl.NavigationControl());

    let markers = [];
    let focusedVehicleId = null;

    const tagSelect = $('#searchTags');
    tagSelect.select2({
        placeholder: 'Выберите теги',
        theme: 'bootstrap4',
        width: '100%',
        allowClear: true
    });

    tagSelect.on('change', () => {
        focusedVehicleId = null;
        document.getElementById("showAllBtn").style.display = "none";
        loadVehicles();
    });

    function clearMarkers() {
        markers.forEach(marker => marker.remove());
        markers = [];
    }

    function loadVehicles() {
        fetch('/api/vehicles')
            .then(res => res.json())
            .then(vehicles => {
                clearMarkers();

                const unitQuery = document.getElementById("searchUnit")?.value?.toLowerCase() || "";
                const driverQuery = document.getElementById("searchDriver")?.value?.toLowerCase() || "";

                const listContainer = document.getElementById("samsara-list");
                listContainer.innerHTML = "";

                // Сбор всех уникальных тегов
                const allTags = new Set();
                vehicles.forEach(v => (v.tag_names || []).forEach(tag => allTags.add(tag)));

                // Сохраняем текущие выбранные значения
                const prevSelected = tagSelect.val() || [];

                // Перезаполняем Select2 при каждом вызове
                tagSelect.empty();
                [...allTags].sort().forEach(tag => {
                    const option = new Option(tag, tag, false, prevSelected.includes(tag));
                    tagSelect.append(option);
                });
                tagSelect.trigger('change.select2');

                const selectedTags = tagSelect.val() || [];

                vehicles.forEach(vehicle => {
                    if (vehicle.gps && vehicle.gps.latitude && vehicle.gps.longitude) {
                        const name = (vehicle.name || "").toLowerCase();
                        const driverName = (vehicle.staticAssignedDriver?.name || "").toLowerCase();
                        const vehicleTags = vehicle.tag_names || [];

                        const matchesTags =
                            selectedTags.length === 0 ||
                            selectedTags.some(tag => vehicleTags.includes(tag));

                        const match =
                            (focusedVehicleId === null || vehicle.id === focusedVehicleId) &&
                            name.includes(unitQuery) &&
                            driverName.includes(driverQuery) &&
                            matchesTags;

                        if (match) {
                            const speed = vehicle.gps.speedMilesPerHour
                                ? vehicle.gps.speedMilesPerHour.toFixed(1) + ' mph'
                                : 'N/A';

                            const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
                                `<h5>${vehicle.name || 'No Name'}</h5>
                                 <p><strong>Driver:</strong> ${vehicle.staticAssignedDriver?.name || 'No Driver'}<br>
                                 <strong>Speed:</strong> ${speed}<br>
                                 <strong>Address:</strong> ${vehicle.gps.reverseGeo?.formattedLocation || 'N/A'}<br>
                                 <strong>Tags:</strong> ${vehicleTags.join(', ') || 'No Tags'}<br>
                                 <strong>Lat:</strong> ${vehicle.gps.latitude.toFixed(4)}<br>
                                 <strong>Lng:</strong> ${vehicle.gps.longitude.toFixed(4)}</p>`
                            );

                            const marker = new mapboxgl.Marker()
                                .setLngLat([vehicle.gps.longitude, vehicle.gps.latitude])
                                .setPopup(popup)
                                .addTo(map);

                            markers.push(marker);

                            const listItem = document.createElement("div");
                            listItem.className = "border rounded p-2 mb-2 bg-white shadow-sm";
                            listItem.style.cursor = "pointer";

                            const badge = vehicle.gps.speedMilesPerHour
                                ? `<span class="badge badge-success float-right">${Math.round(vehicle.gps.speedMilesPerHour)} MPH</span>`
                                : "";

                            listItem.innerHTML = `
                                <div class="font-weight-bold">
                                    ${vehicle.name || 'No Name'} ${badge}
                                </div>
                                <div class="text-muted" style="font-size: 0.9em;">
                                    📍 ${vehicle.gps.reverseGeo?.formattedLocation || 'No Address'}
                                </div>
                                <div style="font-size: 0.9em;">
                                    👤 ${vehicle.staticAssignedDriver?.name || 'No Driver'}
                                </div>
                            `;

                            listItem.addEventListener("click", () => {
                                focusedVehicleId = vehicle.id;
                                document.getElementById("showAllBtn").style.display = "block";
                                loadVehicles();

                                map.flyTo({
                                    center: [vehicle.gps.longitude, vehicle.gps.latitude],
                                    zoom: 10
                                });
                            });

                            listContainer.appendChild(listItem);
                        }
                    }
                });
            });
    }

    // Первичная загрузка
    loadVehicles();
    setInterval(loadVehicles, 60000);

    // Живой текстовый фильтр
    ["searchUnit", "searchDriver"].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("input", () => {
                focusedVehicleId = null;
                document.getElementById("showAllBtn").style.display = "none";
                loadVehicles();
            });
        }
    });

    const showAllBtn = document.getElementById("showAllBtn");
    if (showAllBtn) {
        showAllBtn.addEventListener("click", () => {
            focusedVehicleId = null;
            showAllBtn.style.display = "none";
            loadVehicles();
        });
    }
}
