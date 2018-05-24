const savedCookie = [{"name":"fr","value":"0wYV1EvEacMCPldvi.AWULX4HO2_krkGauEfc1icSK-6E.BbA5Q8.77.FsD.0.0.BbA5RH.AWUw2sJp","domain":".facebook.com","path":"/","expires":1534737223.565506,"size":81,"httpOnly":true,"secure":true,"session":false},{"name":"presence","value":"EDvF3EtimeF1526961225EuserFA21B25087202053A2EstateFDutF1526961225653CEchFDp_5f1B25087202053F2CC","domain":".facebook.com","path":"/","expires":-1,"size":103,"httpOnly":false,"secure":true,"session":true},{"name":"pl","value":"n","domain":".facebook.com","path":"/","expires":1534737220.330497,"size":3,"httpOnly":true,"secure":true,"session":false},{"name":"xs","value":"6%3ACH6bDoddNiedbw%3A2%3A1526961220%3A19041%3A15662","domain":".facebook.com","path":"/","expires":1534737220.330305,"size":53,"httpOnly":true,"secure":true,"session":false},{"name":"datr","value":"PJQDW8cdzr-LcF18M2nJZSyN","domain":".facebook.com","path":"/","expires":1590033215.56493,"size":28,"httpOnly":true,"secure":true,"session":false},{"name":"c_user","value":"100025087202053","domain":".facebook.com","path":"/","expires":1534737220.330227,"size":21,"httpOnly":false,"secure":true,"session":false},{"name":"wd","value":"1200x1000","domain":".facebook.com","path":"/","expires":1527566023,"size":11,"httpOnly":false,"secure":true,"session":false},{"name":"sb","value":"PJQDWzQqhIOukAT51gPZnLSz","domain":".facebook.com","path":"/","expires":1590033220.330091,"size":26,"httpOnly":true,"secure":true,"session":false}];

const setup = require('./starter-kit/setup');
const rp = require('request-promise');
const utils = require('./common/utils');

const MAX_NUMBER_USERS = 20;
const LIKE_LINK_SELECTOR = "a[href*='reaction/profile']._2x4v";
const REACTION_LIST_SELECTOR = "#reaction_profile_browser";


process.env.CASTING_ASIA_AUTHORIZATION = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYWR2ZXJ0aXNlciIsImV4cCI6MTgzMjA1MTgxNn0.PsISOdLsP7G8t0INLjZ2JeXP9NnaI01ye_wdI-Pd8nk";
process.env.CASTING_ASIA_API = "https://dev-api.casting-asia.com";
const puppeteer = require('puppeteer');


async function getFacebookPosts(fb_account_id) {
  const casting_asia_headers = {
    'Authorization': process.env.CASTING_ASIA_AUTHORIZATION,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  const request_uri = `${process.env.CASTING_ASIA_API}/facebook_posts?select=fb_id&facebook_account_id=eq.${fb_account_id}`;
  const options = {
    method: 'GET',
    headers: casting_asia_headers,
    json: true,
    uri: request_uri
  };
  try {
    const response = await rp(options);
    return response;
  } catch (e) {
    console.log("Getting errors: " + e.message);
    return [];
  }  
}

async function scrapeUserProfile(fid) {
  return {
    gender: "female",
    age: 19,
    address: "Vietnam",
    fb_id: fid
  }
}

async function scrapeUsersEachPost(page, users, post_id) {
  const temp = post_id.split("_");
  await page.goto(`https://www.facebook.com/${temp[0]}/posts/${temp[1]}`);
  try {
    await page.waitForSelector('.UFIList', {visible:true, timeout: 5000});
    await page.click(LIKE_LINK_SELECTOR);
    await page.waitForSelector(REACTION_LIST_SELECTOR, {visible:true, timeout: 5000});    
  } catch (e) {
    return users;
  }

  const selector = `${REACTION_LIST_SELECTOR} a._5i_s`;
  const items = await page.evaluate((selector, limitUsers)=>{
    let elements = [].slice.call(document.querySelectorAll(selector));
    elements = elements.slice(0, limitUsers);
    const items = [];
    for (let it of elements) {
      items.push(it.href);
    }
    return items;
  }, selector, MAX_NUMBER_USERS);

  for (let item of items) {
    const fid = utils.stripFbID(item);
    if (users[fid]) {
      continue;
    }
    users[fid] = await scrapeUserProfile(fid);
  }
  return users;
}


module.exports.run = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.time('counting');
  const browser = await setup.getBrowser();
  const page = await browser.newPage();
  page.setViewport({width: 1200, height: 1000});

  if (savedCookie) {
    await page.setCookie(...savedCookie);
  }

  let users = {};
  const posts = await getFacebookPosts(8322);
  //const posts = await getFacebookPosts(event.facebook_account_id);
  console.log("Finish getting facebook posts");

  for (let post in posts) {
    users = await scrapeUsersEachPost(page, users, post.fb_id);
  }
  users = Object.values(users);

  const response = {
    followers: users
  }

  await browser.close();
  console.timeEnd('counting');

  //callback(null, response);
};

(async () => {
  module.exports.run(null, null, null);
})();
