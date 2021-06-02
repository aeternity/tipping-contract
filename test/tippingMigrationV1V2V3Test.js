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

const fs = require('fs');
const assert = require('chai').assert;
const {defaultWallets: wallets} = require('../config/wallets.json');

const {Universal, MemoryAccount, Node, Crypto} = require('@aeternity/aepp-sdk');
const TippingContractUtil = require('../util/tippingContractUtil');

const TIPPING_CONTRACT_V1 = fs.readFileSync('./contracts/v1/Tipping_v1.aes', 'utf-8');
const TIPPING_CONTRACT_V2 = fs.readFileSync('./contracts/v2/Tipping_v2.aes', 'utf-8');
const TIPPING_CONTRACT_V3 = fs.readFileSync('./contracts/v3/Tipping_v3.aes', 'utf-8');
const MOCK_ORACLE_SERVICE_CONTRACT = fs.readFileSync('./contracts/MockOracleService.aes', 'utf-8');
const FUNGIBLE_TOKEN_CONTRACT = fs.readFileSync('./contracts/FungibleToken.aes', 'utf-8');

const config = {
    url: 'http://localhost:3001/',
    internalUrl: 'http://localhost:3001/',
    compilerUrl: 'http://localhost:3080'
};

describe('Tipping Contract Migration V1 V2 V3', () => {
    let client, contractV1, contractV2, contractV3, tippingAddress;

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

    it('Deploy Contracts', async () => {
        oracleServiceContract = await client.getContractInstance(MOCK_ORACLE_SERVICE_CONTRACT);
        await oracleServiceContract.methods.init();

        tokenContract = await client.getContractInstance(FUNGIBLE_TOKEN_CONTRACT);
        await tokenContract.methods.init('AE Test Token', 0, 'AET', 10000);

        contractV1 = await client.getContractInstance(TIPPING_CONTRACT_V1);
        await contractV1.methods.init(oracleServiceContract.deployInfo.address, wallets[0].publicKey);

        contractV2 = await client.getContractInstance(TIPPING_CONTRACT_V2);
        await contractV2.methods.init(oracleServiceContract.deployInfo.address);
        tippingAddress = contractV2.deployInfo.address.replace('ct_', 'ak_');

        contractV3 = await client.getContractInstance(TIPPING_CONTRACT_V3);
        await contractV3.methods.init();
    });

    it('Generate Sample State in V1 Contract', async () => {
        await contractV1.methods.tip('domain.test', 'Hello World', {amount: 1});
        await contractV1.methods.retip(0, {amount: 2});
        await contractV1.methods.claim('domain.test', wallets[1].publicKey, false);

        await contractV1.methods.tip('domain.test', 'Other Test', {amount: 4});

        await contractV1.methods.tip('other.test', 'Just another Test', {amount: 8});
        await contractV1.methods.retip(2, {amount: 16});

        const state = TippingContractUtil.getTipsRetips(await contractV1.methods.get_state());
        assert.equal(state.urls.find(u => u.url === 'domain.test').unclaimed_amount, 4);
        assert.equal(state.urls.find(u => u.url === 'other.test').unclaimed_amount, 24);
    });

    it('Generate Sample State in V2 Contract', async () => {
        await contractV2.methods.tip('domain.test', 'Hello World', {amount: 1});
        await contractV2.methods.retip(0, {amount: 2});
        await contractV2.methods.claim('domain.test', wallets[1].publicKey, false);

        await contractV2.methods.tip('domain.test', 'Other Test', {amount: 4});

        await contractV2.methods.tip('other.test', 'Just another Test', {amount: 8});
        await contractV2.methods.retip(2, {amount: 16});

        await tokenContract.methods.create_allowance(tippingAddress, 444);
        await contractV2.methods.tip_token('domain.test', 'Hello World Token', tokenContract.deployInfo.address, 444);

        await tokenContract.methods.change_allowance(tippingAddress, 555);
        await contractV2.methods.retip_token(0, tokenContract.deployInfo.address, 555);

        await contractV2.methods.tip_direct(wallets[3].publicKey, 'Hello World Direct', {amount: 10000});

        await tokenContract.methods.change_allowance(tippingAddress, 333);
        await contractV2.methods.tip_token_direct(wallets[3].publicKey, 'Hello World Direct Token', tokenContract.deployInfo.address, 333);

        const state = TippingContractUtil.getTipsRetips(await contractV2.methods.get_state());
        assert.equal(state.urls.find(u => u.url === 'domain.test').unclaimed_amount, 4);
        assert.equal(state.urls.find(u => u.url === 'other.test').unclaimed_amount, 24);
    });

    it('Generate Sample State in V3 Contract', async () => {
        await contractV3.methods.post_without_tip('Hello World', ['media1', 'media2']);

        let hash = Crypto.hash(TippingContractUtil.postWithoutTippingString('a', ['b', 'c']));
        let signature = Crypto.signPersonalMessage(hash, Buffer.from(wallets[1].secretKey, 'hex'));

        await contractV3.methods.post_without_tip_sig('a', ['b', 'c'], wallets[1].publicKey, signature);

        const state = TippingContractUtil.getTipsRetips(await contractV3.methods.get_state());
        assert.lengthOf(state.tips, 2);
        assert.equal(state.tips.find(t => t.id === "0_v3").title, 'Hello World');
        assert.equal(state.tips.find(t => t.id === "1_v3").title, 'a');
        assert.deepEqual(state.tips.find(t => t.id === "1_v3").media, ['b', 'c']);
    });

    it('Aggregate V1, V2 and V3 state', async () => {
        const state = TippingContractUtil.getTipsRetips(await contractV1.methods.get_state(), await contractV2.methods.get_state(), await contractV3.methods.get_state());
        assert.equal(state.urls.find(u => u.url === 'domain.test').unclaimed_amount, 8);
        assert.equal(state.urls.find(u => u.url === 'other.test').unclaimed_amount, 48);
        assert.deepEqual(state.urls.find(u => u.url === 'domain.test').token_unclaimed_amount, [{
            "token": tokenContract.deployInfo.address,
            "amount": String(555 + 444)
        }]);

        assert.lengthOf(state.tips, 11);
        assert.lengthOf(state.tips.filter(t => t.id.startsWith("0")), 3);
        assert.lengthOf(state.tips.filter(t => t.id.startsWith("0") && t.contractId === contractV1.deployInfo.address), 1);
        assert.lengthOf(state.tips.filter(t => t.id.startsWith("0") && t.contractId === contractV2.deployInfo.address), 1);
        assert.lengthOf(state.tips.filter(t => t.id.startsWith("0") && t.contractId === contractV3.deployInfo.address), 1);
        assert.lengthOf(state.tips.filter(t => t.id === "0_v1" && t.contractId === contractV1.deployInfo.address), 1);
        assert.lengthOf(state.tips.filter(t => t.id === "0_v2" && t.contractId === contractV2.deployInfo.address), 1);
        assert.lengthOf(state.tips.filter(t => t.id === "0_v3" && t.contractId === contractV3.deployInfo.address), 1);

        assert.equal(state.tips.find(t => t.id === "0_v3").title, 'Hello World');
        assert.equal(state.tips.find(t => t.id === "1_v3").title, 'a');
        assert.deepEqual(state.tips.find(t => t.id === "1_v3").media, ['b', 'c']);
    });
});
