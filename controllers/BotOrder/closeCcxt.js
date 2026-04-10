const closeLogic = require('../BotLogic/closeLogic')
const Order = require('../../models/orderModel')
const Bot = require('../../models/botModel')
const User = require('../../models/userModel')
const Exchange = require('../../models/exchangeModel')
const ccxt = require('ccxt')

async function checkStopLoss(bot, indicator, order) {
    if (!bot.settings.stopLoss) return false
    const timeframe = bot.settings.timeframe
    const threshold = Number(order.buy_price) - (Number(bot.settings.stopLoss) / 100) * Number(order.buy_price)
    const currentClose = Number(indicator.interval[timeframe].current.candle.close)
    return currentClose <= threshold
}

async function ccxtCloseOrder(bots, indicator) {

    let close_ccxt = []
    let exchange_ids = []
    let exchange_secrets = []
    let orders_update = []
    let bots_update = []
    let close_errors = []
    let bots_result = []

    for (const item of bots) {

        const symbol = item.bot.settings.ticker
        const timeframe = item.bot.settings.timeframe
        const filtered = indicator.filter(item => item.symbol === symbol)

        const response = await closeLogic(item.bot, filtered[0], timeframe, item.order)
        const stop_loss = await checkStopLoss(item.bot, filtered[0], item.order)

        if (response.logic || stop_loss) {
            close_ccxt.push({ bot: item.bot, price: response.price, order: item.order })
        }
    }

    for (const item of close_ccxt) {
        exchange_ids.push(item.bot.settings.exchange.id)
    }

    const exchanges = await Exchange.find({
        '_id': { $in: exchange_ids }
    })

    for (const exchange of exchanges) {
        exchange_secrets.push({
            id: exchange._id,
            api_key: exchange.api_key,
            secret_key: exchange.secret_key,
            user: exchange.user,
            name: exchange.exchange,
            passphrase: exchange.passphrase
        })
    }

    for (const item of close_ccxt) {

        const exchange_decrypted = exchange_secrets.find(element => element.id == item.bot.settings.exchange.id)

        const exchangeClient = new ccxt[exchange_decrypted.name]({
            apiKey: exchange_decrypted.api_key, secret: exchange_decrypted.secret_key, password: exchange_decrypted.passphrase
        })

        const symbol = `${item.bot.settings.ticker.slice(0, -4)}/${item.bot.settings.ticker.slice(-4)}`

        await exchangeClient.createOrder(symbol, 'market', 'sell', item.order.quantity, item.price)
            .then(async res => {
                const percent = (res.price - item.order.buy_price) / (res.price) * 100
                const current = item.order.quantity * res.price
                const changed = current * (1 + (percent / 100))
                const profit = changed - current

                orders_update.push({
                    'updateOne': {
                        'filter': { '_id': item.order._id },
                        'update': {
                            '$set': {
                                'id': item.order._id,
                                'active': false,
                                'sell_price': res.price,
                                'percent': percent,
                                'profit': profit,
                                'close_time': new Date().toISOString()
                            }
                        }
                    }
                })
             

                bots_result.push({
                    'updateOne': {
                        'filter': { '_id': item.bot._id },
                        'update': {
                            '$push': {
                                'growth': [percent],
                                'profit': [profit]
                            }
                        }
                    }
                })

                if (item.bot.profit.length >= Number(item.bot.settings.executeTime)) {
                    bots_update.push({
                        'updateOne': {
                            'filter': { '_id': item.bot._id },
                            'update': {
                                '$set': { active: false, completed: true },
                                '$push': {
                                    'events': [
                                        {
                                            exchange: item.bot.settings.exchange,
                                            bot_id: item.bot._id,
                                            time: new Date().toISOString(),
                                            details: `Seu robô completou  ${Number(item.bot.settings.executeTime)}/${Number(item.bot.settings.executeTime)} ordens e foi finalizado com sucesso.`,
                                        }
                                    ]
                                }
                            }
                        }
                    })
                }
            })

            .catch(err => {
                close_errors.push({
                    'updateOne': {
                        'filter': { '_id': item.bot._id },
                        'update': {
                            '$push': {
                                'events': [
                                    {
                                        exchange: item.bot.settings.exchange,
                                        bot_id: item.bot._id,
                                        time: new Date().toISOString(),
                                        details: err.message,
                                    }
                                ]
                            }
                        }
                    }
                })
                console.log('close:', err.message)
            })


    }

    // bulk DB update orders closed
    if (orders_update.length > 0) {
        try {
            await Order.bulkWrite(orders_update)
        } catch (err) {
            console.log(err.message)
        }
    }

   
    // bulk DB update completed bots
    if (bots_update.length > 0) {
        try {
            await Bot.bulkWrite(bots_update)
        } catch (err) {
            console.log(err.message)
        }
    }

    // bulk DB update bot total result
    if (bots_result.length > 0) {
        try {
            await Bot.bulkWrite(bots_result)
        } catch (err) {
            console.log(err.message)
        }
    }

    // bulk DB update orders with erros
    if (close_errors.length > 0) {
        try {
            await Bot.bulkWrite(close_errors)
        } catch (err) {
            console.log(err.message)
        }
    }
}

module.exports = ccxtCloseOrder