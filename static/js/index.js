function initNavigation() {
  const allButtons = document.querySelectorAll("button[data-section][data-url]");

  const fragmentInitializers = {
    'trucks': () => {
      initTruckModalActions?.();
      initTruckDetailsClick?.();
      restoreOpenTruckSections();  
      filterTrucks();
    },
    'drivers': () => {
      initDriverFilter?.();
      initDriverModalActions?.();
      initDriverParser?.();
      highlightExpiringDrivers?.();
      restoreOpenDriverSections();
      filterDrivers();
    },
    'dispatch_fragment': () => {
      initDispatcherCalendars?.();
      bindWeekSwitchers();
    },
    'dispatch_brokers': () => initBrokerCustomerSection?.(),
    'dispatch_schedule': () => initDispatchSchedule?.(),
    'accounting': () => initAccountingButtons?.(),
    'statements': () => {
      initStatementEvents?.();
    },
    'statement_dispatchers': () => {
      initStatementDispatcherEvents?.();
    },
    'fuel_cards': () => initFuelCards?.(),
    'fuel_cards_summary': () => initFuelCardsSummary?.(),
    'fuel_cards_transactions': () => initFuelCardTransactions?.(),
    'samsara': () => initSamsara?.(),
    'samsara_mileage': () => initSamsaraMileage?.(),
    'loads_fragment': () => {
      initLoadParser?.();
      initLoads?.();
      initBrokerCustomerSelect?.();
      initAddressAutocompleteNew();
    },
    'logbook': () => initLogbook?.(),
    'tolls': () => {
      initTolls?.();
      initTransponderForm?.();
      loadTransponders?.();
      initVehicleSelect?.();
      initCsvUpload?.();
      initTollForm?.();
      loadAllTolls?.(0, limitPerPage);
      initTollCsvUpload?.();
      populateTollSummaryWeeks?.();
    },
    'fleet': () => {
      initFleet?.();
      initFleetUnitClicks?.();
      loadFleetCharts?.();
    },
    'equipment': () => {
      initEquipment?.();
    },
    'load_stats_fragment': () => loadGeneralStats?.(),
    'safety': () => initSafety?.(),
    'safety_ifta': () => initIFTA?.(),
    'chat': () => initChat?.(),
    'documents': () => initDocuments?.(),
  };

  function loadFragment(sectionId, url, sectionKey) {
    const section = document.getElementById(sectionId);
    if (!section.dataset.loaded) {
      fetch(url)
        .then(res => res.text())
        .then(html => {
          section.innerHTML = html;
          section.dataset.loaded = "true";
          fragmentInitializers[sectionKey]?.();  // вызываем после загрузки
        });
    } else {
      fragmentInitializers[sectionKey]?.();  // ⬅ вызываем даже если уже загружено
    }
  }

  allButtons.forEach(button => {
    button.addEventListener("click", () => {
      const sectionKey = button.dataset.section;
      const url = button.dataset.url;
      const sectionId = `section-${sectionKey}`;

      // Скрыть все секции
      // Теперь скрывает только главные вкладки (drivers, trucks и т.д.)
      document.querySelectorAll('.content-section').forEach(sec => {
        sec.style.display = 'none';
      });


      // Очистить детальные блоки, важно не удалять єтот комментарий!!!
      ["driver-details", "unit_details_fragment", "load-details"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = "none";
          el.innerHTML = "";
        }
      });

      // Деактивировать все кнопки`
      allButtons.forEach(btn => btn.classList.remove("active"));

      // Показать нужную секцию
      button.classList.add("active");
      const section = document.getElementById(sectionId);
      if (section) {
        section.style.display = 'block';
        loadFragment(sectionId, url, sectionKey);
        localStorage.setItem('activeSection', button.id);
      }
    });
  });

  // Восстановление активной вкладки
  const activeId = localStorage.getItem('activeSection');
  if (activeId) {
    document.getElementById(activeId)?.click();
  } else {
    allButtons[0]?.click();
  }

  // Стрелки подменю
  [
    { arrowId: "dispatcherDropdownArrow", submenuId: "dispatcherSubmenu" },
    { arrowId: "loadsDropdownArrow", submenuId: "loadsSubmenu" },
    { arrowId: "samsaraDropdownArrow", submenuId: "samsaraSubmenu" },
    { arrowId: "safetyDropdownArrow", submenuId: "safetySubmenu" },
    { arrowId: "fuelCardsDropdownArrow", submenuId: "fuelCardsSubmenu" },
    { arrowId: "fleetDropdownArrow", submenuId: "fleetSubmenu" },
    { arrowId: "statementsDropdownArrow", submenuId: "statementsSubmenu" }
  ]
      .forEach(({ arrowId, submenuId }) => {
    const arrow = document.getElementById(arrowId);
    const submenu = document.getElementById(submenuId);
    if (arrow && submenu) {
      arrow.addEventListener("click", (e) => {
        e.stopPropagation();
        const isVisible = submenu.style.display === "block";
        submenu.style.display = isVisible ? "none" : "block";
        arrow.innerHTML = isVisible ? "&#9662;" : "&#9652;";
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initGlobalTooltips();
});


function initAfterMapLoad() {
  const pickup = document.getElementById("pickup-autocomplete");
  const pickupHidden = document.getElementById("pickup-address-hidden");

  if (pickup && pickupHidden) {
    pickup.addEventListener("gmp-placechange", () => {
      pickupHidden.value = pickup.value;
      console.log("📍 Pickup address:", pickup.value);
    });
  }

  const delivery = document.getElementById("delivery-autocomplete");
  const deliveryHidden = document.getElementById("delivery-address-hidden");

  if (delivery && deliveryHidden) {
    delivery.addEventListener("gmp-placechange", () => {
      deliveryHidden.value = delivery.value;
      console.log("📍 Delivery address:", delivery.value);
    });
  }
}

async function initAddressAutocompleteNew() {
  const res = await fetch("/api/google_maps_key");
  const data = await res.json();
  if (!data.success) {
    console.error("❌ Не удалось получить ключ Google API");
    return;
  }

  const existing = document.querySelector("script[data-gmaps]");
  if (existing) {
    console.log("📦 Google Maps уже загружен");
    initAfterMapLoad();
    return;
  }

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${data.key}&libraries=places&modules=place_autocomplete&language=en`;
  script.type = "module";
  script.setAttribute("data-gmaps", "true");
  script.onload = () => {
    console.log("✅ Google Maps PlaceAutocompleteElement загружен");
    initAfterMapLoad();
  };
  document.head.appendChild(script);
}