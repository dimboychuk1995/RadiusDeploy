document.addEventListener("DOMContentLoaded", function () {
    const sections = {
        'btn-trucks': { id: 'section-trucks', url: '/fragment/trucks' },
        'btn-drivers': { id: 'section-drivers', url: '/fragment/drivers' },
        'btn-loads-fragment': { id: 'section-loads-fragment', url: '/fragment/loads_fragment' },
        'btn-dispatch-fragment': { id: 'section-dispatch-fragment', url: '/fragment/dispatch_fragment' },
        'btn-brokers-fragment': { id: 'section-dispatch-brokers', url: '/fragment/dispatch_brokers' },
        'btn-accounting': { id: 'section-accounting', url: '/fragment/accounting_fragment' },
        'btn-statements': { id: 'section-statements', url: '/statement/fragment' },
        'btn-fuel-cards': { id: 'section-fuel-cards', url: '/fragment/fuel_cards' },
        'btn-samsara': { id: 'section-samsara', url: '/fragment/samsara_fragment' },
        'btn-tolls': { id: 'section-tolls', url: '/fragment/tolls_fragment' },
        'btn-fleet': { id: 'section-fleet', url: '/fragment/fleet_fragment' },
    };

    function loadFragment(sectionId, url) {
        const section = document.getElementById(sectionId);
        if (!section.dataset.loaded) {
            fetch(url)
                .then(res => res.text())
                .then(html => {
                    section.innerHTML = html;
                    section.dataset.loaded = "true";

                    if (url.includes('trucks')) {
                        initTruckModalActions?.();
                        initTruckSearch?.();
                        initTruckDetailsClick();
                    } else if (url.includes('drivers')) {
                        initDriverFilter?.();
                        initClickableRows?.();
                        initDriverModalActions?.();
                        initDriverParser();
                        highlightExpiringDrivers();
                    } else if (url.includes('dispatch_fragment')) {
                        initDispatcherCalendars();
                    } else if (url.includes('dispatch_brokers')) {
                        initBrokerCustomerSection?.();
                    } else if (url.includes('accounting')) {
                        initAccountingButtons?.();
                    } else if (url.includes('statement')) {
                        initStatementEvents?.();
                        initStatementFilter?.();
                        initStatementRowClicks();
                    } else if (url.includes('fuel_cards')) {
                        initFuelCards?.();
                    } else if (url.includes('samsara')) {
                        initSamsara?.();
                    } else if (url.includes('loads')) {
                        initLoadParser?.();
                        initLoads?.();
                    } else if (url.includes('tolls')) {
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
                    } else if (url.includes('fleet')) {
                        initFleet?.();
                        initFleetUnitClicks?.();
                        loadFleetCharts?.();
                    }
                });
        }
    }

    Object.keys(sections).forEach(buttonId => {
        const button = document.getElementById(buttonId);
        const { id: sectionId, url } = sections[buttonId];

        if (button) {
            button.addEventListener("click", () => {
                Object.values(sections).forEach(({ id }) => {
                    const section = document.getElementById(id);
                    if (section) section.style.display = "none";
                });

                const driverDetailsSection = document.getElementById("driver-details");
                if (driverDetailsSection) {
                    driverDetailsSection.style.display = "none";
                    driverDetailsSection.innerHTML = "";
                }

                const unitDetailsSection = document.getElementById("unit_details_fragment");
                if (unitDetailsSection) {
                    unitDetailsSection.style.display = "none";
                    unitDetailsSection.innerHTML = "";
                }

                Object.keys(sections).forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn) btn.classList.remove("active");
                });

                button.classList.add("active");
                const targetSection = document.getElementById(sectionId);
                targetSection.style.display = "block";
                loadFragment(sectionId, url);
                localStorage.setItem('activeSection', buttonId);
            });
        }
    });

    // Обработчик стрелки раскрытия подменю "Диспетчер"
    const arrow = document.getElementById("dispatcherDropdownArrow");
    if (arrow) {
        arrow.addEventListener("click", (e) => {
            e.stopPropagation();
            const submenu = document.getElementById("dispatcherSubmenu");
            submenu.style.display = submenu.style.display === "none" ? "block" : "none";
        });
    }

    // Восстановление активной вкладки
    const activeSection = localStorage.getItem('activeSection') || 'btn-trucks';
    document.getElementById(activeSection)?.click();
});
