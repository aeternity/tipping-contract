# Tipping Contract & Util

## Util Example

```javascript
const TIPPING_INTERFACE = fs.readFileSync('./contracts/TippingInterface.aes', 'utf-8');
const TippingContractUtil = require('./util/tippingContractUtil');

...
const interface = await client.getContractInstance(TIPPING_INTERFACE, {contractAddress: contract.deployInfo.address});
const state = TippingContractUtil.getTipsRetips((await contract.methods.get_state()).decodedResult);

/*
{
 urls: [
   {
     url: 'domain.test',
     tip_ids: [...],
     retip_ids: [...],
     unclaimed_amount: 0
   },
 ],
 tips: [
   {
     amount: 100,
     claim_gen: 1,
     sender: 'ak_fUq2NesPXcYZ1CcqBcGC3StpdnQw3iVxMA3YSeCNAwfN4myQk',
     timestamp: 1582834604691,
     title: 'Hello World',
     url_id: 0,
     id: 0,
     url: 'domain.test',
     retips: [...],
     claim: [...],
     total_amount: '230',
     total_unclaimed_amount: '0'
   }
 ]
}
*/
```

