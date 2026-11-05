const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const publicDir = path.join(__dirname, "public");
const menuFile = path.join(__dirname, "menu.json");

let nextId = 1;
let orders = [];

function loadMenu() {
  try {
    const data = fs.readFileSync(menuFile, "utf8");
    const parsed = JSON.parse(data);

    if (!Array.isArray(parsed)) {
      throw new Error("Invalid menu format");
    }

    return parsed;
  } catch {
    return ["雞排", "薯條", "紅茶", "奶茶"];
  }
}

function saveMenu() {
  try {
    fs.writeFileSync(
      menuFile,
      JSON.stringify(menu, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("Failed to save menu:", err);
  }
}

let menu = loadMenu();

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wav": "audio/wav"
  }[ext] || "application/octet-stream";
}

const server = http.createServer((req, res) => {
  let pathname = req.url.split("?")[0];

  if (pathname === "/") {
    pathname = "/index.html";
  }

  if (pathname === "/admin") {
    pathname = "/admin.html";
  }

  if (pathname === "/call") {
    pathname = "/call.html";
  }

  const safePath = path
    .normalize(pathname)
    .replace(/^(\.\.[/\\])+/, "");

  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
      });

      res.end("404 Not Found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType(filePath)
    });

    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload) {
  for (const client of wss.clients) {
    send(client, payload);
  }
}

function publicOrder(order) {
  return {
    id: order.id,
    item: order.item,
    clientId: order.clientId,
    status: order.status,
    createdAt: order.createdAt
  };
}

wss.on("connection", (ws) => {
  send(ws, {
    type: "init",
    menu,
    orders: orders.map(publicOrder)
  });

  ws.on("message", (raw) => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === "order") {
      const item = String(data.item || "").trim();
      const clientId = String(data.clientId || "").trim();

      if (!item || !clientId || !menu.includes(item)) {
        return;
      }

      const existing = orders.find(
        (order) =>
          order.clientId === clientId &&
          order.status !== "finished"
      );

      if (existing) {
        send(ws, {
          type: "order-accepted",
          order: publicOrder(existing)
        });

        return;
      }

      const order = {
        id: nextId++,
        item,
        clientId,
        status: "waiting",
        createdAt: Date.now()
      };

      orders.push(order);

      send(ws, {
        type: "order-accepted",
        order: publicOrder(order)
      });

      broadcast({
        type: "new-order",
        order: publicOrder(order)
      });

      return;
    }

    if (data.type === "restore-order") {
      const clientId = String(data.clientId || "").trim();

      if (!clientId) {
        return;
      }

      const order = [...orders]
        .reverse()
        .find(
          (item) =>
            item.clientId === clientId &&
            item.status !== "finished"
        );

      send(ws, {
        type: "restore-result",
        order: order ? publicOrder(order) : null
      });

      return;
    }

    if (
      data.type === "call" ||
      data.type === "recall"
    ) {
      const id = Number(data.id);

      const order = orders.find(
        (item) => item.id === id
      );

      if (!order || order.status === "finished") {
        return;
      }

      order.status = "called";

      broadcast({
        type: "called",
        order: publicOrder(order),
        recall: data.type === "recall"
      });

      return;
    }

    if (data.type === "finish") {
      const id = Number(data.id);

      const order = orders.find(
        (item) => item.id === id
      );

      if (!order) {
        return;
      }

      order.status = "finished";

      broadcast({
        type: "finished",
        order: publicOrder(order)
      });

      return;
    }

    if (data.type === "clear-orders") {
      orders = [];
      nextId = 1;

      broadcast({
        type: "orders-cleared"
      });

      return;
    }

    if (data.type === "add-menu-item") {
      const item = String(data.item || "").trim();

      if (!item || menu.includes(item)) {
        return;
      }

      menu.push(item);

      saveMenu();

      broadcast({
        type: "menu-updated",
        menu
      });

      return;
    }

    if (data.type === "remove-menu-item") {
      const item = String(data.item || "").trim();

      menu = menu.filter(
        (menuItem) => menuItem !== item
      );

      saveMenu();

      broadcast({
        type: "menu-updated",
        menu
      });

      return;
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Order system running on http://localhost:${PORT}`
  );

  console.log(
    `Admin console: http://localhost:${PORT}/admin`
  );

  console.log(
    `Menu loaded: ${menu.length} item(s)`
  );
});
