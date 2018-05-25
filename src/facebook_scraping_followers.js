
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
    return await rp(options);
  } catch (e) {
    console.log("Getting errors: " + e.message);
    return [];
  }  
}

async function normalizeProfileData(data, fb_account_id, fb_id) {
  data.facebook_account_id = fb_account_id;
  data.fb_id = fb_id;

  if (data.gender) {
    data.gender = data.gender.toLowerCase() == 'male' ? 2 : 1;
  }
  if (data.birthday) {
    // check if birthday having year
    try {
      if (data.birthday.split(" ").length == 3) {
        const timediff = +(new Date()) - +(new Date(data.birthday));
        data.age = parseInt(timediff / (1000*3600*24*365));        
      }
    } catch (e) {
      console.log("Getting errors: " + e.message);
    }
  }

  if (!data.age && data.avatar) {
    // do not have age, call azure service
    const predictData = await utils.predictAgeGender(data.avatar);
    if (predictData) {
      data.age = predictData.age;
      if (!data.gender) {
        data.gender = predictData.gender == "male" ? 2 : 1;
      }
    }
  }

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
    await page.waitFor(utils.randomTime(100, 500));
    // normalize profile data
    users[fb_id] = await normalizeProfileData(profile, fb_account_id, fb_id);
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

  let users = event.followers || {};
  const fb_account_id = event.facebook_account_id;

  let posts;
  const post = event.post;
  if (post) {
    posts = [post];
  } else {
    posts = event.posts;
  }

  if (!posts) {
    // const fb_account_id = 8323;
    posts = await getFacebookPosts(fb_account_id);
    console.log("Finish getting facebook posts");
  } else {
    posts = posts.slice(0, MAX_NUMBER_POSTS);
  }

  console.log(posts);
  for (let post of posts) {
    rotate_index = await updateCookie(page, rotate_index);
    users = await scrapeUsersEachPost(page, users, post, fb_account_id);
    console.log("done post", post);
    await page.waitFor(utils.randomTime(100, 1000));
  }
  // users = Object.values(users);
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
//   process.env.AZURE_FACE_API_SUBSCRIPTION_KEY = "c24d9924fec34a7594f412a911c39ae8";
//   const test = {"avatar": "https://scontent.fsgn5-1.fna.fbcdn.net/v/t1.0-9/31655534_360061001153204_7979231624518696960_n.jpg?_nc_cat=0&oh=6bf51909534bb07bb431e8c0b4772e22&oe=5B89327D"};
//   const data = await normalizeProfileData(test, null, null);
//   console.log(data);
//   // module.exports.run(null, null, function(status, response) {
//   //   console.log(response);
//   // });
// })();
