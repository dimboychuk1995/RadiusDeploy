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

                vehicles.forEach(vehicle => {
                    if (vehicle.gps && vehicle.gps.latitude && vehicle.gps.longitude) {
                        const driverName = vehicle.staticAssignedDriver ? vehicle.staticAssignedDriver.name : 'No Driver';
                        const speed = vehicle.gps.speedMilesPerHour ? vehicle.gps.speedMilesPerHour.toFixed(1) + ' mph' : 'N/A';
                        const address = vehicle.gps.reverseGeo?.formattedLocation || 'N/A';
                        const tagList = vehicle.tag_names?.length ? vehicle.tag_names.join(', ') : 'No Tags';

                        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
                            `<h5>${vehicle.name || 'No Name'}</h5>
                             <p><strong>Driver:</strong> ${driverName}<br>
                             <strong>Speed:</strong> ${speed}<br>
                             <strong>Address:</strong> ${address}<br>
                             <strong>Tags:</strong> ${tagList}<br>
                             <strong>Lat:</strong> ${vehicle.gps.latitude.toFixed(4)}<br>
                             <strong>Lng:</strong> ${vehicle.gps.longitude.toFixed(4)}</p>`
                        );

                        const marker = new mapboxgl.Marker()
                            .setLngLat([vehicle.gps.longitude, vehicle.gps.latitude])
                            .setPopup(popup)
                            .addTo(map);

                        markers.push(marker);
                    }
                });
            });
    }

    loadVehicles();
    setInterval(loadVehicles, 60000);
}
