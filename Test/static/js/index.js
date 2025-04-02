document.addEventListener("DOMContentLoaded", () => {
    const buttons = {
        'btn-trucks': 'section-trucks',
        'btn-drivers': 'section-drivers',
        'btn-dispatch': 'section-dispatch',
        'btn-loads': 'section-loads'
    };

    Object.entries(buttons).forEach(([btnId, sectionId]) => {
        const btn = document.getElementById(btnId);
        btn.addEventListener("click", () => {
            // Скрываем все секции и снимаем active
            Object.values(buttons).forEach(id => document.getElementById(id).style.display = "none");
            Object.keys(buttons).forEach(id => document.getElementById(id).classList.remove("active"));

            // Показываем выбранную секцию и делаем кнопку активной
            document.getElementById(sectionId).style.display = "block";
            btn.classList.add("active");
        });
    });
});
