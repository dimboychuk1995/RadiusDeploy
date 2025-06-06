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

  mapboxgl.accessToken = token;
  const map = new mapboxgl.Map({
    container: 'loadMap',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-98, 38], // центр США
    zoom: 4
  });

  map.addControl(new mapboxgl.NavigationControl());

  // Геокодируем адреса
  Promise.all([
    geocodeAddress(pickup, token),
    geocodeAddress(delivery, token)
  ]).then(([pickupCoords, deliveryCoords]) => {
    if (!pickupCoords || !deliveryCoords) {
      console.warn("Ошибка геокодирования");
      return;
    }

    fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${pickupCoords.join(',')};${deliveryCoords.join(',')}?geometries=geojson&access_token=${token}`)
      .then(res => res.json())
      .then(routeData => {
        const route = routeData.routes[0]?.geometry;
        if (!route) return;

        map.fitBounds([pickupCoords, deliveryCoords], { padding: 50 });

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

        new mapboxgl.Marker({ color: 'green' }).setLngLat(pickupCoords).addTo(map);
        new mapboxgl.Marker({ color: 'red' }).setLngLat(deliveryCoords).addTo(map);
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
