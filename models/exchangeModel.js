const mongoose = require('mongoose')

const exchangeSchema = new mongoose.Schema(
    {
        exchange: {
            type: String,
            required: true
        },       
        api_key: {
            type: String,
            required: true
        },
        secret_key: {
            type: String,
            required: true
        },
        user: {
            type: String,
            ref: 'users',
            required: true
        },
        passphrase: {
            type: String,
        },
    },
    {
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                ret.id = ret._id
                delete ret._id
            }
        },
        toObject: { virtuals: true },
        versionKey: false
    }
)

module.exports = mongoose.model('exchanges', exchangeSchema)