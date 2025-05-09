function initFleetUnitClicks() {
    document.querySelectorAll(".clickable-row").forEach(row => {
        row.addEventListener("click", () => {
            const unitId = row.dataset.id;
            fetch(`/fragment/fleet_unit_details/${unitId}`)
                .then(res => res.text())
                .then(html => {
                    // Скрыть все секции
                    document.querySelectorAll(".content-section").forEach(s => s.style.display = "none");

                    const details = document.getElementById("unit_details_fragment");
                    details.innerHTML = html;
                    details.style.display = "block";
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
    })
    .catch(err => {
        alert("❌ " + err.message);
    });
}
