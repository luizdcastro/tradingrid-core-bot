const test = require('node:test')
const assert = require('node:assert')

process.env.EXCHANGE_SECRET_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const { encrypt, decrypt, fingerprint, PREFIX } = require('../utils/secrets')

test('a secret comes back the same after a round trip', () => {
    const stored = encrypt('my-secret-key')
    assert.ok(stored.startsWith(PREFIX))
    assert.ok(!stored.includes('my-secret-key'))
    assert.strictEqual(decrypt(stored), 'my-secret-key')
})

test('the same secret encrypts differently every time', () => {
    assert.notStrictEqual(encrypt('same'), encrypt('same'))
})

test('values saved before encryption pass through', () => {
    assert.strictEqual(decrypt('plain-legacy-value'), 'plain-legacy-value')
    assert.strictEqual(decrypt(undefined), undefined)
})

test('a tampered value is rejected', () => {
    const stored = encrypt('my-secret-key')
    const parts = stored.split(':')
    parts[parts.length - 1] = Buffer.from('tampered').toString('base64')
    assert.throws(() => decrypt(parts.join(':')))
})

test('the fingerprint is stable and does not contain the key', () => {
    assert.strictEqual(fingerprint('abc'), fingerprint('abc'))
    assert.notStrictEqual(fingerprint('abc'), fingerprint('abd'))
    assert.ok(!fingerprint('abc').includes('abc'))
})

test('a missing or malformed EXCHANGE_SECRET_KEY fails loudly', () => {
    const saved = process.env.EXCHANGE_SECRET_KEY
    process.env.EXCHANGE_SECRET_KEY = 'short'
    assert.throws(() => encrypt('x'), /EXCHANGE_SECRET_KEY/)
    process.env.EXCHANGE_SECRET_KEY = saved
})
