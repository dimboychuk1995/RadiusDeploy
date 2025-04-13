document.addEventListener("DOMContentLoaded", () => {
    // пока пустой
});

function addExtraPickup() {
    const container = document.getElementById("extra-pickups-container");
    const index = container.children.length;

    const html = `
        <div class="border p-3 mb-2 bg-light rounded">
            <div class="form-group">
                <label>Компания</label>
                <input type="text" class="form-control" name="extra_pickup[${index}][company]">
            </div>
            <div class="form-group">
                <label>Адрес</label>
                <input type="text" class="form-control" name="extra_pickup[${index}][address]">
            </div>
            <div class="form-group">
                <label>Дата</label>
                <input type="date" class="form-control" name="extra_pickup[${index}][date]">
            </div>
            <div class="form-group">
                <label>Инструкции</label>
                <textarea class="form-control" name="extra_pickup[${index}][instructions]"></textarea>
            </div>
            <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">Удалить</button>
        </div>
    `;
    container.insertAdjacentHTML("beforeend", html);
}

function addExtraDelivery() {
    const container = document.getElementById("extra-deliveries-container");
    const index = container.children.length;

    const html = `
        <div class="border p-3 mb-2 bg-light rounded">
            <div class="form-group">
                <label>Компания</label>
                <input type="text" class="form-control" name="extra_delivery[${index}][company]">
            </div>
            <div class="form-group">
                <label>Адрес</label>
                <input type="text" class="form-control" name="extra_delivery[${index}][address]">
            </div>
            <div class="form-group">
                <label>Дата</label>
                <input type="date" class="form-control" name="extra_delivery[${index}][date]">
            </div>
            <div class="form-group">
                <label>Инструкции</label>
                <textarea class="form-control" name="extra_delivery[${index}][instructions]"></textarea>
            </div>
            <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">Удалить</button>
        </div>
    `;
    container.insertAdjacentHTML("beforeend", html);
}
