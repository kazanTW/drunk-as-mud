const menuElement = document.querySelector("#menu");
const orderPage = document.querySelector("#orderPage");
const ticketPage = document.querySelector("#ticketPage");
const numberElement = document.querySelector("#number");
const itemElement = document.querySelector("#item");
const statusElement = document.querySelector("#status");
const newOrderBtn = document.querySelector("#newOrderBtn");
const connectionBanner = document.querySelector("#connectionBanner");
const ding = document.querySelector("#ding");

const CLIENT_KEY = "order-system-client-id";
const ORDER_KEY = "order-system-current-order";

function generateClientId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let clientId = localStorage.getItem(CLIENT_KEY);

if (!clientId) {
  clientId = generateClientId();
  localStorage.setItem(CLIENT_KEY, clientId);
}

let currentOrder = null;
let ws = null;
let reconnectTimer = null;

function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocol}://${location.host}`);

  ws.addEventListener("open", () => {
    connectionBanner.classList.add("hidden");

    const savedOrder = localStorage.getItem(ORDER_KEY);
    if (savedOrder) {
      try {
        currentOrder = JSON.parse(savedOrder);
        showTicket(currentOrder);
      } catch {
        localStorage.removeItem(ORDER_KEY);
      }
    }

    ws.send(JSON.stringify({
      type: "restore-order",
      clientId
    }));
  });

  ws.addEventListener("close", () => {
    connectionBanner.classList.remove("hidden");
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1500);
  });

  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "init") {
      renderMenu(data.menu);
      return;
    }

    if (data.type === "menu-updated") {
      renderMenu(data.menu);
      return;
    }

    if (data.type === "order-accepted") {
      if (data.order.clientId === clientId) {
        currentOrder = data.order;
        saveOrder();
        showTicket(currentOrder);
      }
      return;
    }

    if (data.type === "restore-result") {
      if (data.order) {
        currentOrder = data.order;
        saveOrder();
        showTicket(currentOrder);
      } else {
        clearCurrentOrder();
      }
      return;
    }

    if (data.type === "called" && data.order.clientId === clientId) {
      currentOrder = data.order;
      saveOrder();
      showTicket(currentOrder);
      notifyCalled(Boolean(data.recall));
      return;
    }

    if (data.type === "finished" && data.order.clientId === clientId) {
      currentOrder = data.order;
      saveOrder();
      showTicket(currentOrder);
      statusElement.textContent = "已完成，謝謝";
      newOrderBtn.classList.remove("hidden");
      return;
    }

    if (data.type === "orders-cleared") {
      clearCurrentOrder();
    }
  });
}

function renderMenu(menu) {
  menuElement.innerHTML = "";

  if (!menu.length) {
    menuElement.innerHTML = `<p class="muted">目前沒有可點的品項。</p>`;
    return;
  }

  for (const item of menu) {
    const button = document.createElement("button");
    button.textContent = item;
    button.addEventListener("click", () => confirmOrder(item));
    menuElement.appendChild(button);
  }
}

function confirmOrder(item) {
  if (currentOrder && currentOrder.status !== "finished") return;

  if (!window.confirm(`確認要點「${item}」嗎？`)) return;

  ws.send(JSON.stringify({
    type: "order",
    item,
    clientId
  }));
}

function showTicket(order) {
  orderPage.classList.add("hidden");
  ticketPage.classList.remove("hidden");

  numberElement.textContent = order.id;
  itemElement.textContent = order.item;

  if (order.status === "waiting") {
    document.body.classList.remove("called");
    statusElement.textContent = "請留意叫號";
    newOrderBtn.classList.add("hidden");
    document.title = `#${order.id} 等待叫號`;
  }

  if (order.status === "called") {
    document.body.classList.add("called");
    statusElement.textContent = "請取餐";
    newOrderBtn.classList.add("hidden");
    document.title = `#${order.id} 請取餐`;
  }

  if (order.status === "finished") {
    document.body.classList.remove("called");
    statusElement.textContent = "已完成，謝謝";
    newOrderBtn.classList.remove("hidden");
    document.title = "點餐";
  }
}

function notifyCalled(isRecall) {
  if (navigator.vibrate) {
    navigator.vibrate(isRecall ? [250, 100, 250, 100, 250] : [300, 120, 300]);
  }

  ding.currentTime = 0;
  ding.play().catch(() => {});
}

function saveOrder() {
  localStorage.setItem(ORDER_KEY, JSON.stringify(currentOrder));
}

function clearCurrentOrder() {
  currentOrder = null;
  localStorage.removeItem(ORDER_KEY);
  document.body.classList.remove("called");
  ticketPage.classList.add("hidden");
  orderPage.classList.remove("hidden");
  document.title = "點餐";
}

newOrderBtn.addEventListener("click", clearCurrentOrder);

connect();
