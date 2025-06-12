document.addEventListener("DOMContentLoaded", function () {
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
});

// === Обработчики для уже существующих интеграций ===
document.querySelectorAll("[data-save-for]").forEach(saveBtn => {
    saveBtn.addEventListener("click", () => {
        const name = saveBtn.dataset.saveFor;
        const apiKeyInput = document.querySelector(`[data-api-key-for="${name}"]`);
        const toggleBtn = document.querySelector(`[data-name="${name}"]`);
        const enabled = toggleBtn.dataset.enabled === "true";
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            alert("⚠️ Укажите API ключ");
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
                alert(`✅ Интеграция "${name}" обновлена`);
            } else {
                alert("❌ Ошибка: " + (data.error || "неизвестная"));
            }
        })
        .catch(err => {
            alert("⚠️ Ошибка сети");
            console.error(err);
        });
    });
});

document.querySelectorAll("[data-name]").forEach(toggleBtn => {
    toggleBtn.addEventListener("click", () => {
        const isEnabled = toggleBtn.dataset.enabled === "true";
        const newStatus = !isEnabled;
        toggleBtn.dataset.enabled = String(newStatus);
        toggleBtn.textContent = newStatus ? "ON" : "OFF";
        toggleBtn.classList.toggle("btn-outline-success", newStatus);
        toggleBtn.classList.toggle("btn-outline-danger", !newStatus);
    });
});
