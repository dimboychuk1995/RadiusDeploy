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
            Object.values(navButtons).forEach(sectionId => {
                document.getElementById(sectionId).style.display = 'none';
            });

            Object.keys(navButtons).forEach(id => {
                document.getElementById(id).classList.remove('active');
            });

            button.classList.add('active');
            document.getElementById(navButtons[btnId]).style.display = 'block';
        });
    });
}

function openTransponderModal() {
    const modal = document.getElementById('addTransponderModal');
    modal.classList.add('show');
    document.querySelector('.custom-offcanvas-backdrop').classList.add('show');
}

function closeTransponderModal() {
    const modal = document.getElementById('addTransponderModal');
    modal.classList.remove('show');
    document.querySelector('.custom-offcanvas-backdrop').classList.remove('show');
}

function initTransponderForm() {
    const form = document.getElementById('transponderForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const data = {};
        formData.forEach((val, key) => data[key] = val);

        const res = await fetch('/api/transponders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            form.reset();
            closeTransponderModal();
            document.getElementById('btn-transponders').click();
            setTimeout(() => loadTransponders(), 200);
        } else {
            alert('Ошибка при сохранении');
        }
    });
}

function loadTransponders() {
    const tbody = document.getElementById('transpondersTableBody');
    tbody.innerHTML = '';

    fetch('/api/transponders')
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                data.forEach(item => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${item.serial_number || ''}</td>
                        <td>${item.vehicle_class || ''}</td>
                        <td>${item.transponder_type || ''}</td>
                        <td>${item.status || ''}</td>
                        <td>${item.vehicle || ''}</td>
                        <td>${item.provider || ''}</td>
                        <td>
                            <button class="btn btn-sm btn-danger" onclick="deleteTransponder('${item._id}')">Удалить</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            }
        })
        .catch(err => console.error("Ошибка загрузки транспондеров:", err));
}

function initVehicleSelect() {
    const $select = $('#vehicleSelect');
    if (!$select.length) return;

    $select.select2({
        placeholder: 'Выберите юнит',
        allowClear: true,
        ajax: {
            url: '/api/trucks',
            dataType: 'json',
            delay: 250,
            processResults: function (data) {
                return {
                    results: data
                };
            }
        },
        dropdownParent: $('#addTransponderModal')
    });
}

function deleteTransponder(id) {
    if (!confirm("Удалить этот транспондер?")) return;

    fetch(`/api/transponders/${id}`, {
        method: 'DELETE'
    })
    .then(res => {
        if (res.ok) {
            loadTransponders();
        } else {
            alert("Ошибка при удалении");
        }
    })
    .catch(err => {
        console.error("Ошибка:", err);
        alert("Ошибка при удалении");
    });
}

function initCsvUpload() {
    const input = document.getElementById('transponderCsvInput');
    if (!input) return;

    input.onchange = async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const text = await file.text();
        const delimiter = text.includes(',') ? ',' : '\t';

        const rows = text.split('\n').map(r => r.trim()).filter(Boolean);
        if (rows.length < 2) {
            alert("Файл пуст или содержит только заголовки");
            return;
        }

        const transponders = [];
        for (let i = 1; i < rows.length; i++) {
            const cols = rows[i].split(delimiter).map(c =>
                c.trim().replace(/^"(.*)"$/, '$1')  // удаляем кавычки
            );

            if (cols.length < 4 || cols.every(c => !c)) continue;

            const obj = {
                serial_number: cols[0] || '',
                vehicle_class: cols[1] || '',
                transponder_type: cols[2] || '',
                status: cols[3] || ''
            };

            // нормализуем serial_number
            if (obj.serial_number) {
                obj.serial_number = obj.serial_number.replace(/^"+|"+$/g, '').trim();
            }

            transponders.push(obj);
        }

        console.log("📥 Готово к отправке:", transponders);

        if (!transponders.length) {
            alert("Нет данных для импорта.");
            return;
        }

        const res = await fetch('/api/transponders/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: transponders })
        });

        if (res.ok) {
            const result = await res.json();
            alert(`Импорт завершён:\n✅ Добавлено: ${result.inserted}\n🔁 Обновлено: ${result.updated}\n⏩ Пропущено: ${result.skipped}`);
            loadTransponders();
        } else {
            alert('Ошибка при импорте');
        }
    };
}



