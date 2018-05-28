//const setup = require('./starter-kit/setup');
const setup = require('./starter-kit/setup');
const puppeteer = require('puppeteer');
const fb_cookie = require('./common/fb_cookie');
const fb_utils = require('./common/fb_utils');
const fb_posts = require('./facebook_scraping_posts');
const TIMEOUT = 5000;

const FIELD_MAPPING = {
  'Gender': 'gender',
  'Languages': 'language',
  'Birthday': 'birthday',
};


async function getBasicInfo(page, fb_id) {
  await page.goto(`https://www.facebook.com/${fb_id}/about?section=contact-info`);
  const result = {};
  try {
    await page.waitForSelector('.coverNoImage', {visible: true, timeout: TIMEOUT});
    result['cover'] = null;
  } catch (e) {
    // cover
    result['cover'] = page.$eval('.coverPhotoImg', e => e.src);
  }

  const info = await page.evaluate((FIELD_MAPPING) => {
    const FBID_PATTERN = /a\.\d+\.\d+\.(\d+)/;
    const result = {};
    try {
      // name
      result['name'] = document.querySelector('#fb-timeline-cover-name a').innerText;
      // avatar
      const avatarLinkElm = document.querySelector('a.profilePicThumb');
      const avatar = document.querySelector('a.profilePicThumb img');
      if (avatarLinkElm) {
        let matches;
        if (matches = FBID_PATTERN.exec(avatarLinkElm.getAttribute('href'))) {
          result['fb_id'] = matches[1];
        }
      }
      if (avatar) {
        result['avatar'] = avatar.getAttribute('src');
      }
      // gender, language
      document.querySelectorAll('.uiList li').forEach(elm => {
        const spans = elm.querySelectorAll('span');
        const texts = [...spans].map(span => span.innerText).filter(Boolean);
        if (texts.length === 2 && texts[0] in FIELD_MAPPING) {
          result[FIELD_MAPPING[texts[0]]] = texts[1];
        }
      });
      // FIXME: in case no gender
      const genderElm = document.querySelector('._Interaction__ProfileSectionPlaces span');
      if (genderElm) {
        let res = /(s?he)/i.exec(genderElm.innerText);
        console.log(res);
        result['gender'] = res ? (res[1].toLowerCase() === 'he' ? 'Male' : 'Female') : '';
      }
    } catch (e) {
      console.log(e);
    }
    return result;
  }, FIELD_MAPPING);

  return {...result, ...info};

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
      return image && image.src && image.src.indexOf('scontent') > -1;
    }, {timeout: TIMEOUT});
    return await page.$eval('div.uiLayer img', e => e.src);
  } catch (e) {
    return "";
  }  

}

async function getProfileData(page, fbid) {
  await page.goto(`https://www.facebook.com/${fbid}`, {waitUntil: 'networkidle2'});
  const picture = await getProfilePicture(page);
  const intro = await getIntro(page);
  return {...intro, picture};
}

module.exports.getFullUserInfo = async (page, fbid) => {
  const basicInfo = await getBasicInfo(page, fbid);
  const profile = await getProfileData(page, fbid);
  return {...basicInfo, ...profile};
};

module.exports.run = async (event, context, callback) => {

  /**
   * {
      "influencer_id": 11359,
      "timestamp_last_post_in_db": 0,
      "num_posts": 50,
      "name": "1933968613588809",
      "fb_token": null,
      "followers_limit": 300
    }
   */

  context.callbackWaitsForEmptyEventLoop = false;
  process.setMaxListeners(0);

  const fbid = event.name;

  console.time('counting');
  const browser = await setup.getBrowser();
  // const browser = await puppeteer.launch({headless: false, devtools: true});
  const page = await browser.newPage();
  if (fb_cookie) {
    await page.setCookie(...fb_cookie);
  }

  /*let account = await Promise.all([
    getBasicInfo(page, fbid),
    getProfileData(page, fbid)
  ])
    .then(([basicInfo, profile]) => ({...basicInfo, ...profile}));*/

  let account = await module.exports.getFullUserInfo(page, fbid);


  let birthday;
  if (birthday = account['birthday']) {
    account['birthday'] = +(new Date(birthday));
  }

  let followers;
  if (followers = account['followers']) {
    account['followers'] = +followers;
  }
  account = { ...event, ... account };

  account['posts'] = await fb_posts.getPosts(page, fbid, 1);
  if (account['posts'].length) {
    account['posts'] = account['posts'].map(post => {
      return {...post, fb_id: `${account['fb_id']}_${post['fb_id']}`};
    })
  }

  account['user_name'] = fbid;
  account['fb_id'] = fbid;

  // await browser.close();
  console.timeEnd('counting');
  console.log(account);

  callback(null, account);

};

const params = {
  'influencer_id': 11335,
  'timestamp_last_post_in_db': 0,
  'num_posts': 50,
  'name': 'lehoanganhthyy',
  // name: '100014479202924',
  // name: 'linhchiibi19',
  'fb_token': null,
  'followers_limit': 300,
};

/*(async function () {
  await module.exports.run(params, {}, (data) => {
    console.log(data);
  });
})();*/
