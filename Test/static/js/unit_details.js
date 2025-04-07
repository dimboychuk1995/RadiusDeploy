document.addEventListener("DOMContentLoaded", function () {
    initTruckDetailsClick();  // Инициализация кликов на строки
});

// Функция для обработки кликов по строкам таблицы
// Функция для обработки кликов по строкам таблицы
function initTruckDetailsClick() {
    document.querySelectorAll('.clickable-row').forEach(row => {
        row.addEventListener('click', () => {
            const truckId = row.getAttribute('data-id');
            fetch(`/fragment/unit_details/${truckId}`)
                .then(response => response.text())
                .then(html => {
                    document.getElementById('unit_details_fragment').innerHTML = html;
                });
        });
    });
}
