document.addEventListener("DOMContentLoaded", function () {
    // === Открытие модалки по кнопке Manage ===
    document.querySelectorAll(".open-integration-modal").forEach(button => {
        button.addEventListener("click", () => {
            const name = button.dataset.integrationName || "Интеграция";
            const modal = document.getElementById("manageIntegrationModal");
            const backdrop = document.getElementById("manageIntegrationBackdrop");
            const title = document.getElementById("manageIntegrationModalTitle");

            if (modal && backdrop && title) {
                title.textContent = `Интеграция: ${name}`;
                modal.classList.add("show");
                backdrop.classList.add("show");
            }
        });
    });
});

// === Закрытие модалки ===
function closeIntegrationModal() {
    document.getElementById("manageIntegrationModal")?.classList.remove("show");
    document.getElementById("manageIntegrationBackdrop")?.classList.remove("show");
}
