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
                const tagsQuery = document.getElementById("searchTags")?.value?.toLowerCase() || "";

                vehicles.forEach(vehicle => {
                    if (vehicle.gps && vehicle.gps.latitude && vehicle.gps.longitude) {
                        const name = (vehicle.name || "").toLowerCase();
                        const driverName = (vehicle.staticAssignedDriver?.name || "").toLowerCase();
                        const tagString = (vehicle.tag_names || []).join(', ').toLowerCase();

                        if (
                            name.includes(unitQuery) &&
                            driverName.includes(driverQuery) &&
                            tagString.includes(tagsQuery)
                        ) {
                            const speed = vehicle.gps.speedMilesPerHour
                                ? vehicle.gps.speedMilesPerHour.toFixed(1) + ' mph'
                                : 'N/A';

                            const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
                                `<h5>${vehicle.name || 'No Name'}</h5>
                                 <p><strong>Driver:</strong> ${vehicle.staticAssignedDriver?.name || 'No Driver'}<br>
                                 <strong>Speed:</strong> ${speed}<br>
                                 <strong>Address:</strong> ${vehicle.gps.reverseGeo?.formattedLocation || 'N/A'}<br>
                                 <strong>Tags:</strong> ${vehicle.tag_names?.join(', ') || 'No Tags'}<br>
                                 <strong>Lat:</strong> ${vehicle.gps.latitude.toFixed(4)}<br>
                                 <strong>Lng:</strong> ${vehicle.gps.longitude.toFixed(4)}</p>`
                            );

                            const marker = new mapboxgl.Marker()
                                .setLngLat([vehicle.gps.longitude, vehicle.gps.latitude])
                                .setPopup(popup)
                                .addTo(map);

                            markers.push(marker);
                        }
                    }
                });
            });
    }

    // Инициализация
    loadVehicles();
    setInterval(loadVehicles, 60000);

    // Живой фильтр
    ["searchUnit", "searchDriver", "searchTags"].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("input", loadVehicles);
        }
    });
}
