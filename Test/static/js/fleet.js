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
