# 爛醉如泥 / drunk-as-mud

A lightweight, portable event ordering and calling system.

「爛醉如泥」是一套為活動現場設計的簡易點餐與叫號系統。
只需要一台可以架設區域網路服務的電腦，即可讓參加者使用手機點餐，工作人員透過管理介面處理訂單，並可使用外接螢幕顯示叫號資訊。

本專案使用 Node.js、原生 HTML、CSS、JavaScript 與 WebSocket，刻意維持低依賴與容易部署的結構。

## 功能

### Client

- 手機瀏覽器點餐
- 一張訂單限一個品項
- 可填寫簡短附註
- 自動取得號碼
- 即時接收叫號狀態
- 支援瀏覽器震動 API 的裝置可於叫號時震動
- 播放叫號提示音
- WebSocket 斷線後自動重新連線
- 重新整理或短暫斷線後可恢復目前訂單

### Call Console

- PIN 驗證
- 查看等待中的訂單
- 叫號
- 重新叫號
- 完成訂單
- 即時同步訂單狀態
- WebSocket 自動重連

### Admin Console

包含 Call Console 的功能，另外提供：

- 簡易菜單管理
- 現場新增或移除品項
- 清空目前訂單
- 重設叫號流水號

### Public Display

- 顯示目前叫號
- 顯示品項名稱
- 顯示最近叫號
- 即時 WebSocket 更新
- 斷線後自動重新連線
- 可播放叫號提示音
- 適合投影機、電視或第二螢幕全螢幕顯示

## 系統需求

開發版目前需要：

- Node.js 20 或更新版本
- npm

安裝：

```bash
npm ci
```

啟動：

```bash
npm start
```

預設監聽：

```text
0.0.0.0:8080
```

啟動後終端機會顯示本機與可用的 LAN IPv4 位址，以及本次啟動產生的 Call PIN 與 Admin PIN。

## 使用方式

假設主機區網 IP 為：

```text
192.168.1.111
```

則可使用：

```text
Client
http://192.168.1.111:8080/

Call Console
http://192.168.1.111:8080/call

Admin Console
http://192.168.1.111:8080/admin

Public Display
http://192.168.1.111:8080/display
```

所有裝置必須能夠直接連線至執行 drunk-as-mud 的主機。

部分公共 Wi-Fi、校園 Wi-Fi 或活動場地網路可能啟用 Client Isolation，使同一 Wi-Fi 下的裝置仍無法彼此連線。

## PIN

每次啟動 Server 時會自動產生：

- Call PIN
- Admin PIN

也可以透過環境變數指定：

```bash
CALL_PIN=123456 ADMIN_PIN=654321 npm start
```

Call PIN 可以使用叫號與完成訂單功能。

Admin PIN 可以使用完整後台功能，包括菜單管理與清空訂單。

## 菜單

基礎菜單存放於：

```text
menu.json
```

建議格式：

```json
{
  "name": "Event Menu",
  "items": [
    "雞排",
    "薯條",
    "紅茶",
    "奶茶"
  ]
}
```

舊式純陣列格式也仍可使用：

```json
[
  "雞排",
  "薯條",
  "紅茶",
  "奶茶"
]
```

系統啟動後會建立 Runtime Menu。

活動現場透過 Admin 新增或刪除的品項只會修改 Runtime State，不會覆寫原始 `menu.json`。

## Runtime State

目前活動狀態存放於：

```text
data/runtime.json
```

包含：

- 下一個叫號號碼
- 訂單
- 訂單狀態
- 叫號歷史
- Runtime Menu

Server 每次發生重要狀態變更時會立即更新此檔案，例如：

- 新增訂單
- 叫號
- 重新叫號
- 完成訂單
- 修改 Runtime Menu
- 清空訂單

因此即使因修改程式或其他原因需要重新啟動 Server，仍可恢復活動中的訂單與叫號狀態。

## Backup

正常收到 `SIGINT` 或 `SIGTERM` 結束時，系統會在：

```text
backups/
```

建立 Session Backup。

備份內容包含：

- 活動開始與結束時間
- 原始菜單
- 最終 Runtime Menu
- 訂單
- 下一個流水號
- 叫號歷史

`data/` 與 `backups/` 預設不應提交至版本控制。

## Public Display 音效

現代瀏覽器通常會限制未經使用者互動的自動播放。

Public Display 開啟後，應先點擊畫面上的「啟用叫號音效」，讓瀏覽器允許播放提示音。

即使音效尚未啟用，叫號畫面仍會正常更新。

## 專案結構

```text
drunk-as-mud/
├── package.json
├── package-lock.json
├── server.js
├── menu.json
├── README.md
├── LICENSE
├── .gitignore
│
├── data/
│   └── .gitkeep
│
├── backups/
│   └── .gitkeep
│
└── public/
    ├── index.html
    ├── client.js
    ├── admin.html
    ├── admin.js
    ├── call.html
    ├── call.js
    ├── display.html
    ├── display.js
    ├── style.css
    └── ding.wav
```

## 部署

目前最簡單的部署方式為：

```bash
git clone <repository>
cd drunk-as-mud
npm ci
npm start
```

未來 Release 預計提供不需要預先安裝 Git、Node.js 或 npm 的可攜式版本。

## 專案定位

drunk-as-mud 並不是完整的 POS、餐廳管理系統或付款平台。

它的目標是：

> 在活動現場快速建立一套低依賴、易攜帶、容易救火的點餐與叫號系統。

## License

MIT License
