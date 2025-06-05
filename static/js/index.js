document.addEventListener("DOMContentLoaded", function () {
  const allButtons = document.querySelectorAll("button[data-section][data-url]");

  const fragmentInitializers = {
    'trucks': () => {
      initTruckModalActions?.();
      initTruckSearch?.();
      initTruckDetailsClick?.();
    },
    'drivers': () => {
      initDriverFilter?.();
      initClickableRows?.();
      initDriverModalActions?.();
      initDriverParser?.();
      highlightExpiringDrivers?.();
      bindAssignmentForm();
    },
    'dispatch_fragment': () => initDispatcherCalendars?.(),
    'dispatch_brokers': () => initBrokerCustomerSection?.(),
    'accounting': () => initAccountingButtons?.(),
    'statement': () => {
      initStatementEvents?.();
      initStatementFilter?.();
      initStatementRowClicks?.();
    },
    'fuel_cards': () => initFuelCards?.(),
    'samsara': () => initSamsara?.(),
    'samsara_mileage': () => initSamsaraMileage?.(),
    'loads_fragment': () => {
      initLoadParser?.();
      initLoads?.();
      initBrokerCustomerSelect?.();
    },
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
      loadTollsSummary?.();
    },
    'fleet': () => {
      initFleet?.();
      initFleetUnitClicks?.();
      loadFleetCharts?.();
    },
    'load_stats_fragment': () => loadGeneralStats?.(),
    'safety': () => initSafety?.()
  };

  function loadFragment(sectionId, url, sectionKey) {
    const section = document.getElementById(sectionId);
    if (!section.dataset.loaded) {
      fetch(url)
        .then(res => res.text())
        .then(html => {
          section.innerHTML = html;
          section.dataset.loaded = "true";

          fragmentInitializers[sectionKey]?.();
        });
    }
  }

  allButtons.forEach(button => {
    button.addEventListener("click", () => {
      const sectionKey = button.dataset.section;
      const url = button.dataset.url;
      const sectionId = `section-${sectionKey}`;

      // Скрыть все секции
      document.querySelectorAll('[id^="section-"]').forEach(sec => {
        sec.style.display = 'none';
      });

      // Очистить детальные блоки
      ["driver-details", "unit_details_fragment"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = "none";
          el.innerHTML = "";
        }
      });

      // Деактивировать все кнопки
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
    { arrowId: "samsaraDropdownArrow", submenuId: "samsaraSubmenu" }
  ].forEach(({ arrowId, submenuId }) => {
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
});
