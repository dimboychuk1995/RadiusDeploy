document.addEventListener("DOMContentLoaded", function () {
    // Открытие модального окна и заполнение данных
    document.querySelectorAll(".open-integration-modal").forEach(button => {
        button.addEventListener("click", () => {
            const name = button.dataset.integrationName;
            const modal = document.getElementById("manageIntegrationModal");
            const backdrop = document.getElementById("manageIntegrationBackdrop");
            const title = document.getElementById("manageIntegrationModalTitle");

            title.textContent = `Интеграция: ${name}`;
            modal.classList.add("show");
            backdrop.classList.add("show");

            const integration = window.integrations.find(i => i.name === name) || {};
            const catalog = window.catalog || [];

            document.getElementById("integrationNameInput").value = integration.name || name;
            document.getElementById("integrationApiKeyInput").value = integration.api_key || "";
            document.getElementById("integrationLoginInput").value = integration.login || "";
            document.getElementById("integrationPasswordInput").value = integration.password || "";
            document.getElementById("integrationEnabledSelect").value = integration.enabled ? "true" : "false";

            const parentSelect = document.getElementById("integrationParentSelect");
            parentSelect.innerHTML = "<option value=''>-- Не выбрано --</option>";

            const integrationParentId = integration.parentId?.$oid || integration.parentId;
            catalog.forEach(item => {
                const oid = item._id?.$oid || item._id;
                const option = document.createElement("option");
                option.value = oid;
                option.textContent = item.name;
                if (integrationParentId === oid) {
                    option.selected = true;
                }
                parentSelect.appendChild(option);
            });

            // Вешаем обработчик submit, если он ещё не был навешен
            const form = document.getElementById("integrationForm");
            if (form && !form.dataset.listenerAttached) {
                form.addEventListener("submit", async function (e) {
                    e.preventDefault();

                    const name = document.getElementById("integrationNameInput").value;
                    const enabled = document.getElementById("integrationEnabledSelect").value === "true";
                    const api_key = document.getElementById("integrationApiKeyInput").value.trim();
                    const login = document.getElementById("integrationLoginInput").value.trim();
                    const password = document.getElementById("integrationPasswordInput").value.trim();
                    const parentId = document.getElementById("integrationParentSelect").value || null;

                    console.log("Отправка данных:", { name, enabled, api_key, login, password, parentId });

                    try {
                        const res = await fetch(`/api/integrations/${name}/update`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ enabled, api_key, login, password, parentId })
                        });

                        const result = await res.json();
                        if (result.success) {
                            alert("✅ Интеграция обновлена");
                            closeIntegrationModal();
                        } else {
                            alert("❌ Ошибка: " + (result.error || "Неизвестная"));
                        }
                    } catch (err) {
                        console.error("Ошибка сохранения:", err);
                        alert("⚠️ Ошибка сети");
                    }
                });

                // Помечаем, что слушатель уже навешан
                form.dataset.listenerAttached = "true";
            }
        });
    });
});

// Закрытие модального окна
function closeIntegrationModal() {
    document.getElementById("manageIntegrationModal").classList.remove("show");
    document.getElementById("manageIntegrationBackdrop").classList.remove("show");
}
