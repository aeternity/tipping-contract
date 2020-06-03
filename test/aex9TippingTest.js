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

const TIPPING_CONTRACT = utils.readFileRelative('./contracts/Tipping.aes', 'utf-8');
const FUNGIBLE_TOKEN_CONTRACT = utils.readFileRelative('./contracts/FungibleToken.aes', 'utf-8');
const MOCK_ORACLE_SERVICE_CONTRACT = utils.readFileRelative('./contracts/MockOracleService.aes', 'utf-8');

const config = {
    url: 'http://localhost:3001/',
    internalUrl: 'http://localhost:3001/',
    compilerUrl: 'http://localhost:3080'
};

describe('AEX9 Tipping Contract', () => {
    let client, contract, oracleServiceContract, tokenContract;

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
        const init = await tokenContract.methods.init('AE Test Token', 0, 'AETT', 1000);
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
    });

    // 1. create allowance for tipping contract
    // 2. call tip with aex 9 function, passing token contract reference
    // 3. transfer allowance within tip function
    // TODO 4. save token contract and balance, sender as tip in tipping contract, poss. claim gen per (url_id * TokenContract)
    // TODO 5. transfer contract tokens when claiming
    // TODO 6. enable retip with tokens

    it('Tip with Token Contract', async () => {
        const tippingAddress = contract.deployInfo.address.replace('ct_', 'ak_');

        await tokenContract.methods.create_allowance(tippingAddress, 333);
        await contract.methods.tip_token('domain.test', 'Hello World', tokenContract.deployInfo.address, 333);

        const balanceTipping = await tokenContract.methods.balance(tippingAddress)
        assert.equal(balanceTipping.decodedResult, 333);

        const balanceAdmin = await tokenContract.methods.balance(await client.address())
        assert.equal(balanceAdmin.decodedResult, 1000 - 333);
    });

});
