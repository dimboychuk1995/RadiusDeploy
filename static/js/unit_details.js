document.addEventListener("DOMContentLoaded", function () {
    initTruckDetailsClick();  // Инициализация кликов по строкам
});

function initTruckDetailsClick() {
    document.querySelectorAll('.clickable-row').forEach(row => {
        row.addEventListener('click', () => {
            const truckId = row.getAttribute('data-id');

            const section = document.getElementById('section-trucks');
            const container = document.getElementById('unit_details_fragment');

            section.style.display = 'none';
            container.style.display = 'block';

            fetch(`/fragment/unit_details/${truckId}`)
                .then(response => response.text())
                .then(html => {
                    container.innerHTML = html;

                    // 🔄 Инициализация иконок lucide, если используется
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }

                    // ✅ Поворот стрелок collapse
                    container.querySelectorAll('[data-bs-toggle="collapse"]').forEach(button => {
                        const icon = button.querySelector('.collapse-icon');
                        const targetSelector = button.getAttribute('data-bs-target');
                        const target = container.querySelector(targetSelector);
                        if (!target) return;

                        // Навешиваем поведение
                        button.addEventListener('click', () => {
                            const instance = bootstrap.Collapse.getOrCreateInstance(target);
                            instance.toggle();

                            // Вращаем стрелку
                            if (icon) {
                                icon.classList.toggle('rotated');
                            }
                        });
                    });
                });
        });
    });
}

// Кнопка "Назад"
function loadTrucksFragment() {
    const section = document.getElementById('section-trucks');
    const details = document.getElementById('unit_details_fragment');

    details.style.display = 'none';
    section.style.display = 'block';

    fetch('/fragment/trucks')
        .then(response => response.text())
        .then(html => {
            section.innerHTML = html;

            initTruckDetailsClick();
        });
}
