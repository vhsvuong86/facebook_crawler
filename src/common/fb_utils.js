const utils = require('./utils');

// fields=id,cover,name,gender,birthday,about,picture.width(9999)
async function getInfluencerInfo(id) {
  return await utils.fetch(`/facebook_accounts?is_fanpage=eq.false&influencer_id=eq.${id}`);
}

module.exports.getInfluencerInfo = getInfluencerInfo;
