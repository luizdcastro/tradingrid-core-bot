// Exchange credentials at rest: AES-256-GCM with EXCHANGE_SECRET_KEY (64 hex characters, the same value in
// tradingrid-api and tradingrid-core-bot). Values saved before encryption have no prefix and are returned as they are.
const crypto = require('crypto')

const PREFIX = 'enc:v1:'

function key() {
    const hex = process.env.EXCHANGE_SECRET_KEY || ''
    if (!/^[0-9a-f]{64}$/i.test(hex)) {
        throw new Error('EXCHANGE_SECRET_KEY must be 64 hex characters (openssl rand -hex 32)')
    }
    return Buffer.from(hex, 'hex')
}

function encrypt(plain) {
    if (plain === undefined || plain === null || plain === '') return plain
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
    return PREFIX + [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join(':')
}

function decrypt(stored) {
    if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return stored
    const [iv, tag, data] = stored.slice(PREFIX.length).split(':').map(part => Buffer.from(part, 'base64'))
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

// A keyed hash of an API key, so the same key can't be connected twice without storing or searching the key itself.
function fingerprint(apiKey) {
    return crypto.createHmac('sha256', key()).update(String(apiKey)).digest('hex')
}

module.exports = { encrypt, decrypt, fingerprint, PREFIX }
