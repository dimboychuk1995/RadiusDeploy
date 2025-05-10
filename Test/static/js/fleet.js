function initFleet() {
    console.log("Инициализация модуля Fleet...");

    const navButtons = {
        'btn-fleet-units': 'fleet-units-section',
        'btn-fleet-stats': 'fleet-stats-section',
        'btn-fleet-other': 'fleet-other-section'
    };

    Object.keys(navButtons).forEach(btnId => {
        const button = document.getElementById(btnId);
        button.addEventListener('click', () => {
            // Скрываем все секции
            Object.values(navButtons).forEach(sectionId => {
                document.getElementById(sectionId).style.display = 'none';
            });

            // Удаляем active у всех кнопок
            Object.keys(navButtons).forEach(id => {
                document.getElementById(id).classList.remove('active');
            });

            // Активируем текущую
            button.classList.add('active');
            document.getElementById(navButtons[btnId]).style.display = 'block';
        });
    });
}



function loadFleetCharts() {
  fetch('/api/fleet/stats/charts')
    .then(res => res.json())
    .then(data => {
      renderPieChart('chartShops', 'Shops', data.shops);
      renderPieChart('chartStates', 'States', data.states);
      renderPieChart('chartAmounts', 'Invoice Amounts', data.amounts);
      renderPieChart('chartPlaceholder', 'Reserved', { "Pending": 1 });
    })
    .catch(err => {
      console.error("Failed to load fleet charts:", err);
    });
}

function renderPieChart(id, label, dataMap) {
  const ctx = document.getElementById(id).getContext('2d');
  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(dataMap),
      datasets: [{
        label: label,
        data: Object.values(dataMap),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

