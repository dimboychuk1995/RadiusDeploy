document.addEventListener("DOMContentLoaded", function () {
    initTruckDetailsClick();  // Инициализация кликов на строки
});

// Функция для обработки кликов по строкам таблицы
function initTruckDetailsClick() {
    document.querySelectorAll('.clickable-row').forEach(row => {
        row.addEventListener('click', () => {
            const truckId = row.getAttribute('data-id');

            // Скрываем секцию со списком юнитов
            document.getElementById('section-trucks').style.display = 'none';

            // Показываем секцию с деталями юнита
            document.getElementById('unit_details_fragment').style.display = 'block';

            // Загружаем фрагмент с деталями
            fetch(`/fragment/unit_details/${truckId}`)
                .then(response => response.text())
                .then(html => {
                    document.getElementById('unit_details_fragment').innerHTML = html;
                });
        });
    });
}

//кнопка назад
function loadTrucksFragment() {
    // Скрываем детали
    document.getElementById('unit_details_fragment').style.display = 'none';

    // Показываем список юнитов
    document.getElementById('section-trucks').style.display = 'block';

    // Загружаем список грузовиков
    fetch('/fragment/trucks')
        .then(response => response.text())
        .then(html => {
            document.getElementById('section-trucks').innerHTML = html;

            // Повторная инициализация кликов и поиска
            initTruckDetailsClick();
            initTruckSearch();
        });
}
