function showLoadDetails(loadId) {
  const section = document.getElementById("section-loads_fragment");
  const details = document.getElementById("load-details");

  if (!section || !details) {
    console.error("Секции section-loads_fragment или load-details не найдены");
    return;
  }

  fetch(`/fragment/load_details_fragment?id=${loadId}`)
    .then(response => response.text())
    .then(html => {
      section.style.display = "none";
      details.innerHTML = html;
      details.style.display = "block";

      // ✅ ВАЖНО: вызываем инициализацию карты после вставки HTML
      if (typeof initLoadDetails === "function") {
        initLoadDetails();
      }
    })
    .catch(error => {
      console.error("Ошибка загрузки деталей груза:", error);
    });
}


function returnToLoads() {
  const section = document.getElementById("section-loads_fragment");
  const details = document.getElementById("load-details");

  if (section && details) {
    details.style.display = "none";
    details.innerHTML = "";
    section.style.display = "block";
  }
}

function initLoadDetails() {
  const wrapper = document.getElementById("loadMapWrapper");
  const token = wrapper?.dataset?.mapboxToken;
  const pickup = wrapper?.dataset?.pickupAddress;
  const delivery = wrapper?.dataset?.deliveryAddress;

  if (!token || !pickup || !delivery) {
    console.warn("Недостаточно данных для отображения карты");
    return;
  }

  const extraPickups = JSON.parse(wrapper.dataset.extraPickups || '[]');
  const extraDeliveries = JSON.parse(wrapper.dataset.extraDeliveries || '[]');

  const allStops = [
    { address: pickup, type: 'pickup' },
    ...extraPickups.map(p => ({ address: p.address, type: 'extra_pickup' })),
    { address: delivery, type: 'delivery' },
    ...extraDeliveries.map(d => ({ address: d.address, type: 'extra_delivery' }))
  ];

  mapboxgl.accessToken = token;

  const map = new mapboxgl.Map({
    container: 'loadMap',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-98, 38],
    zoom: 4
  });

  map.addControl(new mapboxgl.NavigationControl());

  Promise.all(
    allStops.map(stop => geocodeAddress(stop.address, token))
  ).then(coordsList => {
    const validCoords = coordsList.filter(Boolean);

    if (validCoords.length < 2) {
      console.warn("Недостаточно координат для построения маршрута");
      return;
    }

    const coordPairs = validCoords.map(coord => coord.join(',')).join(';');

    fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordPairs}?geometries=geojson&access_token=${token}`)
      .then(res => res.json())
      .then(routeData => {
        const route = routeData.routes[0]?.geometry;
        if (!route) return;

        const bounds = new mapboxgl.LngLatBounds();
        validCoords.forEach(c => bounds.extend(c));
        map.fitBounds(bounds, { padding: 50 });

        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: route
          }
        });

        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#1a56db',
            'line-width': 5
          }
        });

        validCoords.forEach((coord, i) => {
          new mapboxgl.Marker({ color: i === 0 ? 'green' : (i === validCoords.length - 1 ? 'red' : 'blue') })
            .setLngLat(coord)
            .addTo(map);
        });

        // Клик по карте → Google Maps (от первого до последнего адреса)
        document.getElementById('loadMap').addEventListener('click', () => {
          const addresses = allStops.map(s => encodeURIComponent(s.address));
          if (addresses.length < 2) return;

          const origin = addresses[0];
          const destination = addresses[addresses.length - 1];
          const waypoints = addresses.slice(1, -1).join('|'); // промежуточные точки

          const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}`;

          window.open(gmapsUrl, '_blank');
        });
      });
  });
}


function geocodeAddress(address, token) {
  return fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}`)
    .then(res => res.json())
    .then(data => data.features[0]?.center)
    .catch(err => {
      console.error("Ошибка геокодирования адреса:", address, err);
      return null;
    });
}

