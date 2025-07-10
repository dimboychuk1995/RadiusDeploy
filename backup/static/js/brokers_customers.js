let editMode = false;
let editId = null;

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
    editMode = false;
    editId = null;

    document.getElementById("brokerCustomerModalTitle").textContent = "Добавить";
    document.getElementById("brokerCustomerForm").reset();
    document.getElementById("entityTypeSelect").disabled = false;
    document.getElementById("entityTypeSelect").value = "";

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

  document.getElementById("brokerCustomerForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const type = document.getElementById("entityTypeSelect").value;
    const payload = {
      type,
      id: editMode ? editId : undefined,
      mc: document.getElementById("mcInput").value,
      dot: document.getElementById("dotInput").value,
      name: document.getElementById("nameInput").value,
      phone: document.getElementById("phoneInput").value,
      email: document.getElementById("emailInput").value,
      contact_person: document.getElementById("contactPersonInput").value,
      contact_phone: document.getElementById("contactPhoneInput").value,
      contact_email: document.getElementById("contactEmailInput").value,
      address: document.getElementById("addressInput").value,
      payment_term: document.getElementById("paymentTermInput").value
    };

    const url = editMode ? "/api/update_broker_customer" : "/api/add_broker_customer";

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        alert("Сохранено!");
        closeBrokerCustomerModal();
        location.reload();
      } else {
        alert("Ошибка: " + (data.error || "неизвестно"));
      }
    } catch (e) {
      console.error("Ошибка:", e);
      alert("Сетевая ошибка");
    }
  });
}

function closeBrokerCustomerModal() {
  document.getElementById("addBrokerCustomerModal").classList.remove("show");
  document.getElementById("brokerCustomerBackdrop").classList.remove("show");
  document.getElementById("entityTypeSelect").disabled = false;
}

function deleteBrokerCustomer(id, type) {
  if (!confirm("Вы уверены, что хотите удалить?")) return;

  fetch(`/api/delete_broker_customer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, type })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        const row = document.getElementById(`row-${type}-${id}`);
        if (row) row.remove();
      } else {
        alert("Ошибка удаления: " + (data.error || "неизвестно"));
      }
    })
    .catch(err => {
      console.error("Ошибка:", err);
      alert("Сетевая ошибка");
    });
}

function editBrokerCustomer(id, type) {
  const row = document.getElementById(`row-${type}-${id}`);
  if (!row) return;

  editMode = true;
  editId = id;

  document.getElementById("brokerCustomerForm").reset();
  document.getElementById("commonFieldsBlock").style.display = "block";
  document.getElementById("mcDotBlock").style.display = type === "broker" ? "block" : "none";
  document.getElementById("entityTypeSelect").value = type;
  document.getElementById("entityTypeSelect").disabled = true;

  const getValue = field => row.querySelector(`[data-field="${field}"]`)?.textContent.trim() || "";

  document.getElementById("mcInput").value = getValue("mc");
  document.getElementById("dotInput").value = getValue("dot");
  document.getElementById("nameInput").value = getValue("name");
  document.getElementById("phoneInput").value = getValue("phone");
  document.getElementById("emailInput").value = getValue("email");
  document.getElementById("contactPersonInput").value = getValue("contact_person");
  document.getElementById("contactPhoneInput").value = getValue("contact_phone");
  document.getElementById("contactEmailInput").value = getValue("contact_email");
  document.getElementById("addressInput").value = getValue("address");
  document.getElementById("paymentTermInput").value = getValue("payment_term");

  document.getElementById("brokerCustomerModalTitle").textContent = "Редактировать";
  document.getElementById("addBrokerCustomerModal").classList.add("show");
  document.getElementById("brokerCustomerBackdrop").classList.add("show");
}