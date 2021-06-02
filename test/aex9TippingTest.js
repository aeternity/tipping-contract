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

const {Universal, MemoryAccount, Node} = require('@aeternity/aepp-sdk');
const TippingContractUtil = require('../util/tippingContractUtil');

const TIPPING_CONTRACT = fs.readFileSync('./contracts/v2/Tipping_v2.aes', 'utf-8');
const FUNGIBLE_TOKEN_CONTRACT = fs.readFileSync('./contracts/FungibleToken.aes', 'utf-8');
const MOCK_ORACLE_SERVICE_CONTRACT = fs.readFileSync('./contracts/MockOracleService.aes', 'utf-8');

const config = {
    url: 'http://localhost:3001/',
    internalUrl: 'http://localhost:3001/',
    compilerUrl: 'http://localhost:3080'
};

describe('AEX9 Tipping Contract', () => {
    let client, contract, oracleServiceContract, tokenContract1, tokenContract2, tippingAddress;

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
        tokenContract1 = await client.getContractInstance(FUNGIBLE_TOKEN_CONTRACT);
        const init = await tokenContract1.methods.init('AE Test Token 1', 0, 'AET1', 1000);
        assert.equal(init.result.returnType, 'ok');

        tokenContract2 = await client.getContractInstance(FUNGIBLE_TOKEN_CONTRACT);
        await tokenContract2.methods.init('AE Test Token 2', 0, 'AET2', 1000000);
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

    // 1. create allowance for tipping contract
    // 2. call tip with aex 9 function, passing token contract reference
    // 3. transfer allowance within tip function
    // 4. transfer contract tokens when claiming
    // 5. save token contract and balance, sender as tip in tipping contract claims
    // 6. enable retip with tokens

    // TODO gas measurement with linear gas usage increase of claiming token tips

    it('Tip with Token Contract', async () => {
        await tokenContract1.methods.create_allowance(tippingAddress, 333);
        await contract.methods.tip_token('domain.test', 'Hello World', tokenContract1.deployInfo.address, 333);

        const balanceTipping = await tokenContract1.methods.balance(tippingAddress)
        assert.equal(balanceTipping.decodedResult, 333);

        const balanceAdmin = await tokenContract1.methods.balance(await client.address())
        assert.equal(balanceAdmin.decodedResult, 1000 - 333);

        assert.equal((await contract.methods.unclaimed_for_url('domain.test')).decodedResult[0], 0);
        assert.deepEqual((await contract.methods.unclaimed_for_url('domain.test')).decodedResult[1], [[tokenContract1.deployInfo.address, 333]]);
    });

    it('Claim Tip with Token Contract', async () => {
        const claim = await contract.methods.claim('domain.test', wallets[1].publicKey, false);
        assert.equal(claim.result.returnType, 'ok');

        const balanceTipping = await tokenContract1.methods.balance(tippingAddress)
        assert.equal(balanceTipping.decodedResult, 0);

        const balanceClaimed = await tokenContract1.methods.balance(wallets[1].publicKey)
        assert.equal(balanceClaimed.decodedResult, 333);
    });

    it('Claim Tip with Token Contract', async () => {
        // Prepare Data
        await tokenContract1.methods.change_allowance(tippingAddress, 333);
        await contract.methods.tip_token('domain.test', 'Hello World', tokenContract1.deployInfo.address, 333);

        await tokenContract2.methods.create_allowance(tippingAddress, 333333);
        await contract.methods.tip_token('domain.test', 'Hello World 2', tokenContract2.deployInfo.address, 333333);

        await tokenContract2.methods.change_allowance(tippingAddress, 333333);
        await contract.methods.retip_token(1, tokenContract2.deployInfo.address, 333333);

        const balanceTipping = await tokenContract2.methods.balance(tippingAddress)
        assert.equal(balanceTipping.decodedResult, 333333 + 333333);

        const balanceAdmin = await tokenContract2.methods.balance(await client.address())
        assert.equal(balanceAdmin.decodedResult, 1000000 - 333333 - 333333);

        assert.equal((await contract.methods.unclaimed_for_url('domain.test')).decodedResult[0], 0);
        assert.deepEqual((await contract.methods.unclaimed_for_url('domain.test')).decodedResult[1].sort(), [[tokenContract1.deployInfo.address, 333], [tokenContract2.deployInfo.address, 333333 + 333333]].sort());

        // Claim both tokens at once
        const claim = await contract.methods.claim('domain.test', wallets[2].publicKey, false);
        assert.equal(claim.result.returnType, 'ok');

        assert.equal((await tokenContract1.methods.balance(tippingAddress)).decodedResult, 0);
        assert.equal((await tokenContract1.methods.balance(wallets[2].publicKey)).decodedResult, 333);

        assert.equal((await tokenContract2.methods.balance(tippingAddress)).decodedResult, 0);
        assert.equal((await tokenContract2.methods.balance(wallets[2].publicKey)).decodedResult, 333333 + 333333);
    });

    it('Tipping Contract Util with Tokens', async () => {
        await tokenContract1.methods.change_allowance(tippingAddress, 123);
        await contract.methods.tip_token('domain.test', 'Hello World 3', tokenContract1.deployInfo.address, 123);

        await tokenContract2.methods.change_allowance(tippingAddress, 123456);
        await contract.methods.retip_token(1, tokenContract2.deployInfo.address, 123456);

        await contract.methods.tip('other.test', 'Hello World', {amount : 100});

        const state = TippingContractUtil.getTipsRetips(await contract.methods.get_state());

        assert.equal(state.urls.find(u => u.url === 'domain.test').unclaimed_amount, 0);
        assert.deepEqual(state.urls.find(u => u.url === 'domain.test').token_unclaimed_amount.sort((a, b) => b.amount - a.amount), [
            {token: tokenContract2.deployInfo.address, amount: "123456"},
            {token: tokenContract1.deployInfo.address, amount: "123"}
        ]);

        assert.equal(state.urls.find(u => u.url === 'other.test').unclaimed_amount, 100);
        assert.deepEqual(state.urls.find(u => u.url === 'other.test').token_unclaimed_amount, []);

        assert.equal(state.tips.find(u => u.title === 'Hello World 3').amount, 0);
        assert.equal(state.tips.find(u => u.title === 'Hello World 3').type, "TOKEN_TIP");
        assert.equal(state.tips.find(u => u.title === 'Hello World 3').token_amount, 123);
        assert.equal(state.tips.find(u => u.title === 'Hello World 3').token, tokenContract1.deployInfo.address);
    });
});
