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

const assert = require('assert')
const {readFileRelative} = require('aeproject-utils/utils/fs-utils');
const {defaultWallets: wallets} = require('aeproject-config/config/node-config.json');

const {Universal, MemoryAccount, Node} = require('@aeternity/aepp-sdk');
const TippingContractUtil = require('../util/tippingContractUtil');

const TIPPING_CONTRACT = readFileRelative('./contracts/migration/Tipping_v2.aes', 'utf-8');
const TIPPING_CONTRACT_V1 = readFileRelative('./contracts/migration/Tipping_v1.aes', 'utf-8');
const MOCK_ORACLE_SERVICE_CONTRACT = readFileRelative('./contracts/MockOracleService.aes', 'utf-8');

const config = {
    url: 'http://localhost:3001/',
    internalUrl: 'http://localhost:3001/',
    compilerUrl: 'http://localhost:3080'
};

describe('Tipping Contract Migration V1 V2', () => {
    let client, contractV1, migrationContract, contractV2;
    let stateBeforeMigration, stateAfterMigration;

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

    it('Deploying Tipping MockOracleService Contract', async () => {
        oracleServiceContract = await client.getContractInstance(MOCK_ORACLE_SERVICE_CONTRACT);
        const init = await oracleServiceContract.methods.init();
        assert.equal(init.result.returnType, 'ok');
    });

    it('Deploying Tipping V1 Contract', async () => {
        contractV1 = await client.getContractInstance(TIPPING_CONTRACT_V1);
        const init = await contractV1.methods.init(oracleServiceContract.deployInfo.address, wallets[0].publicKey);
        assert.equal(init.result.returnType, 'ok');
    });

    it('Generate Sample State in V1 Contract', async () => {
        await contractV1.methods.tip('domain.test', 'Hello World', {amount : 1});
        await contractV1.methods.retip(0, {amount : 2});
        await contractV1.methods.claim('domain.test', wallets[1].publicKey, false);

        await contractV1.methods.tip('domain.test', 'Other Test', {amount : 4});

        await contractV1.methods.tip('other.test', 'Just another Test', {amount : 8});
        await contractV1.methods.retip(2, {amount : 16});

        stateBeforeMigration = TippingContractUtil.getTipsRetips((await contractV1.methods.get_state()).decodedResult);
        assert.equal(stateBeforeMigration.urls.find(u => u.url === 'domain.test').unclaimed_amount, 4);
        assert.equal(stateBeforeMigration.urls.find(u => u.url === 'other.test').unclaimed_amount, 24);
    });

    it('Deploying Tipping V2 Contract', async () => {
        contractV2 = await client.getContractInstance(TIPPING_CONTRACT);
        const init = await contractV2.methods.init(contractV1.deployInfo.address);
        assert.equal(init.result.returnType, 'ok');
    });

    it('Check V2 State after Migration', async () => {
        stateAfterMigration = TippingContractUtil.getTipsRetips((await contractV2.methods.get_state()).decodedResult);
        assert.deepEqual(stateAfterMigration, stateBeforeMigration);
    });
});
