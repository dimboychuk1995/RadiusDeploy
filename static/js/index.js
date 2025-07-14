function initNavigation() {
  const allButtons = document.querySelectorAll("button[data-section][data-url]");

  const fragmentInitializers = {
    'trucks': () => {
      initTruckModalActions?.();
      initTruckDetailsClick?.();
      restoreOpenTruckSections();  
      filterTrucks();// ⏱️ вызов после полной отрисовки HTML
    },
    'drivers': () => {
      initDriverFilter?.();
      initDriverModalActions?.();
      initDriverParser?.();
      highlightExpiringDrivers?.();
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
      document.querySelectorAll('[id^="section-"]').forEach(sec => {
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