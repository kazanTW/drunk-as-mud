const waitingOrdersEl = document.querySelector("#waitingOrders");
const calledOrdersEl = document.querySelector("#calledOrders");
const waitingCountEl = document.querySelector("#waitingCount");
const menuListEl = document.querySelector("#menuList");
const menuForm = document.querySelector("#menuForm");
const menuInput = document.querySelector("#menuInput");
const clearOrdersBtn = document.querySelector("#clearOrdersBtn");
const connectionBanner = document.querySelector("#connectionBanner");
const PIN_KEY = "drunk-as-mud-admin-pin";

let orders = [];
let menu = [];
let ws = null;
let reconnectTimer = null;
let authenticated = false;

function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocol}://${location.host}`);

  ws.addEventListener("open", () => {
    connectionBanner.classList.add("hidden");
    authenticated = false;
    authenticate();
  });

  ws.addEventListener("close", () => {
    authenticated = false;
    connectionBanner.classList.remove("hidden");
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1500);
  });

  ws.addEventListener("message", (event) => {
    let data;

    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

     handleMessage(data);
  });
}

function getPin() {
  let pin = sessionStorage.getItem(PIN_KEY);

  if (pin) return pin;
  pin = window.prompt("請輸入後台 PIN 碼：");

  if (!pin) return null;
  pin = pin.trim();

  if (!pin) return null;
  sessionStorage.setItem(PIN_KEY, pin);
  return pin;
}

function authenticate() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const pin = getPin();
  if (!pin) return;

  ws.send(JSON.stringify({
    type: "auth",
    role: "admin",
    pin
  }));
}

function handleMessage(data) {
  if (data.type === "auth-result") {
    handleAuthResult(data);
    return;
  }

  if (data.type === "console-state") {
    orders = Array.isArray(data.orders) ? data.orders : [];
    menu = Array.isArray(data.menu) ? data.menu : [];
    console.log("console-state received: ", data);
    render();
    return;
  }

  if (data.type === "new-order") {
    const exists = orders.some((order) => order.id === data.order.id);
    if (!exists) orders.push(data.order);
    console.log("new-order received: ", data.order);
    renderOrders();
    return;
  }

  if (data.type === "called") {
    updateOrder(data.order);
    renderOrders();
    return;
  }

  if (data.type === "finished") {
    updateOrder(data.order);
    renderOrders();
    return;
  }

  if (data.type === "orders-cleared") {
    orders = [];
    renderOrders();
    return;
  }

  if (data.type === "menu-updated") {
    if (!authenticated) return;
    menu = Array.isArray(data.menu) ? data.menu : [];
    renderMenu();
    return;
  }
}

function handleAuthResult(data) {
  if (data.ok && data.role === "admin") {
    authenticated = true;
    ws.send(JSON.stringify({type: "get-console-state"}));
    return;
  }

  authenticated = false;
  sessionStorage.removeItem(PIN_KEY);
  window.alert("後台 PIN 錯誤");
  setTimeout(() => authenticate(), 0);
}

function updateOrder(updated) {
  const index = orders.findIndex((order) => order.id === updated.id);
  if (index !== -1) {
    orders[index] = updated;
  } else {
    orders.push(updated);
  }
}

function render() {
  renderOrders();
  renderMenu();
}

function renderOrders() {
  const waiting = orders
    .filter((order) => order.status === "waiting")
    .sort((a, b) => a.id - b.id);

  const called = orders
    .filter((order) => order.status === "called")
    .sort((a, b) => a.id - b.id);

  waitingCountEl.textContent = waiting.length;
  waitingOrdersEl.innerHTML = "";
  calledOrdersEl.innerHTML = "";

  if (waiting.length === 0) {
    waitingOrdersEl.innerHTML = `<p class="muted">目前沒有等待中的訂單。</p>`;
  }

  for (const order of waiting) {
    waitingOrdersEl.appendChild(
      makeOrderRow(order, [
        {
          label: "叫號",
          type: "call",
          className: ""
        }
      ])
    );
  }

  if (called.length == 0) {
    calledOrdersEl.innerHTML = `<p class="muted">目前沒有已叫號訂單。</p>`;
  }

  for (const order of called) {
    calledOrdersEl.appendChild(
      makeOrderRow(order, [
          {
            label: "重新叫號",
            type: "recall",
            className: "secondary"
          },
          {
            label: "完成",
            type: "finish",
            className: ""
          }
      ])
    );
  }
}

function makeOrderRow(order, actions) {
  const row = document.createElement("div");
  row.className = "order";

  const no = document.createElement("strong");
  no.className = "order-number";
  no.textContent = `#${order.id}`;

  const itemBox = document.createElement("div");
  itemBox.className = "order-content";

  const itemName = document.createElement("div");
  itemName.className = "order-item-name";
  itemName.textContent = order.item || "（未命名品項）";

  itemBox.appendChild(itemName);

  if (order.note) {
    const note = document.createElement("div");
    note.className = "order-note";
    note.textContent = `附註：${order.note}`;
    itemBox.appendChild(note);
  }

  const actionBox = document.createElement("div");
  actionBox.className = "action-box";

  for (const action of actions) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = action.label;

    if (action.className) button.classList.add(action.className);

    button.addEventListener("click", () => {
      sendOrderAction(action.type, order.id);
    });

    actionBox.appendChild(button);
  }

  row.append(no, itemBox, actionBox);
  return row;
}

function renderMenu() {
  menuListEl.innerHTML = "";

  if (menu.length === 0) {
    menuListEl.innerHTML = `<p class="muted">目前沒有菜單品項。</p>`;
    return;
  }

  for (const item of menu) {
    const row = document.createElement("div");
    row.className = "menu-admin-item";

    const label = document.createElement("span");
    label.textContent = item;

    const remove = document.createElement("button");
    remove.textContent = "刪除";
    remove.className = "danger small";
    remove.addEventListener("click", () => {
      if (!window.confirm(`確定要刪除「${item}」嗎？`)) return;
      sendMessage({
        type: "remove-menu-item",
        item
      });
    });

    row.append(label, remove);
    menuListEl.appendChild(row);
  }
}

function sendMessage(payload) {
  if (!authenticated) {
    window.alert("尚未登入後台。");
    return false;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    window.alert("目前未連線，請稍後再試。");
    return false;
  }

  ws.send(JSON.stringify(payload));
  return true;
}

function sendOrderAction(type, id) {
  sendMessage({
    type,
    id
  });
}

menuForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const item = menuInput.value.trim();
  if (!item) return;

  const sent = sendMessage({
    type: "add-menu-item",
    item
  });

  if (sent) {
    menuInput.value = "";
    menuInput.focus();
  }
});

clearOrdersBtn.addEventListener("click", () => {
  const confirmed = window.confirm(
          [
            "確定要清空全部訂單嗎？",
            "",
            "這會：",
            "• 移除等待中訂單",
            "• 移除已叫號訂單",
            "• 清空叫號紀錄",
            "• 將下一號重設為 1"
          ].join("\n")
        );

  if (!confirmed) return;
  sendMessage({
    type: "clear-orders"
  });
});

connect();
