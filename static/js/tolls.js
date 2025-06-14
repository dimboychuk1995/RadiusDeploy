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

    document.getElementById('loadMoreTollsBtn')?.addEventListener('click', () => {
        loadAllTolls(currentOffset, limitPerPage, true);
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
            if (!Array.isArray(data)) return;

            fetch('/api/trucks')
                .then(res => res.json())
                .then(trucks => {
                    data.forEach(item => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${item.serial_number || ''}</td>
                            <td>${item.vehicle_class || ''}</td>
                            <td>${item.transponder_type || ''}</td>
                            <td>${item.status || ''}</td>
                            <td>
                                <select class="form-control form-control-sm vehicle-select" data-id="${item._id}">
                                    <option value="">—</option>
                                </select>
                            </td>
                            <td>${item.provider || ''}</td>
                            <td>
                                <button class="btn btn-sm btn-danger" onclick="deleteTransponder('${item._id}')">Удалить</button>
                            </td>
                        `;
                        tbody.appendChild(row);
                    });

                    // Заполняем все <select> списком юнитов
                    document.querySelectorAll('.vehicle-select').forEach(select => {
                        const id = select.dataset.id;
                        const row = data.find(row => row._id === id);
                        trucks.forEach(truck => {
                            const option = document.createElement('option');
                            option.value = truck.id;
                            option.textContent = truck.text;
                            if (row.vehicle === truck.id) {
                                option.selected = true;
                            }
                            select.appendChild(option);
                        });

                        // При изменении значения — отправляем PATCH
                        select.addEventListener('change', () => {
                            fetch(`/api/transponders/${id}/assign_vehicle`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ vehicle: select.value })
                            }).then(res => {
                                if (!res.ok) alert('Ошибка при обновлении юнита');
                            });
                        });
                    });
                });
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
            Swal.fire({
              icon: 'success',
              title: 'Импорт завершён ✅',
              html: `
                <b>Добавлено:</b> ${result.inserted}<br>
                <b>Обновлено:</b> ${result.updated}<br>
                <b>Пропущено:</b> ${result.skipped}
              `,
              timer: 4000,
              showConfirmButton: false
            });
            loadTransponders();
        } else {
            alert('Ошибка при импорте');
        }
    };
}


function openTollModal() {
    document.getElementById('addTollModal').classList.add('show');
    document.querySelector('.custom-offcanvas-backdrop').classList.add('show');
}

function closeTollModal() {
    document.getElementById('addTollModal').classList.remove('show');
    document.querySelector('.custom-offcanvas-backdrop').classList.remove('show');
}

function initTollForm() {
    const form = document.getElementById('tollForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const data = {};
        formData.forEach((val, key) => {
            if (val) data[key] = val;
        });

        const res = await fetch('/api/tolls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            form.reset();
            closeTollModal();
            Swal.fire({
              icon: 'success',
              title: 'Готово!',
              text: 'Toll успешно добавлен ✅',
              timer: 2000,
              showConfirmButton: false
            });
            // TODO: loadAllTolls(); если будет отображение
        } else {
            alert("Ошибка при добавлении Toll");
        }
    });
}


let currentOffset = 0;
const limitPerPage = 30;

function loadAllTolls(offset = 0, limit = 30, append = false) {
    const tbody = document.getElementById('allTollsTableBody');
    if (!append) tbody.innerHTML = '';

    fetch(`/api/all_tolls?offset=${offset}&limit=${limit}`)
        .then(res => res.json())
        .then(data => {
            if (!Array.isArray(data)) return;

            data.forEach(toll => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${toll.tag_id || ''}</td>
                    <td>${toll.posting_date || ''}</td>
                    <td>${toll.exit_date || ''}</td>
                    <td>${toll.lane || ''}</td>
                    <td>${toll.direction || ''}</td>
                    <td>${toll.plaza || ''}</td>
                    <td>${toll.license_plate || ''}</td>
                    <td>${toll.state || ''}</td>
                    <td>${toll.collection_type || ''}</td>
                    <td>${toll.amount || ''}</td>
                    <td>${toll.agency || ''}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="deleteToll('${toll._id}')">Удалить</button>
                    </td>
                `;
                tbody.appendChild(row);
            });

            currentOffset += data.length;

            // показать кнопку "Показать ещё", если пришло limit записей
            const moreBtn = document.getElementById('loadMoreTollsBtn');
            if (data.length === limit) {
                moreBtn.style.display = 'block';
            } else {
                moreBtn.style.display = 'none';
            }
        })
        .catch(err => {
            console.error("Ошибка загрузки Toll'ов:", err);
        });
}


function deleteToll(id) {
    if (!confirm("Удалить этот Toll?")) return;

    fetch(`/api/tolls/${id}`, {
        method: 'DELETE'
    })
    .then(res => {
        if (res.ok) {
            loadAllTolls();
        } else {
            alert("Ошибка при удалении");
        }
    })
    .catch(err => {
        console.error("Ошибка удаления Toll:", err);
        alert("Ошибка при удалении");
    });
}


function initTollCsvUpload() {
    const input = document.getElementById('tollCsvInput');
    if (!input) return;

    input.onchange = async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const text = await file.text();
        const delimiter = text.includes(',') ? ',' : '\t';

        const rows = text.split('\n').map(r => r.trim()).filter(Boolean);
        if (rows.length < 2) {
            Swal.fire({
              icon: 'warning',
              title: 'Пустой файл',
              text: 'Файл пуст или содержит только заголовки'
            });
            return;
        }

        const headerMap = {
            "Account Number": "account_number",
            "First Name": "first_name",
            "Last Name": "last_name",
            "TAG ID": "tag_id",
            "Posting Date": "posting_date",
            "Exit Date": "exit_date",
            "Lane": "lane",
            "Direction": "direction",
            "Plaza": "plaza",
            "License Plate": "license_plate",
            "State": "state",
            "Collection Type": "collection_type",
            "Amount": "amount",
            "Agency": "agency"
        };

        const formatDateTime = (str) => {
            if (!str) return '';
            const [datePart, timePart] = str.trim().split(' ');
            const [year, month, day] = datePart.split(/[\/\-\.]/);
            if (year && month && day) {
                const dateFormatted = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
                return timePart ? `${dateFormatted} ${timePart}` : dateFormatted;
            }
            return str;
        };

        const originalHeaders = rows[0].split(delimiter).map(h =>
            h.trim().replace(/^"(.*)"$/, '$1')
        );

        const mappedHeaders = originalHeaders.map(h => headerMap[h] || null);

        const tolls = [];

        for (let i = 1; i < rows.length; i++) {
            const cols = rows[i].split(delimiter).map(c =>
                c.trim().replace(/^"(.*)"$/, '$1')
            );

            const obj = {};
            mappedHeaders.forEach((key, idx) => {
                if (key && cols[idx] !== undefined) {
                    let val = cols[idx].trim();
                    if (key === 'amount') {
                        val = parseFloat(val.replace('$', '').replace(',', '')) || 0;
                    } else if (key === 'posting_date' || key === 'exit_date') {
                        val = formatDateTime(val);
                    }
                    obj[key] = val;
                }
            });

            if (Object.keys(obj).length > 0) {
                tolls.push(obj);
            }
        }

        if (!tolls.length) {
            Swal.fire({
              icon: 'warning',
              title: 'Нет данных',
              text: 'Нет валидных строк для импорта.'
            });
            return;
        }

        Swal.fire({
          title: 'Импортируется...',
          html: 'Пожалуйста, подождите',
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        try {
            const res = await fetch('/api/tolls/bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: tolls })
            });

            if (res.ok) {
                const result = await res.json();
                Swal.fire({
                  icon: 'success',
                  title: 'Импорт завершён ✅',
                  html: `
                    <b>Добавлено:</b> ${result.inserted}<br>
                    <b>Обновлено:</b> ${result.updated}<br>
                    <b>Пропущено:</b> ${result.skipped}
                  `,
                  timer: 4000,
                  showConfirmButton: false
                });
                loadAllTolls();
            } else {
                Swal.fire({
                  icon: 'error',
                  title: 'Ошибка',
                  text: 'Не удалось импортировать Toll\'ы.'
                });
            }
        } catch (error) {
            Swal.fire({
              icon: 'error',
              title: 'Ошибка сети',
              text: 'Сервер не отвечает или произошла ошибка запроса.'
            });
            console.error("Ошибка при импорте:", error);
        }
    };
}



function loadTollsSummary(start = null, end = null) {
    const tbody = document.getElementById('tollsSummaryTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    let url = '/api/tolls_summary';
    if (start && end) {
        url += `?start_date=${start}&end_date=${end}`;
    }

    fetch(url)
        .then(res => res.json())
        .then(data => {
            data.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.serial_number}</td>
                    <td>${item.driver_name || ''}</td>
                    <td>${item.unit_number}</td>
                    <td>${item.make}</td>
                    <td>${item.model}</td>
                    <td>${item.year}</td>
                    <td>${item.count}</td>
                    <td>$${item.total.toFixed(2)}</td>
                `;
                tbody.appendChild(row);
            });
        })
        .catch(err => {
            console.error("Ошибка загрузки Toll Summary:", err);
        });
}



function getWeekRange(baseDate) {
    const monday = new Date(baseDate);
    const day = monday.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1); // понедельник
    monday.setDate(diff);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6); // воскресенье

    return {
        start: formatDate(monday),
        end: formatDate(sunday)
    };
}

function formatDate(dateObj) {
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}

function populateTollSummaryWeeks() {
    const select = document.getElementById('tollSummaryWeekSelect');
    if (!select) return;

    const today = new Date();
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    for (let i = 0; i < 12; i++) {
        const range = getWeekRange(new Date(base.getFullYear(), base.getMonth(), base.getDate() - i * 7));
        const value = `${range.start}|${range.end}`;
        const label = `${range.start} – ${range.end}`;

        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;

        select.appendChild(option);
    }

    select.addEventListener('change', () => {
        const val = select.value;
        if (val) {
            const [start, end] = val.split('|');
            loadTollsSummary(start, end);
        } else {
            // Если выбрано "— Все недели —"
            document.getElementById('tollsSummaryTableBody').innerHTML = '';
        }
    });
}

