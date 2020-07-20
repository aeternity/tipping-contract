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
const TippingContractUtil = require('../util/tippingContractUtil');

const TIPPING_CONTRACT = utils.readFileRelative('./contracts/Tipping_v2_Standalone.aes', 'utf-8');
const FUNGIBLE_TOKEN_CONTRACT = utils.readFileRelative('./contracts/FungibleToken.aes', 'utf-8');
const MOCK_ORACLE_SERVICE_CONTRACT = utils.readFileRelative('./contracts/MockOracleService.aes', 'utf-8');

const config = {
    url: 'http://localhost:3001/',
    internalUrl: 'http://localhost:3001/',
    compilerUrl: 'http://localhost:3080'
};

describe.skip('Direct Tipping Contract', () => {
    let client, contract, tippingAddress, oracleServiceContract, tokenContract;

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

    it('Deploying Token Contract', async () => {
        tokenContract = await client.getContractInstance(FUNGIBLE_TOKEN_CONTRACT);
        const init = await tokenContract.methods.init('AE Test Token', 0, 'AET', 1000);
        assert.equal(init.result.returnType, 'ok');
    });


    it('Deploying MockOracleService Contract', async () => {
        oracleServiceContract = await client.getContractInstance(MOCK_ORACLE_SERVICE_CONTRACT);
        const init = await oracleServiceContract.methods.init();
        assert.equal(init.result.returnType, 'ok');
    });

    it('Deploying Tipping Contract', async () => {
        contract = await client.getContractInstance(TIPPING_CONTRACT);
        const init = await contract.methods.init(oracleServiceContract.deployInfo.address, wallets[0].publicKey);
        assert.equal(init.result.returnType, 'ok');

        tippingAddress = contract.deployInfo.address.replace('ct_', 'ak_');
    });

    it('Direct Tip', async () => {
        const balanceBefore = await client.getBalance(wallets[3].publicKey);
        const tip = await contract.methods.tip_direct(wallets[3].publicKey, 'Hello World', {amount : 10000});
        assert.equal(tip.result.returnType, 'ok');
        assert.equal(tip.decodedResult, 0);

        const state = TippingContractUtil.getTipsRetips((await contract.methods.get_state()).decodedResult);
        assert.equal(state.tips.find(t => t.id === 0).amount, "10000");
        assert.lengthOf(state.tips, 1);

        const balanceAfter = await client.getBalance(wallets[3].publicKey);
        assert.equal(parseInt(balanceBefore), parseInt(balanceAfter) - 10000);
    });

    it('Direct Tip with Token Contract', async () => {
        await tokenContract.methods.create_allowance(tippingAddress, 333);
        await contract.methods.tip_token_direct(wallets[3].publicKey, 'Hello World', tokenContract.deployInfo.address, 333);

        const balanceTipping = await tokenContract.methods.balance(wallets[3].publicKey)
        assert.equal(balanceTipping.decodedResult, 333);

        const balanceAdmin = await tokenContract.methods.balance(wallets[0].publicKey)
        assert.equal(balanceAdmin.decodedResult, 1000 - 333);

        const state = TippingContractUtil.getTipsRetips((await contract.methods.get_state()).decodedResult);
        assert.equal(state.tips.find(t => t.id === 1).token_amount, "333");
        assert.lengthOf(state.tips, 2);
    });
});
