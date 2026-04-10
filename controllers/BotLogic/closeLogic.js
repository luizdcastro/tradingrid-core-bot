const conditionLogic = require('./conditionLogic')
const evaluateLogic = require('./evaluateLogic')

const closeLogic = async (bot, response, timeframe) => {
    const current_price = response.interval[timeframe].current.candle.close
    const close_logic = evaluateLogic(bot.close_logic, response, timeframe)
    return { logic: conditionLogic(close_logic), price: current_price }
}

module.exports = closeLogic
