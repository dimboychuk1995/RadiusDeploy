function initFleetUnitClicks() {
    document.querySelectorAll(".clickable-row").forEach(row => {
        row.addEventListener("click", () => {
            const unitId = row.dataset.id;
            fetch(`/fragment/fleet_unit_details/${unitId}`)
                .then(res => res.text())
                .then(html => {
                    document.querySelectorAll(".content-section").forEach(s => s.style.display = "none");

                    const details = document.getElementById("unit_details_fragment");
                    details.innerHTML = html;
                    details.style.display = "block";

                    initServiceFileParser(); // подгружаем слушатель после вставки
                });
        });
    });
}

function openServiceModal() {
    document.getElementById('serviceModal').classList.add('open');
    document.querySelector('.custom-offcanvas-backdrop').classList.add('show');
}

function closeServiceModal() {
    document.getElementById('serviceModal').classList.remove('open');
    document.querySelector('.custom-offcanvas-backdrop').classList.remove('show');
}

function submitServiceForm(e) {
    e.preventDefault();

    const form = document.getElementById('serviceForm');
    const formData = new FormData(form);
    const unitId = formData.get('unit_id');

    fetch('/fleet/add_service', {
        method: 'POST',
        body: formData
    })
    .then(res => {
        if (res.ok) {
            return fetch(`/fragment/fleet_unit_details/${unitId}`).then(r => r.text());
        } else {
            throw new Error("Ошибка при сохранении сервиса");
        }
    })
    .then(html => {
        document.querySelectorAll(".content-section").forEach(s => s.style.display = "none");
        const details = document.getElementById("unit_details_fragment");
        details.innerHTML = html;
        details.style.display = "block";

        initServiceFileParser();
    })
    .catch(err => {
        alert("❌ " + err.message);
    });
}

function initServiceFileParser() {
    const rightInput = document.getElementById('rightFileInput');
    const leftInput = document.getElementById('leftFileInput');

    if (rightInput && leftInput) {
        rightInput.addEventListener('change', () => {
            if (rightInput.files.length > 0) {
                leftInput.files = rightInput.files;

                const file = rightInput.files[0];
                console.log("📂 Выбран файл:", file.name);

                const formData = new FormData();
                formData.append('file', file);

                fetch('/api/analyze_service_file', {
                    method: 'POST',
                    body: formData
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.fields) {
                        const f = data.fields;

                        const parseDate = (d) => {
                            const parts = d.split('/');
                            return parts.length === 3
                                ? `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
                                : '';
                        };

                        const cleanNumber = (str) => {
                            if (!str) return '';
                            return str.replace(/[^\d.]/g, '');
                        };

                        document.querySelector('[name="date"]').value = parseDate(f.date || '');
                        document.querySelector('[name="invoice_no"]').value = f.invoice_no || '';
                        document.querySelector('[name="shop"]').value = f.shop || '';
                        document.querySelector('[name="shop_address"]').value = f.shop_address || '';
                        document.querySelector('[name="phone_number"]').value = f.phone_number || '';
                        document.querySelector('[name="mileage"]').value = cleanNumber(f.mileage);
                        document.querySelector('[name="amount"]').value = cleanNumber(f.amount);
                        document.querySelector('[name="description"]').value = f.description || '';
                    } else {
                        alert("GPT didn't return expected data");
                    }
                })
                .catch(err => {
                    console.error("Ошибка анализа:", err);
                    alert("Ошибка при анализе документа");
                });
            }
        });

        leftInput.addEventListener('change', () => {
            if (leftInput.files.length > 0) {
                rightInput.files = leftInput.files;
            }
        });
    } else {
        console.warn("⚠️ Не найден файл input (rightFileInput / leftFileInput)");
    }
}

function deleteService(serviceId, unitId) {
    if (!confirm("Удалить этот сервис/ремонт?")) return;

    fetch(`/fleet/delete_service/${serviceId}`, {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            return fetch(`/fragment/fleet_unit_details/${unitId}`).then(r => r.text());
        } else {
            throw new Error(data.error || "Не удалось удалить");
        }
    })
    .then(html => {
        const details = document.getElementById("unit_details_fragment");
        details.innerHTML = html;
        details.style.display = "block";
        initServiceFileParser(); // обновляем слушатели
    })
    .catch(err => {
        alert("❌ " + err.message);
    });
}
