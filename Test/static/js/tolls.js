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
            // Скрываем все секции
            Object.values(navButtons).forEach(sectionId => {
                document.getElementById(sectionId).style.display = 'none';
            });

            // Деактивируем все кнопки
            Object.keys(navButtons).forEach(id => {
                document.getElementById(id).classList.remove('active');
            });

            // Активируем текущую
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
            alert('Транспондер добавлен');
            form.reset();
            bootstrap.Offcanvas.getInstance(document.getElementById('addTransponderModal')).hide();
            loadTransponders(); // перезагрузить список
        } else {
            alert('Ошибка при сохранении');
        }
    });
}

async function loadTransponders() {
    const tbody = document.getElementById('transpondersTableBody');
    tbody.innerHTML = ''; // очистка

    try {
        const res = await fetch('/api/transponders');
        const data = await res.json();

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
                `;
                tbody.appendChild(row);
            });
        }
    } catch (err) {
        console.error("Ошибка загрузки транспондеров:", err);
    }
}