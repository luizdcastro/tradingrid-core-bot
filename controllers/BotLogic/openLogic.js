const conditionLogic = require('./conditionLogic')
const evaluateLogic = require('./evaluateLogic')

const openLogic = async (bot, response, timeframe) => {
    const current_price = response.interval[timeframe].current.candle.close
    const open_logic = evaluateLogic(bot.open_logic, response, timeframe)
    return { logic: conditionLogic(open_logic), price: current_price }
}

module.exports = openLogic
