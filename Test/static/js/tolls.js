function initTolls() {
    console.log("Инициализация модуля Toll...");

    const navButtons = {
        'btn-tolls-summary': 'tolls-summary-section',
        'btn-transponders': 'transponders-section',
        'btn-all-tolls': 'all-tolls-section'
    };

    Object.keys(navButtons).forEach(btnId => {
        const button = document.getElementById(btnId);
        button.addEventListener('click', () => {
            // Скрываем все секции
            Object.values(navButtons).forEach(sectionId => {
                document.getElementById(sectionId).style.display = 'none';
            });

            // Деактивируем все кнопки
            Object.keys(navButtons).forEach(id => {
                document.getElementById(id).classList.remove('active');
            });

            // Активируем текущую
            button.classList.add('active');
            document.getElementById(navButtons[btnId]).style.display = 'block';
        });
    });
}
