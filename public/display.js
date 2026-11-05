const numberEl = document.querySelector("#displayNumber");
const itemEl = document.querySelector("#displayItem");
const historyEl = document.querySelector("#displayHistory");
const connectionEl = document.querySelector("#displayConnection");
const ding = document.querySelector("#displayDing");
const audioUnlock = document.querySelector("#audioUnlock");
const audioUnlockButton = document.querySelector("#audioUnlockButton");

let ws = null;
let reconnectTimer = null;
let lastCurrentId = null;
let audioEnabled = false;

async function unlockAudio() {
  try {
    ding.currentTime = 0;
    ding.volume = 0;

    await ding.play();

    ding.pause();
    ding.currentTime = 0;
    ding.volume = 1;

    audioEnabled = true;
    audioUnlock.classList.add("hidden");
  } catch (err) {
    console.warn("Unable to unlock audio:", err);
  }
}

audioUnlockButton.addEventListener("click", unlockAudio);

function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";

  ws = new WebSocket(`${protocol}://${location.host}`);
  ws.addEventListener("open",() => connectionEl.classList.add("hidden"));

  ws.addEventListener("close",
    () => {
      connectionEl.classList.remove("hidden");
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 1500);
    }
  );

  ws.addEventListener("message",
    (event) => {
      console.log("[display]WS message:", event.data);

      let data;

      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "init" && data.display) {
        renderDisplay(data.display, false);
        return;
      }

      if (data.type === "display-state") {
        renderDisplay(data, true);
        return;
      }

      if (data.type === "orders-cleared") {
        renderDisplay(
          {
            current: null,
            history: []
          },
          false
        );
      }
    }
  );
}

function renderDisplay(state, allowSound) {
  const current = state.current || null;
  const history = Array.isArray(state.history) ? state.history : [];

  if (!current) {
    numberEl.textContent = "--";
    itemEl.textContent = "等待叫號";
    historyEl.innerHTML = "";
    lastCurrentId = null;
    document.body.classList.remove("display-calling");

    return;
  }

  const changed = current.id !== lastCurrentId;
  numberEl.textContent = current.id;
  itemEl.textContent = current.item || "";

  historyEl.innerHTML = "";
  for (
    const order
    of history.slice(1, 6)
  ) {
    const card = document.createElement("div");
    card.className = "display-history-item";

    const number = document.createElement("div");
    number.className = "display-history-number";
    number.textContent = `#${order.id}`;

    const item = document.createElement("div");
    item.className = "display-history-name";
    item.textContent = order.item || "";

    card.append(number, item);
    historyEl.appendChild(card);
  }

  if (changed) {
    document.body.classList.remove("display-calling");
    void document.body.offsetWidth;
    document.body.classList.add("display-calling");
  }

  if (allowSound && changed && audioEnabled) {
    ding.currentTime = 0;

    ding.play().catch(
      (err) => {
        console.warn("Unable to play ding sound:", err);
      }
    );
  }

  lastCurrentId = current.id;
}

connect();
