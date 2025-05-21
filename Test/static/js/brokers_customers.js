function initBrokerCustomerSection() {
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
    document.getElementById("commonFieldsBlock").style.display = "none";
    document.getElementById("mcDotBlock").style.display = "none";
    modal.classList.add("show");
    backdrop.classList.add("show");
  });

  document.getElementById("entityTypeSelect").addEventListener("change", (e) => {
    const type = e.target.value;
    const commonFields = document.getElementById("commonFieldsBlock");
    const mcDot = document.getElementById("mcDotBlock");

    if (type === "broker") {
      commonFields.style.display = "block";
      mcDot.style.display = "block";
    } else if (type === "customer") {
      commonFields.style.display = "block";
      mcDot.style.display = "none";
    } else {
      commonFields.style.display = "none";
    }
  });
}

function closeBrokerCustomerModal() {
  document.getElementById("addBrokerCustomerModal").classList.remove("show");
  document.getElementById("brokerCustomerBackdrop").classList.remove("show");
}