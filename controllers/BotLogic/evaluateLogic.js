const MA_PERIODS = [10, 20, 30, 40, 50, 100, 200]

const CANDLE_PATTERNS = {
    'Hammer': 'cdlhammer',
    'Inverted Hammer': 'cdlinvertedhammer',
    'Engulfing Pattern': 'cdlengulfing',
    'Piercing Pattern': 'cdlpiercing',
    'Morning Star': 'cdlmorningstar',
    '3 White Soldiers': 'cdl3whitesoldiers',
    'Abandoned Baby': 'cdlabandonedbaby',
    'Breakaway': 'cdlbreakaway',
    'Hanging Man': 'cdlhangingman',
    'Shooting Star': 'cdlshootingstar',
    'Evening Star': 'cdleveningstar',
    '3 Black Crows': 'cdl3blackcrows',
    'Dark Cloud Cover': 'cdldarkcloudcover',
    'Doji': 'cdldoji',
    'Spinning Top': 'cdlspinningtop',
    'Harami Pattern': 'cdlharami',
    'Three-Line Strike': 'cdl3linestrike',
    'Dragonfly Doji': 'cdldragonflydoji',
    'Matching Low': 'cdlmatchinglow',
    'Tasuki Gap': 'cdltasukigap',
}

/**
 * Evaluates a list of indicator conditions against current market data.
 *
 * @param {Array}  logicItems - bot.open_logic or bot.close_logic entries
 * @param {Object} response   - indicator document from the database
 * @param {string} timeframe  - primary timeframe for this bot (e.g. "15m")
 * @returns {Array} list of { index, result, addConditional } objects
 */
function evaluateLogic(logicItems, response, timeframe) {
    const current = response.interval[timeframe].current
    const previous = response.interval[timeframe].previous

    const current_price = current.candle.close
    const previous_price = previous.candle.close

    const ind = current.indicators
    const prev_ind = previous.indicators

    // Build period-keyed lookup maps for MA and EMA values
    const maValues = {}
    const emaValues = {}
    const prev_maValues = {}
    const prev_emaValues = {}
    for (const p of MA_PERIODS) {
        maValues[p] = ind.ma[`ma_${p}`]
        emaValues[p] = ind.ema[`ema_${p}`]
        prev_maValues[p] = prev_ind.ma[`ma_${p}`]
        prev_emaValues[p] = prev_ind.ema[`ema_${p}`]
    }

    const logic = []

    function push(i, result, addConditional) {
        logic.push({ index: i, result: Boolean(result), addConditional })
    }

    for (const [i, item] of logicItems.entries()) {
        const { indicator, conditional, signal, addConditional, value } = item

        // --- MA / EMA vs price or vs another MA/EMA ---
        const maMatch = indicator.match(/^MA\((\d+)\)$/)
        const emaMatch = indicator.match(/^EMA\((\d+)\)$/)

        if (maMatch || emaMatch) {
            const period = parseInt((maMatch || emaMatch)[1])
            const isEMA = !!emaMatch
            const curVal = isEMA ? emaValues[period] : maValues[period]
            const prevVal = isEMA ? prev_emaValues[period] : prev_maValues[period]

            if (conditional === '>') {
                // Price crossed above MA/EMA
                if (!signal) {
                    push(i, current_price > curVal, addConditional)
                } else {
                    push(i, current_price > curVal && !(previous_price > curVal), addConditional)
                }
            } else if (conditional === '<') {
                // Price crossed below MA/EMA
                if (!signal) {
                    push(i, current_price < curVal, addConditional)
                } else {
                    push(i, current_price < curVal && !(previous_price < curVal), addConditional)
                }
            } else if (conditional === '> ma' || conditional === '> ema') {
                // MA/EMA crossed above another MA/EMA (value = "ma_10", "ema_20", etc.)
                const valMatch = value && value.match(/^(ma|ema)_(\d+)$/)
                if (valMatch) {
                    const targetCurr = valMatch[1] === 'ema' ? emaValues[parseInt(valMatch[2])] : maValues[parseInt(valMatch[2])]
                    const targetPrev = valMatch[1] === 'ema' ? prev_emaValues[parseInt(valMatch[2])] : prev_maValues[parseInt(valMatch[2])]
                    if (!signal) {
                        push(i, curVal > targetCurr, addConditional)
                    } else {
                        push(i, curVal > targetCurr && !(prevVal > targetPrev), addConditional)
                    }
                }
            } else if (conditional === '< ma' || conditional === '< ema') {
                // MA/EMA crossed below another MA/EMA
                const valMatch = value && value.match(/^(ma|ema)_(\d+)$/)
                if (valMatch) {
                    const targetCurr = valMatch[1] === 'ema' ? emaValues[parseInt(valMatch[2])] : maValues[parseInt(valMatch[2])]
                    const targetPrev = valMatch[1] === 'ema' ? prev_emaValues[parseInt(valMatch[2])] : prev_maValues[parseInt(valMatch[2])]
                    if (!signal) {
                        push(i, curVal < targetCurr, addConditional)
                    } else {
                        push(i, curVal < targetCurr && !(prevVal < targetPrev), addConditional)
                    }
                }
            }
            continue
        }

        // --- Candle patterns ---
        const patternKey = CANDLE_PATTERNS[indicator]
        if (patternKey) {
            const patternValue = previous.patterns[patternKey]
            push(i, conditional === 'true' ? patternValue === 100 : patternValue === 0, addConditional)
            continue
        }

        // --- RSI ---
        if (indicator === 'RSI') {
            if (conditional === '>') {
                push(i, !signal ? ind.rsi >= value : ind.rsi >= value && !(prev_ind.rsi >= value), addConditional)
            } else if (conditional === '<') {
                push(i, !signal ? ind.rsi <= value : ind.rsi <= value && !(prev_ind.rsi <= value), addConditional)
            }
            continue
        }

        // --- Stochastic ---
        if (indicator === 'Stochastic') {
            const stoch = ind.stoch.slowd
            const prev_stoch = prev_ind.stoch.slowd
            if (conditional === '>') {
                push(i, !signal ? stoch >= value : stoch >= value && !(prev_stoch >= value), addConditional)
            } else if (conditional === '<') {
                push(i, !signal ? stoch <= value : stoch <= value && !(prev_stoch <= value), addConditional)
            }
            continue
        }

        // --- Supertrend ---
        if (indicator === 'Supertrend') {
            if (conditional === '>') {
                push(i, !signal ? ind.supertrend === true : ind.supertrend === true && prev_ind.supertrend !== true, addConditional)
            } else if (conditional === '<') {
                push(i, !signal ? ind.supertrend === false : ind.supertrend === false && prev_ind.supertrend !== false, addConditional)
            }
            continue
        }

        // --- MACD ---
        if (indicator === 'MACD') {
            const macd = ind.macd
            const prev_macd = prev_ind.macd
            if (conditional === '>') {
                push(i, !signal ? macd.macd >= macd.macdsignal : macd.macd >= macd.macdsignal && !(prev_macd.macd >= prev_macd.macdsignal), addConditional)
            } else if (conditional === '<') {
                push(i, !signal ? macd.macd <= macd.macdsignal : macd.macd <= macd.macdsignal && !(prev_macd.macd <= prev_macd.macdsignal), addConditional)
            }
            continue
        }

        // --- ATR ---
        if (indicator === 'ATR') {
            if (conditional === '>') {
                push(i, !signal ? ind.atr >= value : ind.atr >= value && !(prev_ind.atr >= value), addConditional)
            } else if (conditional === '<') {
                push(i, !signal ? ind.atr <= value : ind.atr <= value && !(prev_ind.atr <= value), addConditional)
            }
            continue
        }

        // --- Bollinger Bands ---
        if (indicator === 'Bollinger Bands') {
            if (conditional === '>') {
                push(i, !signal ? ind.bbands.upperband >= current_price : ind.bbands.upperband >= current_price && !(prev_ind.bbands.upperband >= current_price), addConditional)
            } else if (conditional === '<') {
                push(i, !signal ? ind.bbands.upperband <= current_price : ind.bbands.upperband <= current_price && !(prev_ind.bbands.upperband <= current_price), addConditional)
            }
            continue
        }

        // --- ADX ---
        if (indicator === 'ADX') {
            if (conditional === '>') {
                push(i, !signal ? ind.adx >= value : ind.adx >= value && !(prev_ind.adx >= value), addConditional)
            } else if (conditional === '<') {
                push(i, !signal ? ind.adx <= value : ind.adx <= value && !(prev_ind.adx <= value), addConditional)
            }
            continue
        }

        // --- AROON ---
        if (indicator === 'AROON') {
            const aroon = ind.aroon
            const prev_aroon = prev_ind.aroon
            if (conditional === '>') {
                const cur = aroon.aroonup >= 90 && aroon.aroondown <= 10
                const prev = prev_aroon.aroonup >= 90 && prev_aroon.aroondown <= 10
                push(i, !signal ? cur : cur && !prev, addConditional)
            } else if (conditional === '<') {
                const cur = aroon.aroondown >= 90 && aroon.aroonup <= 10
                const prev = prev_aroon.aroondown >= 90 && prev_aroon.aroonup <= 10
                push(i, !signal ? cur : cur && !prev, addConditional)
            }
            continue
        }

        // --- MFI ---
        if (indicator === 'MFI') {
            if (conditional === '>') {
                push(i, !signal ? ind.mfi >= value : ind.mfi >= value && !(prev_ind.mfi >= value), addConditional)
            } else if (conditional === '<') {
                push(i, !signal ? ind.mfi <= value : ind.mfi <= value && !(prev_ind.mfi <= value), addConditional)
            }
            continue
        }

        // --- MOM ---
        if (indicator === 'MOM') {
            if (conditional === '>') {
                push(i, !signal ? ind.mom > 0 : ind.mom > 0 && !(prev_ind.mom > 0), addConditional)
            } else if (conditional === '<') {
                push(i, !signal ? ind.mom < 0 : ind.mom < 0 && !(prev_ind.mom < 0), addConditional)
            }
            continue
        }

        // --- Williams %R ---
        if (indicator === 'WillR') {
            if (conditional === '>') {
                push(i, !signal ? ind.willr >= value : ind.willr >= value && !(prev_ind.willr >= value), addConditional)
            } else if (conditional === '<') {
                push(i, !signal ? ind.willr <= value : ind.willr <= value && !(prev_ind.willr <= value), addConditional)
            }
            continue
        }

        // --- Price Increased ---
        if (indicator === 'Price Increased') {
            if (conditional === 'buy') {
                const threshold = Number(current_price) + (Number(value) / 100) * Number(current_price)
                push(i, current_price >= threshold, addConditional)
            } else if (response.interval[conditional]) {
                const tf = response.interval[conditional]
                const threshold = Number(tf.previous.candle.close) + (Number(value) / 100) * Number(tf.previous.candle.close)
                push(i, Number(tf.current.candle.close) >= threshold, addConditional)
            }
            continue
        }

        // --- Price Decreased ---
        if (indicator === 'Price Decreased') {
            if (conditional === 'buy') {
                const threshold = Number(current_price) - (Number(value) / 100) * Number(current_price)
                const ref = response.interval['15m'] ? Number(response.interval['15m'].current.candle.close) : current_price
                push(i, ref <= threshold, addConditional)
            } else if (response.interval[conditional]) {
                const tf = response.interval[conditional]
                const threshold = Number(tf.previous.candle.close) - (Number(value) / 100) * Number(tf.previous.candle.close)
                push(i, Number(tf.current.candle.close) <= threshold, addConditional)
            }
            continue
        }
    }

    return logic
}

module.exports = evaluateLogic
