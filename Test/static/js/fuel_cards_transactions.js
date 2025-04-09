//загружает fuel card transaction fragment
function setupFuelCardTransactionsButton() {
    document.getElementById('btn-open-fuel-transactions')?.addEventListener('click', () => {
        fetch('/fragment/fuel_cards_transactions')
            .then(res => res.text())
            .then(html => {
                const section = document.getElementById('section-fuel-cards');
                section.innerHTML = html;
                loadFuelCardTransactions();
            })
            .catch(err => {
                console.error("Ошибка загрузки транзакций:", err);
            });
    });
}

function loadFuelCardTransactions() {
    fetch('/fuel_cards/transactions')
        .then(res => res.json())
        .then(transactions => {
            const tbody = document.querySelector('#transactions-table tbody');
            tbody.innerHTML = '';

            transactions.forEach(tx => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${tx.billing_range || ''}</td>
                    <td>${tx.date || ''}</td>
                    <td>${tx.card_number || ''}</td>
                    <td>${tx.driver_id || ''}</td>
                    <td>${tx.vehicle_id || ''}</td>
                    <td>${tx.qty ?? ''}</td>
                    <td>${tx.fuel_total ?? ''}</td>
                    <td>${tx.retail_price ?? ''}</td>
                    <td>${tx.invoice_total ?? ''}</td>
                    <td>${tx.driver_name || ''}</td>
                `;
                tbody.appendChild(row);
            });
        })
        .catch(err => {
            console.error('Ошибка загрузки транзакций:', err);
        });
}
