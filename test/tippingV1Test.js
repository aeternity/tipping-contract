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

const TIPPING_CONTRACT = readFileRelative('./contracts/v1/Tipping_v1.aes', 'utf-8');
const TIPPING_INTERFACE = readFileRelative('./contracts/v1/Tipping_v1_Interface.aes', 'utf-8');
const MOCK_ORACLE_SERVICE_CONTRACT = readFileRelative('./contracts/MockOracleService.aes', 'utf-8');

const config = {
  url: 'http://localhost:3001/',
  internalUrl: 'http://localhost:3001/',
  compilerUrl: 'http://localhost:3080'
};

describe('Tipping V1 Contract', () => {
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

  it('Tipping Contract: Tip', async () => {
    const tip = await contract.methods.tip('domain.test', 'Hello World', {amount : 100});
    assert.equal(tip.result.returnType, 'ok');

    const sameDomainTip = await contract.methods.tip('domain.test', 'Other Test', {amount : 100});
    assert.equal(sameDomainTip.result.returnType, 'ok');

    const otherDomainTip = await contract.methods.tip('other.test', 'Just another Test', {amount : 100});
    assert.equal(otherDomainTip.result.returnType, 'ok');

    const state = TippingContractUtil.getTipsRetips(await contract.methods.get_state());
    assert.lengthOf(state.tips, 3);
    assert.lengthOf(state.urls, 2);
    assert.equal(state.tips.find(t => t.id === "0_v1").total_unclaimed_amount, "100");
    assert.equal(state.tips.find(t => t.id === "0_v1").type, "AE_TIP");
    assert.equal(state.tips.find(t => t.id === "1_v1").total_unclaimed_amount, "100");
    assert.equal(state.tips.find(t => t.id === "2_v1").total_unclaimed_amount, "100");
    assert.equal((await contract.methods.unclaimed_for_url('domain.test')).decodedResult, 100 + 100);
    assert.equal((await contract.methods.unclaimed_for_url('other.test')).decodedResult, 100);

    const tips = (await contract.methods.tips_for_url('domain.test')).decodedResult;
    assert.lengthOf(tips, 2);
  });

  it('Tipping Contract: Retip', async () => {
    const retip = await contract.methods.retip(0, {amount : 77});
    assert.equal(retip.result.returnType, 'ok');

    const retipOtherTitle = await contract.methods.retip(1, {amount : 77});
    assert.equal(retipOtherTitle.result.returnType, 'ok');

    const state = TippingContractUtil.getTipsRetips(await contract.methods.get_state());
    assert.lengthOf(state.tips.find(t => t.id === "0_v1").retips, 1);
    assert.equal(state.tips.find(t => t.id === "0_v1").retips[0].amount, 77);
    assert.lengthOf(state.tips.find(t => t.id === "1_v1").retips, 1);
    assert.equal(state.tips.find(t => t.id === "1_v1").retips[0].amount, 77);

    assert.equal(state.tips.find(t => t.id === "0_v1").total_unclaimed_amount, "177");
    assert.equal(state.tips.find(t => t.id === "1_v1").total_unclaimed_amount, "177");
    assert.equal(state.tips.find(t => t.id === "2_v1").total_unclaimed_amount, "100");

    assert.equal(state.urls.find(u => u.url === 'domain.test').unclaimed_amount, 100 + 100 + 77 + 77);
    assert.equal((await contract.methods.unclaimed_for_url('domain.test')).decodedResult, 100 + 100 + 77 + 77);

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
    assert.equal(state1.tips.find(t => t.id === "0_v1").total_unclaimed_amount, "0");
    assert.equal(state1.tips.find(t => t.id === "1_v1").total_unclaimed_amount, "0");
    assert.equal(state1.tips.find(t => t.id === "2_v1").total_unclaimed_amount, "100");
    assert.equal(state1.urls.find(u => u.url === 'domain.test').unclaimed_amount, 0);

    const zeroClaim = await contract.methods.claim('domain.test', wallets[1].publicKey, false).catch(e => e);
    assert.include(zeroClaim.decodedError, 'NO_ZERO_AMOUNT_PAYOUT');

    await contract.methods.retip(0, {amount : 53});
    const state2 = TippingContractUtil.getTipsRetips(await contract.methods.get_state());
    assert.equal(state2.tips.find(t => t.id === "0_v1").total_unclaimed_amount, "53");
    assert.equal(state2.urls.find(u => u.url === 'domain.test').unclaimed_amount, 53);
    assert.equal((await contract.methods.unclaimed_for_url('domain.test')).decodedResult, 53);

    await contract.methods.claim('domain.test', wallets[1].publicKey, false);
    const balanceAfterSecond = await client.balance(wallets[1].publicKey);
    assert.equal(parseInt(balanceAfter) + 53, parseInt(balanceAfterSecond));
  });

  it('Tipping Contract: change oracle service', async () => {
    const state1 = (await contract.methods.get_state()).decodedResult;
    assert.equal(state1.oracle_service, oracleServiceContract.deployInfo.address);

    oracleServiceContract = await client.getContractInstance(MOCK_ORACLE_SERVICE_CONTRACT);
    await oracleServiceContract.methods.init();

    const claim = await contract.methods.change_oracle_service(oracleServiceContract.deployInfo.address);
    assert.equal(claim.result.returnType, 'ok');

    const state2 = (await contract.methods.get_state()).decodedResult;
    assert.equal(state2.oracle_service, oracleServiceContract.deployInfo.address)
  });

  it('Tipping Contract: migrate balance', async () => {
    const claim = await contract.methods.migrate_balance(wallets[2].publicKey);
    assert.equal(claim.result.returnType, 'ok');
    assert.equal(await client.balance(contract.deployInfo.address), 0);
  });

  it('Tipping Contract Interface Check', async () => {
    const interface = await client.getContractInstance(TIPPING_INTERFACE, {contractAddress: contract.deployInfo.address});
    const state = (await interface.methods.get_state()).decodedResult;
    assert.equal(state.owner, wallets[0].publicKey);
  });

});
