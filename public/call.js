const waitingOrdersEl = document.querySelector("#waitingOrders");
const calledOrdersEl = document.querySelector("#calledOrders");
const waitingCountEl = document.querySelector("#waitingCount");
const connectionBanner = document.querySelector("#connectionBanner");
const PIN_KEY = "drunk-as-mud-call-pin";

let orders = [];
let ws = null;
let reconnectTimer = null;
let authenticated = false;

function connect() {
  const protocol =
    location.protocol === "https:"
      ? "wss"
      : "ws";

  ws = new WebSocket(`${protocol}://${location.host}`);

  ws.addEventListener(
    "open",
    () => {
      connectionBanner.classList.add("hidden");
      authenticated = false;
      authenticate();
    }
  );

  ws.addEventListener(
    "close",
    () => {
      authenticated = false;
      connectionBanner.classList.remove("hidden");
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 1500);
    }
  );

  ws.addEventListener(
    "message",
    (event) => {
      let data;

      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      handleMessage(data);
    }
  );
}

function getPin() {
  let pin = sessionStorage.getItem(PIN_KEY);

  if (pin) {
    return pin;
  }

  pin = window.prompt("請輸入叫號台 PIN");

  if (!pin) {
    return null;
  }

  pin = pin.trim();

  if (!pin) {
    return null;
  }

  sessionStorage.setItem(PIN_KEY, pin);

  return pin;
}

function authenticate() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const pin = getPin();

  if (!pin) {
    return;
  }

  ws.send(
    JSON.stringify({
      type: "auth",
      role: "call",
      pin
    })
  );
}

function handleMessage(data) {
  if (data.type === "auth-result") {
    handleAuthResult(data);
    return;
  }

  if (data.type === "console-state") {
    orders =
      Array.isArray(data.orders)
        ? data.orders
        : [];

    render();
    return;
  }

  if (data.type === "new-order") {
    const exists =
      orders.some(
        (order) =>
          order.id === data.order.id
      );

    if (!exists) {
      orders.push(data.order);
    }
    render();
    return;
  }

  if (data.type === "called") {
    updateOrder(data.order);
    render();
    return;
  }

  if (data.type === "finished") {
    updateOrder(data.order);
    render();
    return;
  }

  if (data.type === "orders-cleared") {
    orders = [];
    render();
    return;
  }
}

function handleAuthResult(data) {
  if (data.ok && data.role === "call") {
    authenticated = true;
    ws.send(JSON.stringify({type: "get-console-state"}));
    return;
  }

  authenticated = false;
  sessionStorage.removeItem(PIN_KEY);
  window.alert("叫號台 PIN 錯誤");
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
}

function renderOrders() {
  const waiting =
    orders
      .filter(
        (order) =>
          order.status === "waiting"
      )
      .sort(
        (a, b) =>
          a.id - b.id
      );

  const called =
    orders
      .filter(
        (order) =>
          order.status === "called"
      )
      .sort(
        (a, b) =>
          a.id - b.id
      );

  waitingCountEl.textContent = waiting.length;
  waitingOrdersEl.innerHTML = "";
  calledOrdersEl.innerHTML = "";

  if (waiting.length === 0) {
    waitingOrdersEl.innerHTML =
      `<p class="muted">
        目前沒有等待中的訂單。
      </p>`;
  }

  for (
    const order
    of waiting
  ) {
    waitingOrdersEl
      .appendChild(
        makeOrderRow(
          order,
          [
            {
              label: "叫號",
              type: "call",
              className: ""
            }
          ]
        )
      );
  }

  if (called.length === 0) {
    calledOrdersEl.innerHTML =
      `<p class="muted">
        目前沒有已叫號訂單。
      </p>`;
  }

  for (
    const order
    of called
  ) {
    calledOrdersEl
      .appendChild(
        makeOrderRow(
          order,
          [
            {
              label:
                "重新叫號",
              type: "recall",
              className:
                "secondary"
            },
            {
              label: "完成",
              type: "finish",
              className: ""
            }
          ]
        )
      );
  }
}

function makeOrderRow(order, actions) {
  const row = document.createElement("div");
  row.className = "order";

  const no = document.createElement("strong");
  no.textContent = `#${order.id}`;

  const itemBox = document.createElement("div");
  const itemName = document.createElement("div");
  itemName.textContent = order.item;
  itemBox.appendChild(itemName);

  if (order.note) {
    const note = document.createElement("small");

    note.className = "order-note";
    note.textContent = `附註：${order.note}`;
    itemBox.appendChild(note);
  }

  const actionBox = document.createElement("div");
  actionBox.className = "action-box";

  for (
    const action
    of actions
  ) {
    const button = document.createElement("button");
    button.textContent = action.label;

    if (action.className) {
      button.className = action.className;
    }

    button.addEventListener("click",
      () => {
        sendAction(
          action.type,
          order.id
        );
      }
    );

    actionBox.appendChild(button);
  }

  row.append(no, itemBox, actionBox);
  return row;
}

function sendAction(type, id) {
  if (!authenticated) {
    window.alert("尚未登入叫號台。");
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    window.alert("目前未連線，請稍後再試。");
    return;
  }

  ws.send(
    JSON.stringify({
      type,
      id
    })
  );
}

connect();
