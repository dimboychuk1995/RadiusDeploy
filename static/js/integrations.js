document.addEventListener("DOMContentLoaded", function () {
    // === Обработчики для существующих интеграций ===
    document.querySelectorAll("[data-save-for]").forEach(saveBtn => {
        saveBtn.addEventListener("click", () => {
            const name = saveBtn.dataset.saveFor;
            const apiKeyInput = document.querySelector(`[data-api-key-for="${name}"]`);
            const apiKey = apiKeyInput.value.trim();

            if (!apiKey) {
                alert("⚠️ Укажите API ключ");
                return;
            }

            fetch(`/api/integrations/${name}/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: true, api_key: apiKey })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert(`✅ Интеграция "${name}" сохранена`);

                    // Меняем стиль кнопки (Connect → Manage)
                    saveBtn.textContent = "Manage";
                    saveBtn.classList.remove("btn-outline-secondary");
                    saveBtn.classList.add("btn-outline-primary");
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

    // === Добавление новой интеграции ===
    const addBtn = document.getElementById("addIntegrationBtn");
    const container = document.getElementById("integrationsContainer");

    if (addBtn && container) {
        addBtn.addEventListener("click", () => {
            const id = Date.now();

            const card = document.createElement("div");
            card.className = "col-md-4 mb-4";
            card.innerHTML = `
                <div class="card h-100">
                    <div class="card-body d-flex flex-column">
                        <input type="text" class="form-control mb-2" placeholder="Название интеграции" id="name-${id}">
                        <input type="text" class="form-control mb-2" placeholder="API ключ" id="key-${id}">
                        <button class="btn btn-primary mt-auto" id="save-${id}">Сохранить</button>
                    </div>
                </div>
            `;

            container.appendChild(card);

            const saveBtn = document.getElementById(`save-${id}`);
            saveBtn.addEventListener("click", () => {
                const name = document.getElementById(`name-${id}`).value.trim();
                const apiKey = document.getElementById(`key-${id}`).value.trim();

                if (!name || !apiKey) {
                    alert("⚠️ Укажите имя и API ключ");
                    return;
                }

                fetch(`/api/integrations/${name}/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ enabled: true, api_key: apiKey })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        alert(`✅ Интеграция "${name}" добавлена`);
                        saveBtn.textContent = "Manage";
                        saveBtn.classList.remove("btn-primary");
                        saveBtn.classList.add("btn-outline-primary");
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
    }
});
