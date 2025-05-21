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

document.getElementById("brokerCustomerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const type = document.getElementById("entityTypeSelect").value;
  const payload = {
      type,
      mc: document.getElementById("mcInput").value,
      dot: document.getElementById("dotInput").value,
      name: document.getElementById("nameInput").value,
      phone: document.getElementById("phoneInput").value, // ✅ новое поле
      email: document.getElementById("emailInput").value,
      contact_person: document.getElementById("contactPersonInput").value,
      contact_phone: document.getElementById("contactPhoneInput").value,
      contact_email: document.getElementById("contactEmailInput").value,
      address: document.getElementById("addressInput").value,
      payment_term: document.getElementById("paymentTermInput").value
    };

  try {
    const res = await fetch("/api/add_broker_customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert("Успешно добавлено!");
      closeBrokerCustomerModal();
      location.reload(); // или перезагрузка только таблиц
    } else {
      const err = await res.json();
      alert("Ошибка: " + (err.error || "Неизвестная"));
    }
  } catch (e) {
    console.error("Ошибка запроса:", e);
    alert("Сетевая ошибка");
  }
});

}

function closeBrokerCustomerModal() {
  document.getElementById("addBrokerCustomerModal").classList.remove("show");
  document.getElementById("brokerCustomerBackdrop").classList.remove("show");
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
