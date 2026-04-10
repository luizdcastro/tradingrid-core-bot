const Bot = require('../models/botModel')
const Order = require('../models/orderModel')
const Indicator = require('../models/indicatorModel')
const CronJob = require('cron').CronJob
const closeCcxt = require('./BotOrder/closeCcxt')
const openCcxt = require('./BotOrder/openCcxt')
const openDemo = require('./BotOrder/openDemo')
const closeDemo = require('./BotOrder/closeDemo')

const processBots = async () => {

    try {
        const bots = await Bot.aggregate([
            { $match: { active: true } },
        ])

        const orders = await Order.aggregate([
            { $match: { active: true } },
        ])

        const indicators = await Indicator.find()

        console.log(`${bots.length} active bots were found.`)

        let open_list = []
        let close_list = []
        let open_ccxt = []
        let open_demo = []
        let close_ccxt = []
        let close_demo = []

        for (const bot of bots) {

            const active_order = orders.filter(order => String(order.bot) === String(bot._id))

            if (active_order.length > 0) {
                close_list.push({ 'bot': bot, 'order': active_order[0] })
            } else {
                open_list.push(bot)
            }
        }

        for (const bot of open_list) {

            if (bot.settings.exchange === 'Testnet') {
                open_demo.push(bot)
            } else {
                open_ccxt.push(bot)
            }
        }

        for (const bot of close_list) {

            if (bot.bot.settings.exchange === 'Testnet') {
                close_demo.push(bot)
            } else {
                close_ccxt.push(bot)
            }
        }

        await Promise.all([
            openDemo(open_demo, indicators),
            openCcxt(open_ccxt, indicators),
            closeDemo(close_demo, indicators),
            closeCcxt(close_ccxt, indicators),
        ])

    } catch (err) {
        console.log(err)
    }
}

const job = new CronJob('0 * * * * *', async () => processBots())

job.start()

module.exports = processBots