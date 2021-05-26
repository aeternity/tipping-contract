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

const {Universal, MemoryAccount, Node, Crypto} = require('@aeternity/aepp-sdk');
const TippingContractUtil = require('../util/tippingContractUtil');

const TIPPING_CONTRACT = readFileRelative('./contracts/v4/Tipping_v4.aes', 'utf-8');
const TIPPING_INTERFACE = readFileRelative('./contracts/v4/Tipping_v4_Interface.aes', 'utf-8');
const FUNGIBLE_TOKEN_CONTRACT = readFileRelative('./contracts/FungibleToken.aes', 'utf-8');

const config = {
    url: 'http://localhost:3001/',
    internalUrl: 'http://localhost:3001/',
    compilerUrl: 'http://localhost:3080'
};

describe('Tipping V4 Contract', () => {
    let client, contract, tokenContract, tippingAddress;

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
        const init = await tokenContract.methods.init('AE Test Token 1', 0, 'AET1', 1000);
        assert.equal(init.result.returnType, 'ok');
    });

    it('Deploying Tipping Contract', async () => {
        contract = await client.getContractInstance(TIPPING_CONTRACT);
        const init = await contract.methods.init();
        assert.equal(init.result.returnType, 'ok');

        tippingAddress = contract.deployInfo.address.replace('ct_', 'ak_');
    });

    it('Tipping Contract Version', async () => {
        assert.equal((await contract.methods.version()).decodedResult, "v4");
    });

    //TODO test token supply drop by burn, test failure without allowance
    it('Tipping Contract: Post without tip', async () => {
        await tokenContract.methods.create_allowance(tippingAddress, 100);
        const post = await contract.methods.post_via_burn('Hello World', ['media1', 'media2'], tokenContract.deployInfo.address, 100);
        assert.equal(post.result.returnType, 'ok');

        const state = TippingContractUtil.getTipsRetips(await contract.methods.get_state());
        assert.lengthOf(state.tips, 1);
        console.log(state);
        assert.equal(state.tips.find(t => t.id === "0_v4").title, 'Hello World');
        assert.deepEqual(state.tips.find(t => t.id === "0_v4").media, ['media1', 'media2']);
    });

    it('Tipping Contract Interface', async () => {
        const interface = await client.getContractInstance(TIPPING_INTERFACE, {contractAddress: contract.deployInfo.address});
        const state = await interface.methods.get_state();
        assert.equal(state.result.returnType, 'ok');
    });
});
