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

  const tips = state.tips.map(([id, tipTypeData]) => {
    const [tipType, tipData] = Object.entries(tipTypeData)[0];
    switch (tipType) {
      case 'AeTip':
        data = tipData[0];
        data.url_id = tipData[1];
        data.amount = tipData[2];
        data.claim_gen = tipData[3];
        break;
      case 'TokenTip':
        data = tipData[0];
        data.url_id = tipData[1];
        data.token = tipData[2].token;
        data.token_amount = tipData[2].amount;
        data.claim_gen = tipData[3];
        data.amount = 0;
        break;
      case 'DirectAeTip':
        data = tipData[0];
        data.receiver = tipData[1];
        data.amount = tipData[2];
        break;
      case 'DirectTokenTip':
        data = tipData[0];
        data.receiver = tipData[1];
        data.token = tipData[2].token;
        data.token_amount = tipData[2].amount;
        data.amount = 0;
        break;
    }

    data.type = tipType
    data.id = id;
    const hasClaim = data.claim_gen !== undefined && data.url_id !== undefined;
    data.url = hasClaim ? findUrl(data.url_id) : null;
    data.retips = hasClaim ? findRetips(id, data.url_id) : [];
    data.claim = hasClaim ? findClaimGen(data.claim_gen, data.url_id) : null;

    data.token = data.token ? data.token : null;
    data.token_amount = data.token_amount ? data.token_amount : 0;

    data.total_amount = new BigNumber(data.amount).plus(data.retips.reduce((acc, retip) => {
      return acc.plus(retip.amount)
    }, new BigNumber('0'))).toFixed();

    const token_total_amount = data.retips.reduce((acc, retip) => {
      if (retip.token) acc[retip.token] = acc[retip.token]
        ? acc[retip.token].plus(retip.token_amount)
        : new BigNumber(retip.token_amount)
      return acc;
    }, data.token ? {[data.token]: new BigNumber(data.token_amount)} : {});

    data.token_total_amount = Object.entries(token_total_amount)
      .map(([token, amount]) => ({token, amount}));

    data.total_unclaimed_amount = hasClaim ? new BigNumber(data.claim.unclaimed ? data.amount : 0).plus(data.retips.reduce((acc, retip) => {
      return acc.plus(retip.claim.unclaimed ? retip.amount : 0)
    }, new BigNumber('0'))).toFixed() : '0';

    data.total_claimed_amount = hasClaim ? new BigNumber(data.claim.unclaimed ? 0 : data.amount).plus(data.retips.reduce((acc, retip) => {
      return acc.plus(retip.claim.unclaimed ? 0 : retip.amount)
    }, new BigNumber('0'))).toFixed() : '0';

    const token_total_unclaimed = hasClaim ? data.retips.reduce((acc, retip) => {
      if (retip.token) acc[retip.token] = acc[retip.token]
        ? acc[retip.token].plus(retip.claim.unclaimed ? retip.token_amount : 0)
        : new BigNumber(retip.claim.unclaimed ? retip.token_amount : 0)
      return acc;
    }, data.token ? {[data.token]: new BigNumber(data.claim.unclaimed ? data.token_amount : 0)} : {}) : '0';

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
