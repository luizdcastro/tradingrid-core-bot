const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
    {
        _id: {
            type: String,
            required: true
        },
        createdAt: {
            type: Date,
            default: Date.now
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

userSchema.virtual('exchanges', {
    ref: 'exchanges',
    foreignField: 'user',
    localField: '_id'
})

userSchema.virtual('bots', {
    ref: 'bots',
    foreignField: 'user',
    localField: '_id'
})

const User = mongoose.model('users', userSchema)

module.exports = User