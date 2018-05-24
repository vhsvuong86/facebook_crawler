
const setup = require('./starter-kit/setup');
const rp = require('request-promise');
const utils = require('./common/utils');
//const fb_cookie = require('./common/fb_cookie');
const fb_rotate = require('./common/fb_rotate');
const fb_scraping = require('./facebook_scraping');

const MAX_NUMBER_USERS = 10;
const MAX_NUMBER_POSTS = 10;
const TIMEOUT = 3000;
const LIKE_LINK_SELECTOR = "a[href*='reaction/profile']._2x4v";
const REACTION_LIST_SELECTOR = "#reaction_profile_browser";


// process.env.CASTING_ASIA_AUTHORIZATION = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYWR2ZXJ0aXNlciIsImV4cCI6MTgzMjA1MTgxNn0.PsISOdLsP7G8t0INLjZ2JeXP9NnaI01ye_wdI-Pd8nk";
// process.env.CASTING_ASIA_API = "https://dev-api.casting-asia.com";
// const puppeteer = require('puppeteer');


async function getFacebookPosts(fb_account_id) {
  const casting_asia_headers = {
    'Authorization': process.env.CASTING_ASIA_AUTHORIZATION,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  const request_uri = `${process.env.CASTING_ASIA_API}/facebook_posts?order=created.desc&limit=${MAX_NUMBER_POSTS}&select=fb_id&facebook_account_id=eq.${fb_account_id}`;
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

function normalizeProfileData(data, fb_account_id, fb_id) {
  data.facebook_account_id = fb_account_id;
  data.fb_id = fb_id;
  return data;
}

async function scrapeUsersEachPost(page, users, post_id, fb_account_id) {
  const temp = post_id.split("_");
  await page.goto(`https://www.facebook.com/${temp[0]}/posts/${temp[1]}`);
  try {
    await page.waitForSelector('.UFIList', {visible:true, timeout: TIMEOUT});
    await page.click(LIKE_LINK_SELECTOR);
    await page.waitForSelector(REACTION_LIST_SELECTOR, {visible:true, timeout: TIMEOUT});    
  } catch (e) {
    return users;
  }

  await page.waitFor(utils.randomTime(100, 2000));

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

  // console.log("start users scraping");
  for (let item of items) {
    const fb_id = utils.stripFbID(item);
    if (users[fb_id]) {
      continue;
    }
    console.log("user id: ", fb_id);
    let profile = await fb_scraping.getFullUserInfo(page, fb_id);
    await page.waitFor(utils.randomTime(100, 1000));
    // normalize profile data
    users[fb_id] = normalizeProfileData(profile, fb_account_id, fb_id);
  }
  return users;
}


async function updateCookie(page, rotate_index = 0) {
  const temp = fb_rotate.getCookieInfo(rotate_index);

  await page.setCookie(...temp[1].cookie);
  await page.setUserAgent(temp[1].agent);  

  return temp[0];
}

module.exports.run = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.time('counting');
  const browser = await setup.getBrowser();
  // const browser = await puppeteer.launch({headless: false});
  const page = await browser.newPage();
  page.setViewport({width: 1200, height: 1000});

  let rotate_index = 0;
  //if (fb_cookie) { await page.setCookie(...fb_cookie); }

  let users = {};
  // const fb_account_id = 8323;
  const fb_account_id = event.facebook_account_id
  const posts = await getFacebookPosts(fb_account_id);
  console.log("Finish getting facebook posts");

  for (let post of posts) {
    console.log(post);
    rotate_index = await updateCookie(page, rotate_index);
    users = await scrapeUsersEachPost(page, users, post.fb_id, fb_account_id);
    console.log("done one post");
    await page.waitFor(utils.randomTime(100, 2000));
  }
  users = Object.values(users);
  // console.log(users);

  const response = {
    followers: users
  };

  await browser.close();
  console.timeEnd('counting');

  //callback(null, { statusCode: 200, body: JSON.stringify(response) });
  callback(null, response);
};

// (async () => {
//   module.exports.run(null, null, null);
// })();
