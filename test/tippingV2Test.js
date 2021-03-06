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
const TIPPING_INTERFACE = fs.readFileSync('./contracts/v2/Tipping_v2_Interface.aes', 'utf-8');
const MOCK_ORACLE_SERVICE_CONTRACT = fs.readFileSync('./contracts/MockOracleService.aes', 'utf-8');

const config = {
    url: 'http://localhost:3001/',
    internalUrl: 'http://localhost:3001/',
    compilerUrl: 'http://localhost:3080'
};

describe('Tipping V2 Contract', () => {
    let client, contract, oracleServiceContract;

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

   it('Deploying Tipping Contract', async () => {
        contract = await client.getContractInstance(TIPPING_CONTRACT);
        const init = await contract.methods.init(oracleServiceContract.deployInfo.address, wallets[0].publicKey);
        assert.equal(init.result.returnType, 'ok');
    });

   it('Tipping Contract Version', async () => {
       assert.equal((await contract.methods.get_state()).decodedResult.version, "v2");
   });

    it('Tipping Contract: Tip', async () => {
        const tip = await contract.methods.tip('domain.test', 'Hello World', {amount : 100});
        assert.equal(tip.result.returnType, 'ok');
        assert.equal(tip.decodedResult, 0);

        const sameDomainTip = await contract.methods.tip('domain.test', 'Other Test', {amount : 100});
        assert.equal(sameDomainTip.result.returnType, 'ok');
        assert.equal(sameDomainTip.decodedResult, 1);

        const otherDomainTip = await contract.methods.tip('other.test', 'Just another Test', {amount : 100});
        assert.equal(otherDomainTip.result.returnType, 'ok');
        assert.equal(otherDomainTip.decodedResult, 2);

        const state = TippingContractUtil.getTipsRetips(await contract.methods.get_state());
        assert.lengthOf(state.tips, 3);
        assert.lengthOf(state.urls, 2);
        assert.equal(state.tips.find(t => t.id === "0_v2").total_unclaimed_amount, "100");
        assert.equal(state.tips.find(t => t.id === "0_v2").type, "AE_TIP");
        assert.equal(state.tips.find(t => t.id === "1_v2").total_unclaimed_amount, "100");
        assert.equal(state.tips.find(t => t.id === "2_v2").total_unclaimed_amount, "100");
        assert.equal((await contract.methods.unclaimed_for_url('domain.test')).decodedResult[0], 100 + 100);
        assert.equal((await contract.methods.unclaimed_for_url('other.test')).decodedResult[0], 100);

        const tips = (await contract.methods.tips_for_url('domain.test')).decodedResult;
        assert.lengthOf(tips, 2);
    });

    it('Tipping Contract: Retip', async () => {
        const retip = await contract.methods.retip(0, {amount : 77});
        assert.equal(retip.result.returnType, 'ok');
        assert.equal(retip.decodedResult, 0);

        const retipOtherTitle = await contract.methods.retip(1, {amount : 77});
        assert.equal(retipOtherTitle.result.returnType, 'ok');
        assert.equal(retipOtherTitle.decodedResult, 1);

        const state = TippingContractUtil.getTipsRetips(await contract.methods.get_state());
        assert.lengthOf(state.tips.find(t => t.id === "0_v2").retips, 1);
        assert.equal(state.tips.find(t => t.id === "0_v2").retips[0].amount, 77);
        assert.lengthOf(state.tips.find(t => t.id === "1_v2").retips, 1);
        assert.equal(state.tips.find(t => t.id === "1_v2").retips[0].amount, 77);

        assert.equal(state.tips.find(t => t.id === "0_v2").total_unclaimed_amount, "177");
        assert.equal(state.tips.find(t => t.id === "1_v2").total_unclaimed_amount, "177");
        assert.equal(state.tips.find(t => t.id === "2_v2").total_unclaimed_amount, "100");

        assert.equal(state.urls.find(u => u.url === 'domain.test').unclaimed_amount, 100 + 100 + 77 + 77);
        assert.equal((await contract.methods.unclaimed_for_url('domain.test')).decodedResult[0], 100 + 100 + 77 + 77);

        assert.lengthOf((await contract.methods.retips_for_tip(0)).decodedResult, 1);
        assert.lengthOf((await contract.methods.retips_for_tip(1)).decodedResult, 1);
        assert.lengthOf((await contract.methods.retips_for_tip(2)).decodedResult, 0);
    });

    it('Tipping Contract: Claim', async () => {
        const balanceBefore = await client.balance(wallets[1].publicKey);

        const checkClaim = await contract.methods.check_claim('domain.test', wallets[1].publicKey);
        assert.equal(checkClaim.result.returnType, 'ok');
        assert.equal(checkClaim.decodedResult.success, true);
        assert.equal(checkClaim.decodedResult.percentage, 80);

        const claim = await contract.methods.claim('domain.test', wallets[1].publicKey, false);
        assert.equal(claim.result.returnType, 'ok');

        const balanceAfter = await client.balance(wallets[1].publicKey);
        assert.strictEqual(parseInt(balanceBefore) + 100 + 100 + 77 + 77, parseInt(balanceAfter));

        const state1 = TippingContractUtil.getTipsRetips(await contract.methods.get_state());
        assert.equal(state1.tips.find(t => t.id === "0_v2").total_unclaimed_amount, "0");
        assert.equal(state1.tips.find(t => t.id === "1_v2").total_unclaimed_amount, "0");
        assert.equal(state1.tips.find(t => t.id === "2_v2").total_unclaimed_amount, "100");
        assert.equal(state1.urls.find(u => u.url === 'domain.test').unclaimed_amount, 0);

        //const zeroClaim = await contract.methods.claim('domain.test', wallets[1].publicKey, false).catch(e => e);
        //assert.include(zeroClaim.decodedError, 'NO_ZERO_AMOUNT_PAYOUT');

        await contract.methods.retip(0, {amount : 53});
        const state2 = TippingContractUtil.getTipsRetips(await contract.methods.get_state());
        assert.equal(state2.tips.find(t => t.id === "0_v2").total_unclaimed_amount, "53");
        assert.equal(state2.urls.find(u => u.url === 'domain.test').unclaimed_amount, 53);
        assert.equal((await contract.methods.unclaimed_for_url('domain.test')).decodedResult[0], 53);

        await contract.methods.claim('domain.test', wallets[1].publicKey, false);
        const balanceAfterSecond = await client.balance(wallets[1].publicKey);
        assert.equal(parseInt(balanceAfter) + 53, parseInt(balanceAfterSecond));
    });

    it('Tipping Contract Interface', async () => {
        const interface = await client.getContractInstance(TIPPING_INTERFACE, {contractAddress: contract.deployInfo.address});
        const state = await interface.methods.get_state();
        assert.equal(state.result.returnType, 'ok');

        const tipById = (await interface.methods.get_tip_by_id(1)).decodedResult;
        assert.equal(tipById.AeTip[0].sender, wallets[0].publicKey);
    });
});
