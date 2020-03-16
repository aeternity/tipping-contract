const {Universal, MemoryAccount, Node} = require('@aeternity/aepp-sdk');
const fs = require('fs');
const path = require('path');
const TIPPING_CONTRACT = fs.readFileSync(path.join(__dirname, '../contracts/Tipping.aes'), 'utf-8');

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
  contract = await client.getContractInstance(TIPPING_CONTRACT);

  const init = await contract.methods.init("ct_4J8gn4wp55fKZiJPJAzvfHiMk9eLs8M5XsLVQgLEPnCvNqxiQ", keypair.publicKey);
  console.log(init);
};

deploy();
