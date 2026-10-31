const openLogic = require('../BotLogic/openLogic')
const Order = require('../../models/orderModel')
const Bot = require('../../models/botModel')
const Exchange = require('../../models/exchangeModel')
const ccxt = require('ccxt')
const { decrypt } = require('../../utils/secrets')

async function ccxtOpenOrder(bots, indicator) {

    let open_ccxt = []
    let exchange_ids = []
    let exchange_secrets = []
    let open_success = []
    let open_error = []

    for (const bot of bots) {
        const symbol = bot.settings.ticker
        const timeframe = bot.settings.timeframe
        const filtered = indicator.filter(item => item.symbol === symbol)

        const response = await openLogic(bot, filtered[0], timeframe)

        if (response.logic) {
            open_ccxt.push({ bot: bot, price: response.price })
        }
    }

    for (const item of open_ccxt) {
        exchange_ids.push(item.bot.settings.exchange.id)
    }

    const exchanges = await Exchange.find({
        '_id': { $in: exchange_ids }
    })

    for (const exchange of exchanges) {
        exchange_secrets.push({
            id: exchange._id,
            api_key: decrypt(exchange.api_key),
            secret_key: decrypt(exchange.secret_key),
            user: exchange.user,
            name: exchange.exchange,
            passphrase: decrypt(exchange.passphrase)
        })
    }

    for (const item of open_ccxt) {

        let quantity
        let balance

        const credentials = exchange_secrets.find(element => element.id == item.bot.settings.exchange.id)

        const exchangeClient = new ccxt[credentials.name]({
            apiKey: credentials.api_key, secret: credentials.secret_key, password: credentials.passphrase
        })

        try {
            balance = await exchangeClient.fetchBalance()
        } catch (err) {
            open_error.push(
                {
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
                }
            )
            break
        }

        const symbol = `${item.bot.settings.ticker.slice(0, -4)}/${item.bot.settings.ticker.slice(-4)}`
        const percent = Number((item.bot.settings.funds / 100) * balance.total.USDT)
        quantity = Number(percent / item.price)

        await exchangeClient.createOrder(symbol, 'market', 'buy', quantity, item.price)
            .then(async res => {
                open_success.push({
                    user: item.bot.user,
                    bot: item.bot._id,
                    active: true,
                    quantity: res.amount,
                    buy_price: res.price,
                    open_time: new Date().toISOString()
                })
            })
            .catch(err => {
                open_error.push(
                    {
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
                    }
                )

                if (item.bot.events.length >= Number(item.bot.settings.executeTime) * 2) {
                    open_error.push({
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
                                            details: `Seu robô falhou muitas vezes e foi finalizado. Revise as configurações de conta e estratégia.`,
                                        }
                                    ]
                                }
                            }
                        }
                    })
                }
            })


    }

    // bulk DB update orders created
    if (open_success.length > 0) {
        try {
            await Order.insertMany(open_success)
        } catch (err) {
            console.log(err.message)
        }
    }

    // bulk DB update orders failed
    if (open_error.length > 0) {
        try {
            await Bot.bulkWrite(open_error)
        } catch (err) {
            console.log(err.message)
        }
    }
}

module.exports = ccxtOpenOrder