const test = require('node:test')
const assert = require('node:assert')
const conditionLogic = require('../controllers/BotLogic/conditionLogic')
const evaluateLogic = require('../controllers/BotLogic/evaluateLogic')
const openLogic = require('../controllers/BotLogic/openLogic')

// An indicator document as the data feed stores it, for one timeframe. `now` and `before` override the current and
// previous candle's values.
function market({ now = {}, before = {}, patterns = {} } = {}) {
    const ma = (v) => Object.fromEntries([10, 20, 30, 40, 50, 100, 200].map(p => [`ma_${p}`, v]))
    const ema = (v) => Object.fromEntries([10, 20, 30, 40, 50, 100, 200].map(p => [`ema_${p}`, v]))
    const candle = (values) => ({
        candle: { close: values.close ?? 100 },
        indicators: {
            ma: { ...ma(100), ...values.ma },
            ema: { ...ema(100), ...values.ema },
            rsi: values.rsi ?? 50,
            atr: values.atr ?? 1,
            adx: values.adx ?? 20,
            supertrend: values.supertrend ?? false,
            stoch: { slowd: values.stoch ?? 50 },
            macd: values.macd ?? { macd: 0, macdsignal: 0 },
            bbands: { upperband: values.upperband ?? 110 },
        },
    })
    return { interval: { '15m': { current: candle(now), previous: { ...candle(before), patterns } } } }
}

const cond = (result, addConditional) => ({ result, addConditional })

test('one condition decides on its own', () => {
    assert.strictEqual(conditionLogic([cond(true, 'Final')]), true)
    assert.strictEqual(conditionLogic([cond(false, 'Final')]), false)
})

test('AND needs both conditions', () => {
    assert.strictEqual(conditionLogic([cond(true, 'AND'), cond(true, 'Final')]), true)
    assert.strictEqual(conditionLogic([cond(true, 'AND'), cond(false, 'Final')]), false)
    assert.strictEqual(conditionLogic([cond(false, 'AND'), cond(true, 'Final')]), false)
})

test('OR needs either condition', () => {
    assert.strictEqual(conditionLogic([cond(false, 'OR'), cond(true, 'Final')]), true)
    assert.strictEqual(conditionLogic([cond(true, 'OR'), cond(false, 'Final')]), true)
    assert.strictEqual(conditionLogic([cond(false, 'OR'), cond(false, 'Final')]), false)
})

test('no conditions never trade', () => {
    assert.strictEqual(conditionLogic([]), false)
})

test('price above a moving average is true while it stays above', () => {
    const items = [{ indicator: 'MA(50)', conditional: '>', signal: false, addConditional: 'Final' }]
    assert.strictEqual(evaluateLogic(items, market({ now: { close: 105 } }), '15m')[0].result, true)
    assert.strictEqual(evaluateLogic(items, market({ now: { close: 95 } }), '15m')[0].result, false)
})

test('a crossover signal fires only on the candle that crosses', () => {
    const items = [{ indicator: 'EMA(20)', conditional: '>', signal: true, addConditional: 'Final' }]
    const crossed = market({ now: { close: 105 }, before: { close: 95 } })
    const alreadyAbove = market({ now: { close: 105 }, before: { close: 104 } })
    assert.strictEqual(evaluateLogic(items, crossed, '15m')[0].result, true)
    assert.strictEqual(evaluateLogic(items, alreadyAbove, '15m')[0].result, false)
})

test('RSI thresholds and RSI crossing a level', () => {
    const above = [{ indicator: 'RSI', conditional: '>', value: 70, signal: false, addConditional: 'Final' }]
    const crossUnder = [{ indicator: 'RSI', conditional: '<', value: 30, signal: true, addConditional: 'Final' }]
    assert.strictEqual(evaluateLogic(above, market({ now: { rsi: 75 } }), '15m')[0].result, true)
    assert.strictEqual(evaluateLogic(above, market({ now: { rsi: 65 } }), '15m')[0].result, false)
    assert.strictEqual(evaluateLogic(crossUnder, market({ now: { rsi: 28 }, before: { rsi: 35 } }), '15m')[0].result, true)
    assert.strictEqual(evaluateLogic(crossUnder, market({ now: { rsi: 28 }, before: { rsi: 25 } }), '15m')[0].result, false)
})

test('a candle pattern is read from the last closed candle', () => {
    const items = [{ indicator: 'Hammer', conditional: 'true', addConditional: 'Final' }]
    assert.strictEqual(evaluateLogic(items, market({ patterns: { cdlhammer: 100 } }), '15m')[0].result, true)
    assert.strictEqual(evaluateLogic(items, market({ patterns: { cdlhammer: 0 } }), '15m')[0].result, false)
})

test('a bot opens when all its open conditions hold, at the current price', async () => {
    const bot = {
        open_logic: [
            { indicator: 'RSI', conditional: '<', value: 30, signal: false, addConditional: 'AND' },
            { indicator: 'MA(200)', conditional: '>', signal: false, addConditional: 'Final' },
        ],
    }
    assert.deepStrictEqual(await openLogic(bot, market({ now: { close: 120, rsi: 25 } }), '15m'), { logic: true, price: 120 })
    assert.deepStrictEqual(await openLogic(bot, market({ now: { close: 120, rsi: 45 } }), '15m'), { logic: false, price: 120 })
})
