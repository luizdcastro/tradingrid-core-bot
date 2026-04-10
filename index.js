const express = require('express')
const dotenv = require('dotenv')
const mongoose = require('mongoose')
const processBots = require('./controllers/processBots')

dotenv.config({ path: './config.env' })

if (!process.env.DB_CONNECT) {
    console.error('FATAL: DB_CONNECT is not set in config.env')
    process.exit(1)
}

mongoose
    .connect(process.env.DB_CONNECT)
    .then(() => {
        console.log('DB connection successful!')
        processBots()
    })
    .catch(err => {
        console.error('DB connection failed:', err.message)
        process.exit(1)
    })

const app = express()
const port = process.env.PORT || 8001
app.listen(port, () => console.log(`Running on port ${port}`))
