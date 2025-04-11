document.addEventListener("DOMContentLoaded", function () {
    const button = document.getElementById("samsaraToggle");
    let enabled = button.dataset.enabled === "true";

    function updateButton() {
        button.textContent = enabled ? "ON" : "OFF";
        button.classList.toggle("btn-outline-success", enabled);
        button.classList.toggle("btn-outline-danger", !enabled);
    }

    updateButton();

    button.addEventListener("click", () => {
        enabled = !enabled;
        updateButton();

        fetch("/api/integrations/samsara", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ enabled })
        });
    });
});
