//const setup = require('./starter-kit/setup');
const setup = require('./starter-kit/setup');
const puppeteer = require('puppeteer');
const fb_cookie = require('./common/fb_cookie');
const fb_utils = require('./common/fb_utils');
const TIMEOUT = 3000;

const FIELD_MAPPING = {
  'Gender': 'gender',
  'Languages': 'language',
  'Birthday': 'birthday',
};


async function getBasicInfo(page, fb_id) {
  await page.goto(`https://www.facebook.com/${fb_id}/about?section=contact-info`);
  return await page.evaluate((FIELD_MAPPING) => {
    const result = {};
    // name
    result['name'] = document.querySelector('#fb-timeline-cover-name a').innerText;
    // avatar
    const avatar = document.querySelector('.profilePicThumb img');
    result['avatar'] = avatar.getAttribute('src');
    // cover
    result['cover'] = document.querySelector('.coverPhotoImg').getAttribute('src');
    // gender, language
    document.querySelectorAll('.uiList li').forEach(elm => {
      const spans = elm.querySelectorAll('span');
      const texts = [...spans].map(span => span.innerText).filter(Boolean);
      if (texts.length === 2 && texts[0] in FIELD_MAPPING) {
        result[FIELD_MAPPING[texts[0]]] = texts[1];
      }
    });

    return result;
  }, FIELD_MAPPING);
}

async function getIntro(page) {
  const selector = 'li.fbTimelineUnit #intro_container_id';
  try {
    await page.waitForSelector(selector, {visible: true, timeout: TIMEOUT});
  } catch (e) {
    return {followers: 0};
  }

  return page.evaluate(async (selector) => {
    const result = {followers: 0};
    try {
      const timeLine = document.querySelector(selector);
      const introElm = timeLine.querySelector('div div');
      if (introElm) {
        result['intro'] = introElm.innerText;
      }
      const timeLineText = timeLine.innerText;
      if (timeLineText) {
        timeLineText.split('\n').forEach((item) => {
          if (item.startsWith('From')) {
            result['address'] = item.replace('From ', '');
          }
          if (item.startsWith('Followed by')) {
            result['followers'] = item.replace(new RegExp('[Followed by|people|,]', 'g'), '').trim();
          }
        });
      }
      return result;
    } catch (e) {
      return result;
    }
  }, selector);
}

async function getProfilePicture(page) {
  const selector = `div.uiLayer`;
  const elm = await page.$('.photoContainer .profilePicThumb');
  elm && elm.click();
  try {
    await page.waitForSelector(selector, {visible: true, timeout: TIMEOUT});
    await page.waitForFunction(function () {
      const image = document.querySelector('div.uiLayer img');
      return image && image.src && !image.src.endsWith('.gif');
    }, {timeout: TIMEOUT});
    return await page.$eval('div.uiLayer img', e => e.src);
  } catch (e) {
    return "";
  }  

}

async function getProfileData(page, fbid) {
  await page.goto(`https://www.facebook.com/${fbid}`, {waitUntil: 'networkidle2'});
  const [picture, intro] = await Promise.all([getProfilePicture(page), getIntro(page)]);
  return {...intro, picture};
}

module.exports.getFullUserInfo = async (page, fbid) => {
  const basicInfo = await getBasicInfo(page, fbid);
  const profile = await getProfileData(page, fbid);
  return {...basicInfo, ...profile};
}

module.exports.run = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.time('counting');
  // const browser = await setup.getBrowser();
  const browser = await puppeteer.launch({headless: false});

  const [page, profilePage] = await Promise.all([browser.newPage(), browser.newPage()]);
  page.setViewport({width: 1200, height: 1000});
  profilePage.setViewport({width: 1200, height: 1000});

  if (fb_cookie) {
    await page.setCookie(...fb_cookie);
  }

  const [info] = await fb_utils.getInfluencerInfo(11335);
  // const fbid = info.fb_id;
  const fbid = 'tantoan.nguyenle';

  const account = await Promise.all([getBasicInfo(page, fbid), getProfileData(profilePage, fbid)])
    .then(([basicInfo, profile]) => ({...basicInfo, ...profile}));

  let birthday;
  if (birthday = account['birthday']) {
    account['birthday'] = new Date(birthday).toLocaleDateString('en-US');
  }

  let followers;
  if (followers = account['followers']) {
    account['followers'] = +followers;
  }

  // await browser.close();

  console.log(account);
  console.timeEnd('counting');

  callback(null, {statusCode: 200, body: JSON.stringify(account)});
};

// (async function () {
//   await module.exports.run({}, {}, () => {
//   });
// })();
