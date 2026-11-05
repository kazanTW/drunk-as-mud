const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 8080);

const publicDir = path.join(__dirname, "public");
const menuFile = path.join(__dirname, "menu.json");
const dataDir = path.join(__dirname, "data");
const runtimeFile = path.join(dataDir, "runtime.json");
const backupDir = path.join(__dirname, "backups");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });

const startedAt = new Date().toISOString();

function generatePin() {
  return String(crypto.randomInt(100000, 1000000));
}

const callPin = process.env.CALL_PIN || generatePin();
const adminPin = process.env.ADMIN_PIN || generatePin();

function loadBaseMenu() {
  try {
    const raw = fs.readFileSync(menuFile, "utf8");
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => String(item).trim())
        .filter(Boolean);
    }

    if (parsed && Array.isArray(parsed.items)) {
      return parsed.items
        .map((item) => {
          if (typeof item === "string") {
            return item.trim();
          }

          if (item && typeof item.name === "string") {
            return item.name.trim();
          }

          return "";
        })
        .filter(Boolean);
    }

    throw new Error("Invalid menu format");
  } catch (err) {
    console.error("Failed to load menu.json:", err.message);

    return [
      "雞排",
      "薯條",
      "紅茶",
      "奶茶"
    ];
  }
}

const baseMenu = loadBaseMenu();

function defaultRuntime() {
  return {
    startedAt,
    nextId: 1,
    orders: [],
    callHistory: [],
    menu: [...baseMenu]
  };
}

function loadRuntime() {
  try {
    const raw = fs.readFileSync(runtimeFile, "utf8");
    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      !Array.isArray(parsed.orders) ||
      !Array.isArray(parsed.menu)
    ) {
      throw new Error("Invalid runtime format");
    }

    return {
      startedAt: parsed.startedAt || startedAt,
      nextId:
        Number.isInteger(parsed.nextId) &&
        parsed.nextId >= 1
          ? parsed.nextId
          : 1,
      orders: parsed.orders,
      callHistory: Array.isArray(parsed.callHistory)
        ? parsed.callHistory
        : [],
      menu: parsed.menu
    };
  } catch {
    return defaultRuntime();
  }
}

let runtime = loadRuntime();

function atomicWriteJson(filePath, value) {
  const tempFile = `${filePath}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(value, null, 2),
    "utf8"
  );

  fs.renameSync(tempFile, filePath);
}

function saveRuntime() {
  atomicWriteJson(runtimeFile, runtime);
}

function makeBackup(reason = "shutdown") {
  const now = new Date();

  const timestamp = now
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+$/, "");

  const backup = {
    reason,
    startedAt: runtime.startedAt,
    endedAt: now.toISOString(),

    baseMenu,
    runtimeMenu: runtime.menu,

    nextId: runtime.nextId,
    orders: runtime.orders,
    callHistory: runtime.callHistory
  };

  const file = path.join(
    backupDir,
    `${timestamp}.json`
  );

  atomicWriteJson(file, backup);

  console.log(`Backup written: ${file}`);
}

saveRuntime();

function publicOrder(order) {
  return {
    id: order.id,
    item: order.item,
    note: order.note || "",
    clientId: order.clientId,
    status: order.status,
    createdAt: order.createdAt
  };
}

function displayOrder(order) {
  return {
    id: order.id,
    item: order.item,
    status: order.status
  };
}

function consoleState() {
  return {
    orders: runtime.orders.map(publicOrder),
    menu: runtime.menu
  };
}

function displayState() {
  return {
    current: runtime.callHistory[0] || null,
    history: runtime.callHistory.slice(0, 6)
  };
}

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

  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/admin") pathname = "/admin.html";
  if (pathname === "/call") pathname = "/call.html";
  if (pathname === "/display") pathname = "/display.html";

  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, {"Content-Type": "text/plain; charset=utf-8"});
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
      res.end("404 Not Found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store"
    });

    res.end(data);
  });
});

const wss = new WebSocket.Server({
  server
});

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload, predicate = null) {
  for (const client of wss.clients) {
    if (
      client.readyState !== WebSocket.OPEN
    ) {
      continue;
    }

    if (
      predicate &&
      !predicate(client)
    ) {
      continue;
    }

    send(client, payload);
  }
}

function broadcastConsoleState() {
  broadcast(
    {
      type: "console-state",
      ...consoleState()
    },
    (client) =>
      client.role === "call" ||
      client.role === "admin"
  );
}

function broadcastDisplayState() {
  broadcast(
    {
      type: "display-state",
      ...displayState()
    }
  );
}

function requireRole(ws, roles) {
  return roles.includes(ws.role);
}

function authenticate(ws, role, pin) {
  if (role === "call" && pin === callPin) {
    ws.role = "call";
    return true;
  }

  if (role === "admin" && pin === adminPin) {
    ws.role = "admin";
    return true;
  }

  return false;
}

wss.on("connection", (ws) => {
  ws.role = "public";

  send(ws, {
    type: "init",
    menu: runtime.menu,
    display: displayState()
  });

  ws.on("message", (raw) => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === "auth") {
      const role = String(data.role || "");
      const pin = String(data.pin || "");
      const ok = authenticate(ws, role, pin);

      send(ws, {
        type: "auth-result",
        ok,
        role: ok ? ws.role : null
      });

      if (ok) {
        send(ws, {
          type: "console-state",
          ...consoleState()
        });
      }

      return;
    }

    if (data.type === "order") {
      const item = String(data.item || "").trim();
      const clientId = String(data.clientId || "").trim();
      const note = String(data.note || "").trim().slice(0, 100);

      if (!item || !clientId || !runtime.menu.includes(item)) return;

      const existing =
        runtime.orders.find(
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
        id: runtime.nextId++,
        item,
        note,
        clientId,
        status: "waiting",
        createdAt: Date.now()
      };

      runtime.orders.push(order);
      saveRuntime();

      send(ws, {
        type: "order-accepted",
        order: publicOrder(order)
      });

      broadcast(
        {
          type: "new-order",
          order: publicOrder(order)
        },
        (client) =>
          client.role === "call" ||
          client.role === "admin"
      );

      broadcastConsoleState();
      return;
    }

    if (data.type === "restore-order") {
      const clientId = String(data.clientId || "").trim();

      if (!clientId) return;

      const order =
        [...runtime.orders]
          .reverse()
          .find(
            (item) =>
              item.clientId === clientId &&
              item.status !== "finished"
          );

      send(ws, {
        type: "restore-result",
        order:
          order
            ? publicOrder(order)
            : null
      });

      return;
    }

    if (data.type === "call" || data.type === "recall") {
      if (!requireRole(ws, ["call", "admin"])) return;

      const id = Number(data.id);
      const order = runtime.orders.find((item) => item.id === id);

      if (!order || order.status === "finished")  return;

      order.status = "called";
      const historyItem = displayOrder(order);

      runtime.callHistory = runtime.callHistory.filter((item) => item.id !== order.id);

      runtime.callHistory.unshift(historyItem);
      runtime.callHistory = runtime.callHistory.slice(0, 20);
      saveRuntime();
      broadcast({
        type: "called",
        order: publicOrder(order),
        recall:
          data.type === "recall"
      });

      broadcastConsoleState();
      broadcastDisplayState();

      return;
    }

    if (data.type === "finish") {
      if (!requireRole(ws, ["call", "admin"])) return;

      const id = Number(data.id);
      const order = runtime.orders.find((item) => item.id === id);

      if (!order) return;
      order.status = "finished";
      saveRuntime();
      broadcast({
        type: "finished",
        order: publicOrder(order)
      });

      broadcastConsoleState();
      return;
    }

    if (data.type === "add-menu-item") {
      if (!requireRole(ws, ["admin"]))  return;
      const item = String(data.item || "").trim();

      if (!item || runtime.menu.includes(item)) return;
      runtime.menu.push(item);
      saveRuntime();
      broadcast({
        type: "menu-updated",
        menu: runtime.menu
      });

      broadcastConsoleState();
      return;
    }

    if (data.type === "remove-menu-item") {
      if (!requireRole(ws, ["admin"])) return;
      const item = String(data.item || "").trim();
      runtime.menu = runtime.menu.filter((menuItem) => menuItem !== item);
      saveRuntime();

      broadcast({
        type: "menu-updated",
        menu: runtime.menu
      });

      broadcastConsoleState();

      return;
    }

    if (data.type === "clear-orders") {
      if (
        !requireRole(ws, ["admin"])
      ) {
        return;
      }

      runtime.orders = [];
      runtime.callHistory = [];
      runtime.nextId = 1;

      saveRuntime();

      broadcast({
        type: "orders-cleared"
      });

      broadcastConsoleState();
      broadcastDisplayState();

      return;
    }

    if (data.type === "get-console-state") {
      if (!requireRole(ws, ["call", "admin"])) return;

      send(ws, {
        type: "console-state",
        ...consoleState()
      });

      return;
    }

    if (data.type === "get-display-state") {
      send(ws, {
        type: "display-state",
        ...displayState()
      });

      return;
    }
  });
});

function getLanAddresses() {
  const result = [];

  const interfaces =
    os.networkInterfaces();

  for (
    const entries
    of Object.values(interfaces)
  ) {
    for (
      const entry
      of entries || []
    ) {
      if (
        entry.family === "IPv4" &&
        !entry.internal
      ) {
        result.push(entry.address);
      }
    }
  }

  return [...new Set(result)];
}

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log("");
    console.log(
      "爛醉如泥 / drunk-as-mud"
    );
    console.log(
      "Event Order & Calling System"
    );
    console.log("");

    console.log(
      `Local:   http://localhost:${PORT}`
    );

    for (
      const address
      of getLanAddresses()
    ) {
      console.log(
        `LAN:     http://${address}:${PORT}`
      );
    }

    console.log("");
    console.log(
      `Call PIN:  ${callPin}`
    );
    console.log(
      `Admin PIN: ${adminPin}`
    );
    console.log("");

    console.log(
      `Waiting orders: ${
        runtime.orders.filter(
          (order) =>
            order.status === "waiting"
        ).length
      }`
    );

    console.log(
      `Called orders:  ${
        runtime.orders.filter(
          (order) =>
            order.status === "called"
        ).length
      }`
    );

    console.log(
      `Next number:    ${runtime.nextId}`
    );

    console.log(
      `Menu items:     ${runtime.menu.length}`
    );

    console.log("");
  }
);

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log("");
  console.log(
    `Received ${signal}.`
  );

  try {
    saveRuntime();
    makeBackup(signal);
  } catch (err) {
    console.error(
      "Failed to save shutdown state:",
      err
    );
  }

  server.close(() => {
    process.exit(0);
  });

  setTimeout(
    () => process.exit(0),
    2000
  ).unref();
}

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);
