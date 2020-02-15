/*
 * ISC License (ISC)
 * Copyright (c) 2018 aeternity developers
 *
 *  Permission to use, copy, modify, and/or distribute this software for any
 *  purpose with or without fee is hereby granted, provided that the above
 *  copyright notice and this permission notice appear in all copies.
 *
 *  THE SOFTWARE IS PROVIDED 'AS IS' AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 *  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 *  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 *  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 *  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 *  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 *  PERFORMANCE OF THIS SOFTWARE.
 */
const {Universal, MemoryAccount, Node} = require('@aeternity/aepp-sdk');

const TIPPING_PAY_FOR_TX_CONTRACT = utils.readFileRelative('./contracts/tipping-payfortx.aes', 'utf-8');

const range = (start, end) => (new Array(end - start + 1)).fill(undefined).map((_, i) => i + start);
Array.prototype.asyncMap = async function (asyncF) {
    return this.reduce(async (promiseAcc, cur) => {
        const acc = await promiseAcc;
        const res = await asyncF(cur).catch(e => {
            console.error("asyncMap asyncF", e.message);
            return null;
        });
        if (Array.isArray(res)) {
            return acc.concat(res);
        } else {
            if (res) acc.push(res);
            return acc;
        }
    }, Promise.resolve([]));
};

const config = {
    url: 'http://localhost:3001/',
    internalUrl: 'http://localhost:3001/',
    compilerUrl: 'http://localhost:3080'
};

describe('Tipping Payfortx Contract', () => {
    let client, contract;

    before(async () => {
        client = await Universal({
            nodes: [{
                name: 'devnetNode',
                instance: await Node(config)
            }],
            accounts: [MemoryAccount({
                keypair: wallets[0]
            })],
            networkId: 'ae_devnet',
            compilerUrl: config.compilerUrl
        });
    });

    it('Deploying Tipping Payfortx Contract', async () => {
        contract = await client.getContractInstance(TIPPING_PAY_FOR_TX_CONTRACT);
        const init = await contract.methods.init(wallets[0].publicKey);
        assert.equal(init.result.returnType, 'ok');
    });

    it('Tipping Payfortx Contract: Tip', async () => {
        const tip = await contract.methods.tip('domain.test', 'Hello World', {amount : 100});
        assert.equal(tip.result.returnType, 'ok');

        const sameDomainTip = await contract.methods.tip('domain.test', 'Other Test', {amount : 100});
        assert.equal(sameDomainTip.result.returnType, 'ok');

        const otherDomainTip = await contract.methods.tip('other.test', 'Just another Test', {amount : 100});
        assert.equal(otherDomainTip.result.returnType, 'ok');
    });

    it('Tipping Payfortx Contract: Retip', async () => {
        const retip = await contract.methods.retip(0, {amount : 77});
        assert.equal(retip.result.returnType, 'ok');

        const retipOtherTitle = await contract.methods.retip(1, {amount : 77});
        assert.equal(retipOtherTitle.result.returnType, 'ok');
    });

    it('Tipping Payfortx Contract: Claim', async () => {
        const balanceBefore = await client.balance(wallets[1].publicKey);

        const claim = await contract.methods.claim('domain.test', wallets[1].publicKey);
        assert.equal(claim.result.returnType, 'ok');

        const balanceAfter = await client.balance(wallets[1].publicKey);
        assert.strictEqual(parseInt(balanceBefore) + 100 + 100 + 77 + 77, parseInt(balanceAfter));

        const zeroClaim = await contract.methods.claim('domain.test', wallets[1].publicKey).catch(e => e);
        assert.include(zeroClaim.decodedError, 'NO_ZERO_AMOUNT_PAYOUT');

        await contract.methods.retip(0, {amount : 53});
        await contract.methods.claim('domain.test', wallets[1].publicKey);
        const balanceAfterSecond = await client.balance(wallets[1].publicKey);
        assert.equal(parseInt(balanceAfter) + 53, parseInt(balanceAfterSecond));
    });

});
