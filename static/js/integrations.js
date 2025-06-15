document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".open-integration-modal").forEach(button => {
        button.addEventListener("click", () => {
            const name = button.dataset.integrationName;
            const modal = document.getElementById("manageIntegrationModal");
            const backdrop = document.getElementById("manageIntegrationBackdrop");
            const title = document.getElementById("manageIntegrationModalTitle");

            title.textContent = `Интеграция: ${name}`;
            modal.classList.add("show");
            backdrop.classList.add("show");

            // ==== Данные из window ====
            const integration = window.integrations.find(i => i.name === name) || {};
            const catalog = window.catalog || [];

            // Заполнение полей
            document.getElementById("integrationNameInput").value = integration.name || name;
            document.getElementById("integrationApiKeyInput").value = integration.api_key || "";
            document.getElementById("integrationLoginInput").value = integration.login || "";
            document.getElementById("integrationPasswordInput").value = integration.password || "";
            document.getElementById("integrationEnabledSelect").value = integration.enabled ? "true" : "false";

            // Селект родителя
            const parentSelect = document.getElementById("integrationParentSelect");
            parentSelect.innerHTML = "<option value=''>-- Не выбрано --</option>";
            catalog.forEach(item => {
                const option = document.createElement("option");
                option.value = item.name;  // или item._id, если в future свяжем
                option.textContent = item.name;
                if (integration.parentId && integration.parentId === item.name) {
                    option.selected = true;
                }
                parentSelect.appendChild(option);
            });
        });
    });
});

function closeIntegrationModal() {
    document.getElementById("manageIntegrationModal").classList.remove("show");
    document.getElementById("manageIntegrationBackdrop").classList.remove("show");
}
