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
        initPhotoPreviewModal();
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


let currentPhotoUrls = [];
let currentPhotoIndex = 0;

// Загрузка фото pickup/delivery
function loadStagePhotos(loadId, stage) {
  const containerId = stage + "PhotosContainer";
  const container = document.getElementById(containerId);

  if (container.dataset.loaded === "true") return;

  fetch(`/api/load/photos?id=${loadId}&stage=${stage}`)
    .then(res => res.json())
    .then(data => {
      container.innerHTML = "";
      if (data.photos && data.photos.length > 0) {
        currentPhotoUrls = data.photos;

        data.photos.forEach((url, index) => {
          const imgWrapper = document.createElement("div");
          imgWrapper.className = "d-inline-block m-1";

          const img = document.createElement("img");
          img.src = url;
          img.style.width = "150px";
          img.style.cursor = "pointer";
          img.className = "img-thumbnail";
          img.setAttribute("data-bs-toggle", "modal");
          img.setAttribute("data-bs-target", "#photoPreviewModal");
          img.setAttribute("data-full-url", url);
          img.setAttribute("data-all-urls", JSON.stringify(data.photos));

          imgWrapper.appendChild(img);
          container.appendChild(imgWrapper);
        });
      } else {
        container.textContent = "Нет загруженных фото.";
      }
      container.dataset.loaded = "true";
    })
    .catch(err => {
      container.innerHTML = "Ошибка при загрузке фото";
      console.error("Ошибка при загрузке фото:", err);
    });
}

// Инициализация клика по миниатюре
function initPhotoPreviewModal() {
  document.addEventListener("click", function (e) {
    const target = e.target;
    if (target.tagName === "IMG" && target.dataset.fullUrl && target.dataset.allUrls) {
      try {
        currentPhotoUrls = JSON.parse(target.dataset.allUrls);
        currentPhotoIndex = currentPhotoUrls.indexOf(target.dataset.fullUrl);
        showPhoto(currentPhotoIndex);
      } catch (err) {
        console.error("Ошибка парсинга URL массива:", err);
      }
    }
  });
}

// Показать фото по индексу
function showPhoto(index) {
  const modalImg = document.getElementById("modalPhoto");
  if (!modalImg || currentPhotoUrls.length === 0) return;

  currentPhotoIndex = (index + currentPhotoUrls.length) % currentPhotoUrls.length;
  modalImg.src = currentPhotoUrls[currentPhotoIndex];
}

// Следующее фото
function nextPhoto() {
  showPhoto(currentPhotoIndex + 1);
}

// Предыдущее фото
function prevPhoto() {
  showPhoto(currentPhotoIndex - 1);
}