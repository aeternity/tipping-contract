const BigNumber = require('bignumber.js');

const tippingContractUtil = {};

tippingContractUtil.getTipsRetips = (...states) => {
  if (!Array.isArray(states) || (Array.isArray(states) && states.length === 0)) throw Error("states must be passed as additional arguments");

  // not very performant nesting of reduces
  const aggregatedStates = states.reduce((acc, cur) => {
    if (!cur.result || !cur.decodedResult) throw Error("full returned tx state must be passed");
    const aggregation = aggregateState(cur);
    acc.urls = aggregation.urls.reduce((accUrls, curUrl) => {
      // if has url in accumulator, replace with updated values, otherwise just add to accumulator
      if (accUrls[curUrl.url]) {
        accUrls[curUrl.url] = {
            url: curUrl.url,
            tip_ids: accUrls[curUrl.url].tip_ids.concat(curUrl.tip_ids),
            retip_ids: accUrls[curUrl.url].retip_ids.concat(curUrl.retip_ids),
            unclaimed_amount: new BigNumber(accUrls[curUrl.url].unclaimed_amount).plus(curUrl.unclaimed_amount).toFixed(),
            token_unclaimed_amount: Object.entries(accUrls[curUrl.url].token_unclaimed_amount.concat(curUrl.token_unclaimed_amount)
              .reduce((accToken, curToken) => {
                var oldAmount = accToken[curToken.token] ? accToken[curToken.token].amount : 0;
                accToken[curToken.token] = new BigNumber(oldAmount).plus(curToken.amount).toFixed();
                return accToken;
              }, {})).map(([token, amount]) => ({token, amount}))
          }
      } else {
        accUrls[curUrl.url] = curUrl;
      }

      return accUrls;
    }, acc.urls);

    acc.tips = acc.tips.concat(aggregation.tips);
    return acc;
  }, {
    urls: {},
    tips: []
  });

  aggregatedStates.urls = Object.values(aggregatedStates.urls);
  return aggregatedStates;
};

const aggregateState = (returnState) => {
  const state = returnState.decodedResult;
  const suffix = `_${state.version || "v1"}`
  const findUrl = (urlId) => state.urls.find(([_, id]) => urlId === id)[0];

  const findClaimGen = (tipClaimGen, urlId) => {
    // unpack option and backwards compatibility to int
    if (tipClaimGen === undefined || tipClaimGen === null) return null;
    const claimGen = tipClaimGen.length === 2 && tipClaimGen[0] === "Some" ? tipClaimGen[1] : tipClaimGen;
    const [_, data] = state.claims.find(([id, _]) => id === urlId);

    return {
      unclaimed: claimGen > data[0],
      claim_gen: data[0],
      unclaimed_amount: data[1],
      token_unclaimed_amount: data[2] ? data[2].map(unclaimed_token => ({
        token: unclaimed_token[0],
        amount: new BigNumber(unclaimed_token[1]).toFixed()
      })) : []
    };
  };

  const findRetips = (tipId, urlId) => state.retips.filter(([_, data]) => data.tip_id === tipId).map(([id, data]) => {
    data.id = id + suffix;
    data.tip_id = data.tip_id + suffix;
    data.claim_gen = data.claim_gen === undefined ? null : data.claim_gen;
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
        data.type = tipType;
        data.url_id = tipData[1];
        data.amount = tipData[2];
        data.claim_gen = tipData[3];
        break;
      case 'TokenTip':
        data = tipData[0];
        data.type = tipType;
        data.url_id = tipData[1];
        data.token = tipData[2].token;
        data.token_amount = tipData[2].amount;
        data.claim_gen = tipData[3];
        data.amount = 0;
        break;
      case 'DirectAeTip':
        data = tipData[0];
        data.type = tipType;
        data.receiver = tipData[1];
        data.amount = tipData[2];
        break;
      case 'DirectTokenTip':
        data = tipData[0];
        data.type = tipType;
        data.receiver = tipData[1];
        data.token = tipData[2].token;
        data.token_amount = tipData[2].amount;
        data.amount = 0;
        break;
      case 'PostWithoutTip':
        data = tipData[0];
        data.type = tipType;
        data.media = tipData[1];
        data.amount = 0;
        break;
      default:
        data = tipTypeData; // Fallback for old contract state format
        data.type = 'AeTip';
        break;
    }

    data.id = id + suffix;
    data.contractId = returnState.result.contractId;

    data.url = data.url_id !== undefined ? findUrl(data.url_id) : null;
    data.retips = data.url_id !== undefined ? findRetips(id, data.url_id) : [];

    data.claim_gen = data.claim_gen === "None" || data.claim_gen === undefined ? null : data.claim_gen;
    data.claim = data.url_id !== undefined ? findClaimGen(data.claim_gen, data.url_id) : null;

    data.token = data.token !== undefined ? data.token : null;
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

    data.total_unclaimed_amount = data.claim ? new BigNumber(data.claim.unclaimed ? data.amount : 0).plus(data.retips.reduce((acc, retip) => {
      return acc.plus(retip.claim.unclaimed ? retip.amount : 0)
    }, new BigNumber('0'))).toFixed() : '0';

    data.total_claimed_amount = data.claim ? new BigNumber(data.claim.unclaimed ? 0 : data.amount).plus(data.retips.reduce((acc, retip) => {
      return acc.plus(retip.claim.unclaimed ? 0 : retip.amount)
    }, new BigNumber('0'))).toFixed() : '0';

    const token_total_unclaimed = data.claim ? data.retips.reduce((acc, retip) => {
      if (retip.token) acc[retip.token] = acc[retip.token]
        ? acc[retip.token].plus(retip.claim.unclaimed ? retip.token_amount : 0)
        : new BigNumber(retip.claim.unclaimed ? retip.token_amount : 0)
      return acc;
    }, data.token !== null ? {[data.token]: new BigNumber(data.claim.unclaimed ? data.token_amount : 0)} : {}) : {};

    data.token_total_unclaimed_amount = Object.entries(token_total_unclaimed)
      .map(([token, amount]) => ({token, amount}));

    return data;
  });

  const urls = state.urls ? state.urls.map(([url, id]) => {
    const urlTips = tips.filter(tip => tip.url_id === id);
    const claim = state.claims.find(([urlId, _]) => urlId === id);

    return {
      url: url,
      tip_ids: urlTips.map(tip => tip.id),
      retip_ids: urlTips.flatMap(tip => tip.retips.map(retip => retip.id)),

      // map is [url_id, [claim_gen, amount, [token, token_amount]]]
      unclaimed_amount: claim ? String(claim[1][1]) : "0",
      token_unclaimed_amount: claim && claim[1][2] ? claim[1][2].map(unclaimed_token => ({
        token: unclaimed_token[0],
        amount: String(unclaimed_token[1])
      })) : []
    };
  }) : [];

  return {
    urls: urls,
    tips: tips
  };
};

tippingContractUtil.postWithoutTippingString = (title, media)  => title + media.join('');

tippingContractUtil.claimableAmount = (state, url) => {
  const urlIdFind = state.decodedResult.urls.find(([u, _]) => url === u);
  if (!urlIdFind || !urlIdFind.length) throw new Error("Url not found");
  const urlId = urlIdFind[1];
  const claimFind = state.decodedResult.claims.find(([id, _]) => urlId === id);
  return claimFind.length ? claimFind[1][1] : 0;
};

module.exports = tippingContractUtil;
