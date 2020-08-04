const {Universal, MemoryAccount, Node} = require('@aeternity/aepp-sdk');
const fs = require('fs');
const path = require('path');
const MOCK_ORACLE_CONTRACT = fs.readFileSync(path.join(__dirname, '../contracts/MockOracleService.aes'), 'utf-8');
const TIPPING_CONTRACT = fs.readFileSync(path.join(__dirname, '../contracts/Tipping_v2.aes'), 'utf-8');

const keypair = {
  secretKey: "",
  publicKey: ""
};

const config = {
  url: 'https://testnet.aeternity.io/',
  internalUrl: 'https://testnet.aeternity.io/',
  compilerUrl: 'https://latest.compiler.aepps.com'
};

const getClient = async () => {
  return Universal({
    nodes: [{
      name: 'testnet',
      instance: await Node(config)
    }],
    accounts: [MemoryAccount({keypair: keypair})],
    networkId: 'ae_uat',
    compilerUrl: config.compilerUrl
  });
};

const deploy = async () => {
  const client = await getClient();
  const oracleContract = await client.getContractInstance(MOCK_ORACLE_CONTRACT);
  await oracleContract.methods.init();

  const contract = await client.getContractInstance(TIPPING_CONTRACT);
  const init = await contract.methods.init(oracleContract.deployInfo.address, keypair.publicKey);
  console.log(init);
};

deploy();
