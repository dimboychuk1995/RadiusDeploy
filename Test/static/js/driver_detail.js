console.log("🔧 driver_detail.js загружен");

function initDriverDetailActions() {
    console.log("🔧 initDriverDetailActions вызвана");

    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    const formElements = document.querySelectorAll('#editForm input, #editForm select');

    if (editBtn && saveBtn && formElements.length) {
        editBtn.addEventListener('click', function () {
            formElements.forEach(element => element.disabled = false);
            editBtn.classList.add('d-none');
            saveBtn.classList.remove('d-none');
        });
    }

    const backBtn = document.getElementById("backToDriversBtn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            localStorage.setItem("activeSection", "btn-drivers");
            window.location.href = "/";
        });
    }

    const form = document.getElementById("editForm");
    if (form) {
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            const formData = new FormData(form);
            const driverId = form.dataset.driverId;

            fetch(`/edit_driver/${driverId}`, {
                method: "POST",
                body: formData
            })
                .then(res => {
                    if (res.ok) {
                        localStorage.setItem("activeSection", "btn-drivers");
                        window.location.href = "/";
                    } else {
                        alert("❌ Ошибка при сохранении");
                    }
                })
                .catch(err => {
                    console.error("Ошибка запроса:", err);
                    alert("❌ Ошибка сети");
                });
        });
    }
}
