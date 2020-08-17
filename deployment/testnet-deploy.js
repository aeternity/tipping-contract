const {Universal, MemoryAccount, Node} = require('@aeternity/aepp-sdk');
const fs = require('fs');
const path = require('path');
const TIPPING_V1_CONTRACT = fs.readFileSync(path.join(__dirname, '../contracts/v1/Tipping_v1.aes'), 'utf-8');
const TIPPING_V2_CONTRACT = fs.readFileSync(path.join(__dirname, '../contracts/v2/Tipping_v2.aes'), 'utf-8');

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
  const oracleContractAddress = ""

  const contractV1 = await client.getContractInstance(TIPPING_V1_CONTRACT);
  await contractV1.methods.init(oracleContractAddress, keypair.publicKey);
  console.log("v1", contractV1.deployInfo.address);

  const contractV2 = await client.getContractInstance(TIPPING_V2_CONTRACT);
  await contractV2.methods.init(oracleContractAddress);
  console.log("v2", contractV2.deployInfo.address);
};

deploy();
