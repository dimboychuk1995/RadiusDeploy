// === ЗАМЕНИТЕ метод полностью ===
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

      // карта/фото (как было)
      if (typeof initLoadDetails === "function") {
        initLoadDetails();
        initPhotoPreviewModal();
      }

      // ленивая подгрузка BOL (как было)
      if (typeof initBolLazyPreview === "function") {
        initBolLazyPreview(details);
      }

      // 🔥 новый степпер статуса
      if (typeof initLoadStatusStepper === "function") {
        initLoadStatusStepper(details);
      }
    })
    .catch(error => {
      console.error("Ошибка загрузки деталей груза:", error);
    });
}

// === ДОБАВЬТЕ НИЖЕ: инициализация панели статуса ===
function initLoadStatusStepper(root = document) {
  const el = root.querySelector('#loadStatusStepper');
  if (!el) return;

  // нормализация статусов
  const norm = (s) => String(s || '')
    .toLowerCase()
    .replace(/cancelled/g, 'canceled')
    .replace(/[\s-]+/g, '_')
    .trim();

  const status = norm(el.dataset.status);           // из load.status
  const pay    = norm(el.dataset.payment);          // из load.payment_status

  // порядок шагов панели
  const ORDER = ['new', 'dispatched', 'picked_up', 'delivered', 'canceled', 'tonu', 'invoiced', 'paid'];

  // вычисляем "текущий" индекс
  let idx = Math.max(0, ORDER.indexOf(status));
  const isTerminal = (status === 'canceled' || status === 'tonu');

  // если не терминальный — учитываем оплату
  if (!isTerminal) {
    if (pay === 'paid') idx = ORDER.indexOf('paid');
    else if (pay === 'invoiced') idx = Math.max(idx, ORDER.indexOf('invoiced'));
  }

  // подсветка шагов
  const steps = el.querySelectorAll('.step');
  steps.forEach((li, i) => {
    li.classList.remove('done', 'current', 'future', 'is-canceled', 'is-tonu');
    if (i < idx) li.classList.add('done');
    else if (i === idx) {
      li.classList.add('current');
      if (status === 'canceled') li.classList.add('is-canceled');
      if (status === 'tonu')     li.classList.add('is-tonu');
    } else {
      li.classList.add('future');
    }
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
    style: "mapbox://styles/mapbox/navigation-day-v1",
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
function loadStagePhotos(loadId, stage, stopNumber) {
  const containerId = `${stage}PhotosContainer-${stopNumber}`;
  const container = document.getElementById(containerId);
  const photoData = document.getElementById("photoData");

  if (!container || container.dataset.loaded === "true" || !photoData) return;

  const isSuperDispatch = photoData.dataset.isSuperDispatch === "true";

  container.innerHTML = "<p>Загрузка фото...</p>";

  const apiUrl = isSuperDispatch
    ? `/api/load/super_dispatch_photos?id=${loadId}&stage=${stage}&stop_number=${stopNumber}`
    : `/api/load/photos?id=${loadId}&stage=${stage}&stop_number=${stopNumber}`;

  fetch(apiUrl)
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
        container.textContent = "Фото не найдены.";
      }

      container.dataset.loaded = "true";
    })
    .catch(err => {
      container.innerHTML = "Ошибка при загрузке фото.";
      console.error("Ошибка загрузки фото:", err);
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


/* =========================
   ЛЕНИВАЯ ПОДГРУЗКА BOL
   ========================= */
/**
 * Ленивая подгрузка предпросмотра BOL в iframe.
 * Не ставим src до момента раскрытия коллапса, чтобы /api/load/<id>/bol_preview
 * вызывался только при открытии блока BOL.
 *
 * Требования к HTML:
 *  - контейнер BOL-коллапса с id="bolCollapse" и классом "collapse" (по умолчанию закрыт)
 *  - iframe с id="bolFrame" и атрибутом data-src="/api/load/{{ load._id }}/bol_preview"
 *
 * @param {ParentNode} root - корневой контейнер фрагмента (document или div фрагмента)
 * @param {string} collapseSelector - селектор коллапса BOL
 * @param {string} iframeSelector - селектор iframe BOL
 */
function initBolLazyPreview(root, collapseSelector = '#bolCollapse', iframeSelector = '#bolFrame') {
  try {
    root = root || document;
    const collapseEl = root.querySelector(collapseSelector);
    const frame = root.querySelector(iframeSelector);
    if (!collapseEl || !frame) return;

    const loadOnce = () => {
      if (!frame.getAttribute('src')) {
        const url = frame.dataset.src;
        if (url) frame.setAttribute('src', url);
      }
    };

    // Если уже открыт — загрузим сразу
    if (collapseEl.classList.contains('show')) {
      loadOnce();
    }

    // При первом раскрытии — подставляем src
    collapseEl.addEventListener('show.bs.collapse', loadOnce, { once: true });
  } catch (e) {
    // Здесь можно показать тост/alert при желании
  }
}

// Экспорт в глобальную область (если нет модульной сборки)
window.initBolLazyPreview = window.initBolLazyPreview || initBolLazyPreview;
