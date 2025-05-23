function openCompanyModal() {
    const modal = document.getElementById("addCompanyModal");
    if (modal) {
        modal.classList.add("show");
    }
}

function closeCompanyModal() {
    const modal = document.getElementById("addCompanyModal");
    if (modal) {
        modal.classList.remove("show");
    }
}

function initCompanyForm() {
    const form = document.getElementById("addCompanyForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const payload = {};
        for (let [key, value] of formData.entries()) {
            payload[key] = value;
        }

        try {
            const res = await fetch("/api/add_company", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                closeCompanyModal();
                location.reload();
            } else {
                alert("Ошибка при добавлении компании");
            }
        } catch (err) {
            console.error("Ошибка при запросе:", err);
            alert("Ошибка сети или сервера");
        }
    });
}

document.addEventListener("DOMContentLoaded", initCompanyForm);
