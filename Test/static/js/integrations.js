document.addEventListener("DOMContentLoaded", function () {
    const toggleButton = document.getElementById("samsaraToggle");
    const apiKeyInput = document.getElementById("samsaraApiKeyInput");
    const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");

    let enabled = toggleButton.dataset.enabled === "true";

    // === Обновление внешнего вида кнопки ===
    function updateToggleButton() {
        toggleButton.textContent = enabled ? "ON" : "OFF";
        toggleButton.classList.toggle("btn-outline-success", enabled);
        toggleButton.classList.toggle("btn-outline-danger", !enabled);
    }

    updateToggleButton();

    // === Переключение статуса интеграции ===
    toggleButton.addEventListener("click", () => {
        enabled = !enabled;
        updateToggleButton();

        fetch("/api/integrations/samsara", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ enabled })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                enabled = !enabled;
                updateToggleButton();
                alert("❌ Не удалось обновить статус интеграции");
            }
        })
        .catch(err => {
            enabled = !enabled;
            updateToggleButton();
            alert("⚠️ Ошибка сети при попытке обновить статус");
            console.error(err);
        });
    });

    // === Сохранение API ключа ===
    saveApiKeyBtn.addEventListener("click", () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            alert("⚠️ Пожалуйста, введите API ключ перед сохранением.");
            return;
        }

        fetch("/api/integrations/samsara/key", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ api_key: apiKey })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert("✅ API ключ успешно сохранён");
            } else {
                alert("❌ Ошибка: " + (data.error || "неизвестная"));
            }
        })
        .catch(err => {
            alert("⚠️ Ошибка сети при сохранении ключа");
            console.error(err);
        });
    });
});


    // === Добавление новой интеграции ===
    const addBtn = document.getElementById("addIntegrationBtn");
    const container = document.getElementById("integrationsContainer");

    if (addBtn && container) {
        addBtn.addEventListener("click", () => {
            const uniqueId = Date.now(); // Для уникальности ID

            const card = document.createElement("div");
            card.className = "card mb-3";

            card.innerHTML = `
                <div class="card-body">
                    <div class="d-flex flex-wrap align-items-center gap-3">
                        <input type="text" class="form-control" placeholder="Название интеграции" 
                               id="name-${uniqueId}" style="min-width: 150px; max-width: 200px;">

                        <button class="btn btn-outline-danger" id="toggle-${uniqueId}" data-enabled="false">OFF</button>

                        <input type="text" class="form-control" placeholder="API ключ" 
                               id="key-${uniqueId}" style="min-width: 300px; max-width: 500px;">

                        <button class="btn btn-primary" id="save-${uniqueId}">Сохранить</button>
                    </div>
                </div>
            `;

            container.appendChild(card);

            const toggleBtn = document.getElementById(`toggle-${uniqueId}`);
            let enabled = false;

            function updateDynamicToggle() {
                toggleBtn.textContent = enabled ? "ON" : "OFF";
                toggleBtn.classList.toggle("btn-outline-success", enabled);
                toggleBtn.classList.toggle("btn-outline-danger", !enabled);
            }

            updateDynamicToggle();

            toggleBtn.addEventListener("click", () => {
                enabled = !enabled;
                updateDynamicToggle();
            });

            const saveBtn = document.getElementById(`save-${uniqueId}`);
            saveBtn.addEventListener("click", () => {
                const name = document.getElementById(`name-${uniqueId}`).value.trim();
                const apiKey = document.getElementById(`key-${uniqueId}`).value.trim();

                if (!name || !apiKey) {
                    alert("⚠️ Укажите имя и API ключ.");
                    return;
                }

                fetch(`/api/integrations/${name}/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ enabled, api_key: apiKey })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        alert(`✅ Интеграция "${name}" сохранена`);
                    } else {
                        alert("❌ Ошибка сохранения: " + (data.error || "неизвестная"));
                    }
                })
                .catch(err => {
                    alert("⚠️ Ошибка сети при сохранении интеграции");
                    console.error(err);
                });
            });
        });
    }
