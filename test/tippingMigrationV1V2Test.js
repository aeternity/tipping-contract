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

const assert = require('chai').assert
const {readFileRelative} = require('aeproject-utils/utils/fs-utils');
const {defaultWallets: wallets} = require('aeproject-config/config/node-config.json');

const {Universal, MemoryAccount, Node} = require('@aeternity/aepp-sdk');
const TippingContractUtil = require('../util/tippingContractUtil');

const TIPPING_CONTRACT_V1 = readFileRelative('./contracts/v1/Tipping_v1.aes', 'utf-8');
const TIPPING_CONTRACT_V2 = readFileRelative('./contracts/v2/Tipping_v2.aes', 'utf-8');
const MOCK_ORACLE_SERVICE_CONTRACT = readFileRelative('./contracts/MockOracleService.aes', 'utf-8');
const FUNGIBLE_TOKEN_CONTRACT = readFileRelative('./contracts/FungibleToken.aes', 'utf-8');

const config = {
    url: 'http://localhost:3001/',
    internalUrl: 'http://localhost:3001/',
    compilerUrl: 'http://localhost:3080'
};

describe('Tipping Contract Migration V1 V2', () => {
    let client, contractV1, contractV2, tippingAddress;

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
        await contractV2.methods.init(oracleServiceContract.deployInfo.address, wallets[0].publicKey);
        tippingAddress = contractV2.deployInfo.address.replace('ct_', 'ak_');
    });


    it('Generate Sample State in V1 Contract', async () => {
        await contractV1.methods.tip('domain.test', 'Hello World', {amount: 1});
        await contractV1.methods.retip(0, {amount: 2});
        await contractV1.methods.claim('domain.test', wallets[1].publicKey, false);

        await contractV1.methods.tip('domain.test', 'Other Test', {amount: 4});

        await contractV1.methods.tip('other.test', 'Just another Test', {amount: 8});
        await contractV1.methods.retip(2, {amount: 16});

        const state = TippingContractUtil.getTipsRetips({[contractV1.deployInfo.address]: "v1"}, await contractV1.methods.get_state());
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

        const state = TippingContractUtil.getTipsRetips({[contractV2.deployInfo.address]: "v2"}, await contractV2.methods.get_state());
        assert.equal(state.urls.find(u => u.url === 'domain.test').unclaimed_amount, 4);
        assert.equal(state.urls.find(u => u.url === 'other.test').unclaimed_amount, 24);
    });

    it('Aggregate V1 and V2 state', async () => {
        const versionMapping = {
            [contractV1.deployInfo.address]: "v1",
            [contractV2.deployInfo.address]: "v2",
        }
        const state = TippingContractUtil.getTipsRetips(versionMapping, await contractV1.methods.get_state(), await contractV2.methods.get_state());
        assert.equal(state.urls.find(u => u.url === 'domain.test').unclaimed_amount, 8);
        assert.equal(state.urls.find(u => u.url === 'other.test').unclaimed_amount, 48);
        assert.deepEqual(state.urls.find(u => u.url === 'domain.test').token_unclaimed_amount, [{
            "token": tokenContract.deployInfo.address,
            "amount": String(555 + 444)
        }]);

        assert.lengthOf(state.tips, 9);
        assert.lengthOf(state.tips.filter(t => t.id.startsWith("0")), 2);
        assert.lengthOf(state.tips.filter(t => t.id.startsWith("0") && t.contractId === contractV1.deployInfo.address), 1);
        assert.lengthOf(state.tips.filter(t => t.id.startsWith("0") && t.contractId === contractV2.deployInfo.address), 1);
        assert.lengthOf(state.tips.filter(t => t.id === "0_v1" && t.contractId === contractV1.deployInfo.address), 1);
        assert.lengthOf(state.tips.filter(t => t.id === "0_v2" && t.contractId === contractV2.deployInfo.address), 1);
    });
});
