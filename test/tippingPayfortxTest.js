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

        const state = await contract.methods.get_state();

        assert.equal(state.decodedResult.tip_urls[0][0], 'domain.test');
        assert.deepEqual(state.decodedResult.tip_urls[0][1], [0]);

        assert.equal(state.decodedResult.tips[0][0], 0);
        assert.equal(state.decodedResult.tips[0][1].Tip[0].id, 0);
        assert.equal(state.decodedResult.tips[0][1].Tip[0].sender, wallets[0].publicKey);
        assert.equal(state.decodedResult.tips[0][1].Tip[0].repaid, false);
        assert.equal(state.decodedResult.tips[0][1].Tip[0].url, 'domain.test');
        assert.equal(state.decodedResult.tips[0][1].Tip[0].title, 'Hello World');
        assert.equal(state.decodedResult.tips[0][1].Tip[0].amount, 100);
        assert.deepEqual(state.decodedResult.tips[0][1].Tip[0].retip_ids, []);
    });

    it('Tipping Payfortx Contract: Retip', async () => {
        const tip = await contract.methods.retip(0, {amount : 100});
        assert.equal(tip.result.returnType, 'ok');

        const state = await contract.methods.get_state();

        assert.equal(state.decodedResult.tip_urls[0][0], 'domain.test');
        assert.deepEqual(state.decodedResult.tip_urls[0][1], [1, 0]);

        assert.equal(state.decodedResult.tips[1][1].ReTip[0].amount, 100);
        assert.equal(state.decodedResult.tips[1][1].ReTip[0].sender, wallets[0].publicKey);
        assert.equal(state.decodedResult.tips[1][1].ReTip[0].repaid, false);

        assert.equal(state.decodedResult.tips[0][0], 0);
        assert.equal(state.decodedResult.tips[0][1].Tip[0].amount, 100);
        assert.deepEqual(state.decodedResult.tips[0][1].Tip[0].retip_ids, [1]);
    });

    it('Tipping Payfortx Contract: Claim', async () => {
        const balanceBefore = await client.balance(wallets[1].publicKey);
        const claim = await contract.methods.claim('domain.test', wallets[1].publicKey);
        assert.equal(claim.result.returnType, 'ok');

        const balanceAfter = await client.balance(wallets[1].publicKey);
        assert.equal(parseInt(balanceBefore) + 200, parseInt(balanceAfter));

        const state = await contract.methods.get_state();
        assert.equal(state.decodedResult.tips[0][1].Tip[0].repaid, true);
        assert.equal(state.decodedResult.tips[1][1].ReTip[0].repaid, true);
    });

});
