const BigNumber = require('bignumber.js');

const tippingContractUtil = {};

tippingContractUtil.getTipsRetips = (state) => {
  const findUrl = (urlId) => state.urls.find(([_, id]) => urlId === id)[0];

  const findClaimGen = (tipClaimGen, urlId) => {
    const [_, data] = state.claims.find(([id, _]) => id === urlId);

    return {
      unclaimed: tipClaimGen > data[0],
      claim_gen: data[0],
      unclaimed_amount: data[1],
      token_unclaimed_amount: data[2] ? data[2].map(unclaimed_token => ({
        token: unclaimed_token[0],
        amount: unclaimed_token[1]
      })) : []
    };
  };

  const findRetips = (tipId, urlId) => state.retips.filter(([_, data]) => data.tip_id === tipId).map(([id, data]) => {
    data.id = id;
    data.claim = findClaimGen(data.claim_gen, urlId);
    data.token = data.token ? data.token : null;
    data.token_amount = data.token_amount ? data.token_amount : 0;

    return data;
  });

  const tips = state.tips.map(([id, data]) => {
    data.id = id;
    data.url = findUrl(data.url_id);
    data.retips = findRetips(id, data.url_id);
    data.claim = findClaimGen(data.claim_gen, data.url_id);

    data.token = data.token ? data.token : null;
    data.token_amount = data.token_amount ? data.token_amount : 0;

    data.total_amount = new BigNumber(data.amount).plus(data.retips.reduce((acc, retip) => {
      return acc.plus(retip.amount)
    }, new BigNumber('0'))).toFixed();

    data.token_total_amount = data.retips.reduce((acc, retip) => {
      if (retip.token) acc[retip.token] = acc[retip.token]
        ? acc[retip.token].plus(retip.token_amount)
        : new BigNumber(retip.token_amount)
      return acc;
    }, data.token ? {[data.token]: new BigNumber(data.token_amount)} : {});

    data.total_unclaimed_amount = new BigNumber(data.claim.unclaimed ? data.amount : 0).plus(data.retips.reduce((acc, retip) => {
      return acc.plus(retip.claim.unclaimed ? retip.amount : 0)
    }, new BigNumber('0'))).toFixed();

    data.total_claimed_amount = new BigNumber(data.claim.unclaimed ? 0 : data.amount).plus(data.retips.reduce((acc, retip) => {
      return acc.plus(retip.claim.unclaimed ? 0 : retip.amount)
    }, new BigNumber('0'))).toFixed();

    const token_total_unclaimed = data.retips.reduce((acc, retip) => {
      if (retip.token) acc[retip.token] = acc[retip.token]
        ? acc[retip.token].plus(retip.claim.unclaimed ? retip.token_amount : 0)
        : new BigNumber(retip.claim.unclaimed ? retip.token_amount : 0)
      return acc;
    }, data.token ? {[data.token]: new BigNumber(data.claim.unclaimed ? data.token_amount : 0)} : {});

    data.token_total_unclaimed_amount = Object.entries(token_total_unclaimed)
      .map(([token, amount]) => ({token, amount}));

    return data;
  });

  const urls = state.urls.map(([url, id]) => {
    const urlTips = tips.filter(tip => tip.url_id === id);
    const claim = state.claims.find(([urlId, _]) => urlId === id)[1];

    return {
      url: url,
      tip_ids: urlTips.map(tip => tip.id),
      retip_ids: urlTips.flatMap(tip => tip.retips.map(retip => retip.id)),
      unclaimed_amount: claim[1],
      token_unclaimed_amount: claim[2] ? claim[2].map(unclaimed_token => ({
        token: unclaimed_token[0],
        amount: unclaimed_token[1]
      })) : []
    };
  });

  return {
    urls: urls,
    tips: tips
  };
};

tippingContractUtil.claimableAmount = (state, url) => {
  const urlIdFind = state.decodedResult.urls.find(([u, _]) => url === u);
  if(!urlIdFind || !urlIdFind.length) throw new Error("Url not found");
  const urlId = urlIdFind[1];
  const claimFind = state.decodedResult.claims.find(([id, _ ]) => urlId === id);
  return claimFind.length ? claimFind[1][1] : 0;
};

module.exports = tippingContractUtil;
