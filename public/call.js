const waitingOrdersEl =
  document.querySelector("#waitingOrders");

const calledOrdersEl =
  document.querySelector("#calledOrders");

const waitingCountEl =
  document.querySelector("#waitingCount");

const connectionBanner =
  document.querySelector("#connectionBanner");

let orders = [];

let ws = null;

let reconnectTimer = null;

function connect() {

  const protocol =
    location.protocol === "https:"
      ? "wss"
      : "ws";

  ws = new WebSocket(
    `${protocol}://${location.host}`
  );

  ws.addEventListener(
    "open",
    () => {

      connectionBanner
        .classList
        .add("hidden");

    }
  );

  ws.addEventListener(
    "close",
    () => {

      connectionBanner
        .classList
        .remove("hidden");

      clearTimeout(
        reconnectTimer
      );

      reconnectTimer =
        setTimeout(
          connect,
          1500
        );

    }
  );

  ws.addEventListener(
    "message",
    (event) => {

      const data =
        JSON.parse(
          event.data
        );

      if (
        data.type === "init"
      ) {

        orders =
          data.orders;

        render();

        return;

      }

      if (
        data.type ===
        "new-order"
      ) {

        const exists =
          orders.some(
            (order) =>
              order.id ===
              data.order.id
          );

        if (!exists) {
          orders.push(
            data.order
          );
        }

        render();

        return;

      }

      if (
        data.type ===
        "called"
      ) {

        updateOrder(
          data.order
        );

        render();

        return;

      }

      if (
        data.type ===
        "finished"
      ) {

        updateOrder(
          data.order
        );

        render();

        return;

      }

      if (
        data.type ===
        "orders-cleared"
      ) {

        orders = [];

        render();

      }

    }
  );

}

function updateOrder(
  updated
) {

  const index =
    orders.findIndex(
      (order) =>
        order.id ===
        updated.id
    );

  if (index !== -1) {

    orders[index] =
      updated;

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
          order.status ===
          "waiting"
      )
      .sort(
        (a, b) =>
          a.id - b.id
      );

  const called =
    orders
      .filter(
        (order) =>
          order.status ===
          "called"
      )
      .sort(
        (a, b) =>
          a.id - b.id
      );

  waitingCountEl
    .textContent =
      waiting.length;

  waitingOrdersEl
    .innerHTML = "";

  calledOrdersEl
    .innerHTML = "";

  if (
    waiting.length === 0
  ) {

    waitingOrdersEl
      .innerHTML =
      `
        <p class="muted">
          目前沒有等待中的訂單。
        </p>
      `;

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
            [
              "叫號",
              "call",
              ""
            ]
          ]
        )
      );

  }

  if (
    called.length === 0
  ) {

    calledOrdersEl
      .innerHTML =
      `
        <p class="muted">
          目前沒有已叫號訂單。
        </p>
      `;

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
            [
              "重新叫號",
              "recall",
              "secondary"
            ],

            [
              "完成",
              "finish",
              ""
            ]
          ]
        )
      );

  }

}

function makeOrderRow(
  order,
  actions
) {

  const row =
    document
      .createElement(
        "div"
      );

  row.className =
    "order";

  const no =
    document
      .createElement(
        "strong"
      );

  no.textContent =
    `#${order.id}`;

  const item =
    document
      .createElement(
        "span"
      );

  item.textContent =
    order.item;

  const actionBox =
    document
      .createElement(
        "div"
      );

  actionBox.className =
    "action-box";

  for (
    const [
      label,
      type,
      className
    ]
    of actions
  ) {

    const button =
      document
        .createElement(
          "button"
        );

    button.textContent =
      label;

    if (
      className
    ) {

      button.className =
        className;

    }

    button
      .addEventListener(
        "click",
        () => {

          if (
            !ws ||
            ws.readyState !==
              WebSocket.OPEN
          ) {

            return;

          }

          ws.send(
            JSON.stringify(
              {
                type,
                id:
                  order.id
              }
            )
          );

        }
      );

    actionBox
      .appendChild(
        button
      );

  }

  row.append(
    no,
    item,
    actionBox
  );

  return row;

}

connect();
