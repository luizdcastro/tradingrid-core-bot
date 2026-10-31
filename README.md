# Tradingrid Core Bot

Automated cryptocurrency trading bot engine. Evaluates configurable technical indicator conditions on a cron schedule and opens or closes positions on connected exchanges via [CCXT](https://github.com/ccxt/ccxt).

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Setup](#setup)
- [Configuration](#configuration)
- [Database Models](#database-models)
  - [Bot](#bot)
  - [Order](#order)
  - [Exchange](#exchange)
  - [Indicator](#indicator)
  - [User](#user)
- [Bot Logic](#bot-logic)
  - [Supported Indicators](#supported-indicators)
  - [Supported Timeframes](#supported-timeframes)
  - [Condition Chaining](#condition-chaining)
- [Exchange Modes](#exchange-modes)
- [Data Flow](#data-flow)

---

## Overview

Each active bot is evaluated every minute. The engine checks whether its configured open/close conditions are satisfied against the latest pre-calculated indicator data stored in MongoDB. When conditions are met, market orders are submitted through the exchange API.

---

## Architecture

```
index.js
└── processBots.js  (cron: every minute)
    ├── openDemo.js     → BotLogic/openLogic.js  → evaluateLogic.js
    ├── openCcxt.js     → BotLogic/openLogic.js  → evaluateLogic.js
    ├── closeDemo.js    → BotLogic/closeLogic.js → evaluateLogic.js
    └── closeCcxt.js    → BotLogic/closeLogic.js → evaluateLogic.js
                                                  └── conditionLogic.js
```

Indicator data is expected to be pre-populated in MongoDB by a separate data-feed service. The bot engine only reads indicators — it does not calculate them.

---

## Project Structure

```
tradingrid-core-bot/
├── controllers/
│   ├── BotLogic/
│   │   ├── evaluateLogic.js   Shared indicator evaluation (replaces ~1800 lines of duplication)
│   │   ├── openLogic.js       Entry point for open condition evaluation
│   │   ├── closeLogic.js      Entry point for close condition evaluation
│   │   └── conditionLogic.js  AND/OR condition chain aggregator
│   ├── BotOrder/
│   │   ├── openCcxt.js        Open live exchange orders
│   │   ├── closeCcxt.js       Close live exchange orders
│   │   ├── openDemo.js        Open demo (testnet) orders
│   │   └── closeDemo.js       Close demo (testnet) orders
│   └── processBots.js         Cron orchestrator
├── models/
│   ├── botModel.js
│   ├── orderModel.js
│   ├── userModel.js
│   ├── exchangeModel.js
│   └── indicatorModel.js
├── index.js                   Application entry point
├── config.env                 Environment variables (not committed)
└── package.json
```

---

## Setup

**Prerequisites**: Node.js 16+, MongoDB instance, exchange API credentials.

```bash
# Install dependencies
npm install

# Create config.env in the project root (see Configuration section)
# Then start the engine
npm start
```

---

## Configuration

Create a `config.env` file in the project root:

```env
DB_CONNECT=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>
PORT=8001
```

| Variable     | Required | Description                              |
|--------------|----------|------------------------------------------|
| `DB_CONNECT` | Yes      | MongoDB connection URI                   |
| `PORT`       | No       | HTTP server port (default: `8001`)       |

---

## Database Models

### Bot

Stores configuration and runtime state for each trading bot.

| Field         | Type       | Description                                              |
|---------------|------------|----------------------------------------------------------|
| `name`        | String     | Display name                                             |
| `user`        | String     | Owner user ID                                            |
| `active`      | Boolean    | Whether the bot is currently running                     |
| `completed`   | Boolean    | Set to `true` when `executeTime` orders have been closed |
| `growth`      | [Number]   | Array of % growth per closed trade                       |
| `profit`      | [Number]   | Array of absolute profit per closed trade                |
| `settings`    | Object     | Bot configuration (see below)                            |
| `open_logic`  | Array      | Array of open condition objects                          |
| `close_logic` | Array      | Array of close condition objects                         |
| `events`      | Array      | Error and lifecycle event log                            |

**`settings` object fields:**

| Field         | Type   | Description                                              |
|---------------|--------|----------------------------------------------------------|
| `exchange`    | Object | `{ id, name }` — references the Exchange document       |
| `ticker`      | String | Trading pair symbol, e.g. `"BTCUSDT"`                   |
| `timeframe`   | String | Primary candle interval, e.g. `"15m"`                   |
| `funds`       | Number | Percentage of account balance to allocate per trade      |
| `stopLoss`    | Number | Stop-loss percentage below buy price (0 = disabled)      |
| `executeTime` | Number | Maximum number of trades before auto-deactivation        |

---

### Order

Tracks individual trades opened and closed by bots.

| Field        | Type     | Description                        |
|--------------|----------|------------------------------------|
| `user`       | String   | Owner user ID                      |
| `bot`        | ObjectId | Reference to the parent bot        |
| `active`     | Boolean  | `true` while position is open      |
| `quantity`   | Number   | Asset quantity purchased           |
| `buy_price`  | Number   | Entry price                        |
| `sell_price` | Number   | Exit price (set on close)          |
| `open_time`  | Date     | When the order was placed          |
| `close_time` | Date     | When the order was closed          |
| `profit`     | Number   | Absolute profit/loss in quote currency |
| `percent`    | Number   | Percentage gain/loss               |

---

### Exchange

Stores API credentials for exchange connections.

| Field        | Type   | Required | Description                      |
|--------------|--------|----------|----------------------------------|
| `exchange`   | String | Yes      | CCXT exchange ID (e.g. `"binance"`) |
| `api_key`    | String | Yes      | Exchange API key                 |
| `secret_key` | String | Yes      | Exchange API secret              |
| `user`       | String | Yes      | Owner user ID                    |
| `passphrase` | String | No       | Required by some exchanges (e.g. KuCoin) |

---

### Indicator

Pre-calculated technical indicator data populated by an external data-feed service.

| Field       | Type   | Description                                      |
|-------------|--------|--------------------------------------------------|
| `symbol`    | String | Trading pair, e.g. `"BTCUSDT"`                  |
| `interval`  | Object | Nested timeframe data (see structure below)      |
| `updatedAt` | Date   | Last update timestamp                            |

**`interval` structure:**

```json
{
  "15m": {
    "current": {
      "candle": { "open": 0, "high": 0, "low": 0, "close": 0, "volume": 0 },
      "patterns": { "cdlhammer": 0, "cdldoji": 0, ... },
      "indicators": {
        "rsi": 0,
        "stoch": { "slowd": 0, "slowk": 0 },
        "macd": { "macd": 0, "macdsignal": 0, "macdhist": 0 },
        "supertrend": true,
        "atr": 0,
        "bbands": { "upperband": 0, "middleband": 0, "lowerband": 0 },
        "adx": 0,
        "aroon": { "aroonup": 0, "aroondown": 0 },
        "mfi": 0,
        "mom": 0,
        "willr": 0,
        "ma": { "ma_10": 0, "ma_20": 0, "ma_30": 0, "ma_40": 0, "ma_50": 0, "ma_100": 0, "ma_200": 0 },
        "ema": { "ema_10": 0, "ema_20": 0, "ema_30": 0, "ema_40": 0, "ema_50": 0, "ema_100": 0, "ema_200": 0 }
      }
    },
    "previous": { ... }
  }
}
```

---

### User

Minimal user record — identity is managed externally.

| Field       | Type   | Description       |
|-------------|--------|-------------------|
| `_id`       | String | External user ID  |
| `createdAt` | Date   | Creation timestamp |

---

## Bot Logic

Each bot stores two logic arrays: `open_logic` and `close_logic`. Each entry is a **condition object**:

```json
{
  "indicator": "RSI",
  "conditional": "<",
  "value": 30,
  "signal": false,
  "addConditional": "Final"
}
```

| Field            | Type    | Description                                                         |
|------------------|---------|---------------------------------------------------------------------|
| `indicator`      | String  | Name of the indicator (see table below)                             |
| `conditional`    | String  | Comparison operator (`>`, `<`, `> ma`, `< ma`, `> ema`, `< ema`)  |
| `value`          | Any     | Threshold value or target MA/EMA key (e.g. `"ma_20"`)              |
| `signal`         | Boolean | When `true`, detects a **crossover** (current true + previous false) |
| `addConditional` | String  | `"AND"`, `"OR"`, or `"Final"` (last item must be `"Final"`)         |

---

### Supported Indicators

| Indicator          | `conditional` options | Notes                                    |
|--------------------|----------------------|------------------------------------------|
| `MA(10..200)`      | `>`, `<`, `> ma`, `< ma`, `> ema`, `< ema` | Periods: 10, 20, 30, 40, 50, 100, 200 |
| `EMA(10..200)`     | same as MA           | Periods: 10, 20, 30, 40, 50, 100, 200 |
| `RSI`              | `>`, `<`             | Compared against `value`                |
| `Stochastic`       | `>`, `<`             | Uses slow %D                             |
| `MACD`             | `>`, `<`             | MACD line vs signal line                 |
| `Supertrend`       | `>`, `<`             | `>` = uptrend, `<` = downtrend           |
| `ATR`              | `>`, `<`             | Compared against `value`                |
| `Bollinger Bands`  | `>`, `<`             | Uses upper band vs current price         |
| `ADX`              | `>`, `<`             | Compared against `value`                |
| `AROON`            | `>`, `<`             | `>` = bullish (up≥90, down≤10), `<` = bearish |
| `MFI`              | `>`, `<`             | Compared against `value`                |
| `MOM`              | `>`, `<`             | `>` = momentum positive, `<` = negative |
| `WillR`            | `>`, `<`             | Compared against `value`                |
| `Price Increased`  | timeframe or `"buy"` | `value` = % increase threshold          |
| `Price Decreased`  | timeframe or `"buy"` | `value` = % decrease threshold          |
| Candle patterns    | `"true"` / `"false"` | Hammer, Doji, Engulfing, etc.           |

**Candle patterns:** Hammer, Inverted Hammer, Engulfing Pattern, Piercing Pattern, Morning Star, 3 White Soldiers, Abandoned Baby, Breakaway, Hanging Man, Shooting Star, Evening Star, 3 Black Crows, Dark Cloud Cover, Doji, Spinning Top, Harami Pattern, Three-Line Strike, Dragonfly Doji, Matching Low, Tasuki Gap.

---

### Supported Timeframes

`1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `1d`

---

### Condition Chaining

The `addConditional` field chains multiple conditions:

- `"AND"` — the current condition AND the next must both be true
- `"OR"` — either the current condition OR the next must be true
- `"Final"` — marks the last condition in the chain

**Example — RSI < 30 AND MACD bullish crossover:**

```json
[
  { "indicator": "RSI",  "conditional": "<", "value": 30, "signal": false, "addConditional": "AND" },
  { "indicator": "MACD", "conditional": ">", "value": null, "signal": true, "addConditional": "Final" }
]
```

---

## Exchange Modes

| Mode       | Setting                         | Behaviour                                    |
|------------|---------------------------------|----------------------------------------------|
| **Demo**   | `settings.exchange === "Testnet"` | Simulates trades against a $10,000 virtual balance; no real orders placed |
| **Live**   | any other exchange name          | Submits real market orders via CCXT          |

The bot's `settings.exchange` field drives routing in `processBots.js`.

---

## Data Flow

```
[Cron: every minute]
        │
        ▼
processBots()
  ├─ Fetch active bots from DB
  ├─ Fetch active orders from DB
  ├─ Fetch all indicators from DB
  │
  ├─ Bots WITHOUT active order → open_list
  │     ├─ Testnet  → openDemo()
  │     └─ Live     → openCcxt()
  │           │
  │           ▼
  │     evaluateLogic(bot.open_logic, indicators, timeframe)
  │     conditionLogic(results)
  │     → if true: place market BUY, insert Order document
  │
  └─ Bots WITH active order → close_list
        ├─ Testnet  → closeDemo()
        └─ Live     → closeCcxt()
              │
              ▼
        evaluateLogic(bot.close_logic, indicators, timeframe)
        conditionLogic(results) OR stopLoss triggered
        → if true: place market SELL, update Order, push profit/growth to Bot
        → if executeTime reached: deactivate bot
```
