function initBrokerCustomerSection() {
    console.log("Инициализация блока Брокеры/Кастомеры...");

    const tabBrokers = document.getElementById("tab-brokers");
    const tabCustomers = document.getElementById("tab-customers");
    const brokersTable = document.getElementById("brokersTableBlock");
    const customersTable = document.getElementById("customersTableBlock");

    tabBrokers?.addEventListener("click", () => {
        tabBrokers.classList.add("active");
        tabCustomers.classList.remove("active");
        brokersTable.style.display = "block";
        customersTable.style.display = "none";
    });

    tabCustomers?.addEventListener("click", () => {
        tabCustomers.classList.add("active");
        tabBrokers.classList.remove("active");
        customersTable.style.display = "block";
        brokersTable.style.display = "none";
    });

    const modal = document.getElementById("addBrokerCustomerModal");
    const backdrop = document.getElementById("brokerCustomerBackdrop");

    document.getElementById("openAddBrokerCustomerBtn").addEventListener("click", () => {
        document.getElementById("brokerCustomerForm").reset();
        document.getElementById("mcDotBlock").style.display = "none";
        modal.classList.add("show");
        backdrop.classList.add("show");
    });

    document.getElementById("entityTypeSelect").addEventListener("change", (e) => {
        const type = e.target.value;
        document.getElementById("mcDotBlock").style.display = type === "broker" ? "block" : "none";
    });
}

function closeBrokerCustomerModal() {
    document.getElementById("addBrokerCustomerModal").classList.remove("show");
    document.getElementById("brokerCustomerBackdrop").classList.remove("show");
}
