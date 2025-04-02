document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll(".list-group-item");
    const contentArea = document.getElementById("content-area");

    function loadSection(section) {
        contentArea.innerHTML = '<p>Загрузка...</p>';

        fetch(`/fragment/${section}`)
            .then(response => response.text())
            .then(html => {
                contentArea.innerHTML = html;

                // Инициализация для секции "drivers"
                if (section === "drivers") {
                    if (typeof initClickableRows === "function") initClickableRows();
                    if (typeof initDriverFilter === "function") initDriverFilter();
                    if (typeof initEditMode === "function") initEditMode();
                    if (typeof initTabs === "function") initTabs();
                }
            })
            .catch(err => {
                contentArea.innerHTML = `<div class="alert alert-danger">Ошибка загрузки: ${err}</div>`;
            });
    }

    buttons.forEach(button => {
        button.addEventListener("click", () => {
            buttons.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");
            const section = button.dataset.section;
            loadSection(section);
        });
    });

    loadSection("drivers"); // по умолчанию
});
