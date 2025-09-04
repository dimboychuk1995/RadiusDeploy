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
    'factoring': () => {
      console.log("📄 Factoring фрагмент загружен");
    },
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


// Глобальные функции
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initGlobalTooltips();
  initAddressAutocompleteNew();
  __initBootstrapDatepickers(document); // ⬅ добавили
});

async function initAddressAutocompleteNew() {
  const res = await fetch("/api/mapbox_token");
  const data = await res.json();

  if (!data.success || !data.token) {
    console.error("❌ Не удалось получить токен Mapbox");
    return;
  }

  const token = data.token;

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;

          const inputs = node.querySelectorAll('input[data-autocomplete="mapbox"]');
          inputs.forEach(input => attachMapboxAutocomplete(input, token));
        });
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Инициализируем уже существующие поля при загрузке
  document.querySelectorAll('input[data-autocomplete="mapbox"]').forEach(input => {
    attachMapboxAutocomplete(input, token);
  });
}

function attachMapboxAutocomplete(input, token) {
  if (input.dataset.autocompleteInitialized) return;

  let suggestionBox = null;

  const boxId = input.dataset.suggestions || (input.id + "-suggestions");
  suggestionBox = document.getElementById(boxId);

  if (!suggestionBox) {
    suggestionBox = document.createElement("div");
    suggestionBox.className = "autocomplete-suggestions";
    suggestionBox.id = boxId;
    input.insertAdjacentElement("afterend", suggestionBox);
  }

  input.addEventListener("input", async () => {
    const query = input.value.trim();
    if (query.length < 3) {
      suggestionBox.innerHTML = "";
      return;
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?` +
                `access_token=${token}&autocomplete=true&language=en&limit=5&country=us&proximity=-87.62,41.88`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      suggestionBox.innerHTML = "";

      if (!data.features) return;

      data.features.forEach(feature => {
        const div = document.createElement("div");
        div.textContent = feature.place_name;
        div.className = "autocomplete-suggestion-item";
        div.addEventListener("click", () => {
          input.value = feature.place_name;
          suggestionBox.innerHTML = "";
        });
        suggestionBox.appendChild(div);
      });
    } catch (err) {
      console.error("❌ Ошибка при автозаполнении:", err);
    }
  });

  document.addEventListener("click", (e) => {
    if (!suggestionBox.contains(e.target) && e.target !== input) {
      suggestionBox.innerHTML = "";
    }
  });

  input.dataset.autocompleteInitialized = "true";
}

/* === Global Bootstrap Datepicker init (EN, mm/dd/yyyy, bottom, sticky to input) === */
(function () {
  function getScrollParent(el) {
    let p = el.parentElement;
    const regex = /(auto|scroll)/;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (regex.test(cs.overflow + cs.overflowY + cs.overflowX)) return p;
      p = p.parentElement;
    }
    return window; // fallback
  }

  function attachStickyReposition(input, instance) {
    // instance = $inp.data('datepicker')
    const $inp = jQuery(input);

    function placeIfVisible() {
      // виден ли календарь (popper контейнер присутствует и не скрыт)
      const dp = $inp.data('datepicker');
      if (!dp || !dp.picker || dp.picker.is(':hidden')) return;
      if (typeof dp.place === 'function') dp.place();
    }

    // пересчитываем позицию при прокрутке ближайшего скролл-контейнера и окна
    const sp = getScrollParent(input);
    const onScroll = () => placeIfVisible();
    const onResize = () => placeIfVisible();

    // сохраним ссылки, чтобы при destroy можно было снять
    input.__dpEvents = input.__dpEvents || [];
    if (sp === window) {
      window.addEventListener('scroll', onScroll, { passive: true });
      input.__dpEvents.push(() => window.removeEventListener('scroll', onScroll));
    } else {
      sp.addEventListener('scroll', onScroll, { passive: true });
      input.__dpEvents.push(() => sp.removeEventListener('scroll', onScroll));
    }
    window.addEventListener('resize', onResize);
    input.__dpEvents.push(() => window.removeEventListener('resize', onResize));

    // также пересчёт при focus/keyup (на всякий)
    $inp.on('keyup focus', placeIfVisible);
  }

  function initBootstrapDatepickers(scope) {
    if (!window.jQuery || !jQuery.fn.datepicker) {
      console.warn('[bootstrap-datepicker] not loaded: check CSS/JS includes in base.html');
      return;
    }

    const root = scope instanceof Element ? scope : (scope ? document.querySelector(scope) : document);

    const candidates = root.querySelectorAll(
      'input.datepicker-input, input[data-datepicker], input[type="date"][data-upgrade="1"]'
    );

    candidates.forEach(inp => {
      const $inp = jQuery(inp);
      if ($inp.data('__bdp')) return;

      if (inp.type === 'date' && inp.getAttribute('data-upgrade') === '1') {
        try { inp.type = 'text'; } catch (e) {}
      }

      const fmt  = inp.getAttribute('data-date-format')   || 'mm/dd/yyyy';
      const lang = inp.getAttribute('data-date-language') || 'en';

      $inp.datepicker({
        format: fmt,
        language: lang,
        autoclose: true,
        todayHighlight: true,
        clearBtn: true,
        orientation: 'bottom',     // вниз
        container: 'body',         // поверх оффканваса
        zIndexOffset: 3000,
        weekStart: 0,
        templates: {
          leftArrow:  '&laquo;',
          rightArrow: '&raquo;'
        }
      })
      .on('show', () => {
        // сразу поправим позицию
        const dp = $inp.data('datepicker');
        if (dp && typeof dp.place === 'function') dp.place();
      })
      .on('changeDate', function(){
        $inp.trigger('change');
      });

      // приклеиваем к скроллу/resize
      attachStickyReposition(inp, $inp.data('datepicker'));

      $inp.data('__bdp', true);
    });
  }

  // Публично
  window.__initBootstrapDatepickers = initBootstrapDatepickers;

  // Первичная инициализация
  document.addEventListener('DOMContentLoaded', () => {
    initBootstrapDatepickers(document);
  });

  // Инициализация на динамически добавленные узлы
  const mo = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList' && m.addedNodes?.length) {
        m.addedNodes.forEach(node => {
          if (node instanceof HTMLElement) initBootstrapDatepickers(node);
        });
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();