const rp = require('request-promise');

const LIKE_LINK_SELECTOR = "._nzn1h";
const LIKE_LIST_SELECTOR = "._ms7sh";
const SCROLL_DELAY = 500; // 0.5 second
const CASTING_ASIA_API = 'https://dev-api.casting-asia.com';
const CASTING_HEADERS = {
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYWR2ZXJ0aXNlciIsImV4cCI6MTgzMjA1MTgxNn0.PsISOdLsP7G8t0INLjZ2JeXP9NnaI01ye_wdI-Pd8nk',
  'Content-Type': 'application/json',
};

module.exports.getBigInstagramImageUrl = async (user_id) => {
  const uri_base = `https://i.instagram.com/api/v1/users/${user_id}/info`;
  const data = await rp({uri: uri_base, json: true});
  return data.user.hd_profile_pic_url_info.url;
};

module.exports.predictAgeGender = async (imageUrl) => {
  if (!imageUrl) {
    return {};
  }

  // can have issue "RateLimitExceeded"
  const uri_base = 'https://southeastasia.api.cognitive.microsoft.com/face/v1.0/detect';
  const headers = {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": process.env.AZURE_FACE_API_SUBSCRIPTION_KEY
  };

  const options = {
    method: 'POST',
    uri: uri_base,
    qs: {
      returnFaceAttributes: 'age,gender',
      language: 'en'
    },
    body: {url: imageUrl},
    json: true,
    headers: headers
  }
  try {
    const data = await rp(options);
    if (data.length == 1) {
      return {'age': data[0]["faceAttributes"]["age"], 'gender': data[0]["faceAttributes"]["gender"]};
    }
  } catch (e) {
    console.log("Getting face detect errors: " + e.message);
  }

  return {};
};

module.exports.simulateScroll = async (page, item, likeTargetCount) => {
  await page.goto(`https://www.instagram.com/p/${item.shortcode}`);
  await page.waitForSelector(LIKE_LINK_SELECTOR, {visible: true});
  await page.click(LIKE_LINK_SELECTOR);

  let previousHeight;
  let currentHeight;

  await page.waitForSelector(LIKE_LIST_SELECTOR, {visible: true});
  let times = parseInt((likeTargetCount - 24) / 12) + 1;
  // console.log("--times", times);
  // scroll down to get more likes, we get 24 likes each time scrolling

  while (times > 0) {
    // continue scrolling down
    previousHeight = await page.evaluate('document.querySelector("._ms7sh").scrollHeight');
    await page.evaluate(`document.querySelector("._ms7sh").scrollTop = ${previousHeight}`);
    await page.waitFor(SCROLL_DELAY);

    currentHeight = await page.evaluate('document.querySelector("._ms7sh").scrollHeight');
    if (currentHeight == previousHeight) {
      break; // nothing to get
    }
    times -= 1;
  }
};

module.exports.scrapeAgeGender = async (page, userList, likeTargetCount) => {
  let picUrl;
  let data;
  let info = {
    ages: [],
    male: 0,
    female: 0
  };

  const chunk = likeTargetCount;
  console.log("start predict age", userList.length);

  let counter = 0;
  for (let u of userList) {
    //picUrl = await getBigImageUrl(u);
    data = await module.exports.predictAgeGender(u.url);

    if (data.age) {
      info.ages.push(data.age);
    }
    if (data.gender === 'male') info.male += 1;
    if (data.gender === 'female') info.female += 1;

    if (counter % chunk === 0) {
      // prevent blocking
      await page.waitFor(SCROLL_DELAY);
      console.log("done batch");
    }
    counter += 1;
  }
  // console.log(info);
  return info;
};


module.exports.randomTime = (min, max) => {
  return Math.random() * (max - min) + min;
};

module.exports.fetch = async (url, body) => {
  const options = {
    method: 'GET',
    uri: `${CASTING_ASIA_API}${url}`,
    qs: {},
    body,
    json: true,
    headers: CASTING_HEADERS,
  };
  return await rp(options);
};

module.exports.stripFbID = (url) => {
  let temp = url.split("id=");
  if (temp.length == 2) {
    return temp[1].split("&")[0];
  }

  temp = url.split("fref=");
  temp = temp[0].split("/");
  return temp.pop();
};

