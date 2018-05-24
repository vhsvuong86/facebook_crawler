//const setup = require('./starter-kit/setup');
const setup = require('./starter-kit/setup');
const utils = require('./common/utils');
const puppeteer = require('puppeteer');
const fb_cookie = require('./common/fb_cookie');

const MAX_NUMBER_POSTS = 10;
// const BUTTON_LOGIN_SELECTOR = 'input[data-testid=\'royal_login_button\']';
const PATTERN = /^.*fbid=(\d+)&.*$/;
const FIELD_MAPPING = {
  'Gender': 'gender',
  'Languages': 'language',
  'Birthday': 'birthday',
};

// fields=id,cover,name,gender,birthday,about,picture.width(9999)

function getPostId(url) {
  const data = PATTERN.exec(url);
  return data && data[1];
}

async function getInfluencerInfo(id) {
  return await utils.fetch(`/facebook_accounts?is_fanpage=eq.false&influencer_id=eq.${id}`);
}

async function getBasicInfo(page, fb_id) {
  await page.goto(`https://www.facebook.com/${fb_id}/about?section=contact-info`);
  // div to scroll
  // #medley_header_friends
  return await page.evaluate((FIELD_MAPPING) => {
    const NAME_PATTERN = /(.*)\W<span.*/;
    const result = {};
    // name
    const nameHtml = document.querySelector('#fb-timeline-cover-name a').innerHTML || '';
    const groups = NAME_PATTERN.exec(nameHtml);
    result['name'] = groups ? groups[1] : '';
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

async function scrape(page, itemTargetCount = 40, scrollDelay = 1000) {
  let items = [];
  try {
    let previousHeight;
    while (items.length < itemTargetCount) {
      items = await page.evaluate(() => {
        const elements = document.querySelectorAll('a[href*=\'fbid\']');
        const items = [];
        for (let element of elements) {
          items.push(element.href);
        }
        return items;
      });
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForFunction(`document.body.scrollHeight > ${previousHeight}`);
      await page.waitFor(scrollDelay);
    }
  } catch (e) {
  }
  return items.slice(0, itemTargetCount);
}

function getIntro(page) {
  return page.evaluate(async () => {
    const result = {
      followers: 0,
    };
    return await new Promise((resolve) => {
      const timer$ = setInterval(() => {
        let timeLine = document.querySelector('li.fbTimelineUnit #intro_container_id');
        if (timeLine) {
          clearInterval(timer$);
          const timeLineText = timeLine.innerText;
          if (timeLineText) {
            timeLineText.split('\n').forEach((item) => {
              if (item.startsWith('From')) {
                result['country'] = item.replace('From ', '');
              }
              if (item.startsWith('Followed by')) {
                result['followers'] = item.replace(new RegExp('[Followed by|people|,]', 'g'), '').trim();
              }
            });
            resolve(result);
          }
        }
      }, 1000);
    });
  });
}

function getProfilePicture(page) {
  return page.evaluate(async () => {
    return await new Promise((resolve) => {
      const elm = document.querySelector('.photoContainer .profilePicThumb');
      if (elm) {
        elm.click();
      }
      const timer$ = setInterval(() => {
        let spotlight$ = document.querySelector('.spotlight');
        if (spotlight$) {
          const src = spotlight$.getAttribute('src');
          if (src && src.search('.gif') === -1) {
            resolve(src);
            clearInterval(timer$);
          }
        }
      }, 1000);
    });
  });
}

async function getProfileData(page, fbid) {
  await page.goto(`https://www.facebook.com/${fbid}`, {waitUntil: 'networkidle2'});
  const [picture, intro] = await Promise.all([getProfilePicture(page), getIntro(page)]);
  return {...intro, picture};
}

module.exports.run = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.time('counting');
  const browser = await setup.getBrowser();
  // const browser = await puppeteer.launch({headless: true});

  const [page, profilePage] = await Promise.all([browser.newPage(), browser.newPage()]);
  page.setViewport({width: 1200, height: 1000});
  profilePage.setViewport({width: 1200, height: 1000});

  if (fb_cookie) { await page.setCookie(...fb_cookie); }

  const [info] = await getInfluencerInfo(11317);
  const fbid = info.fb_id;

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

  await browser.close();

  console.log(account);
  console.timeEnd('counting');

  callback(null, { statusCode: 200, body: JSON.stringify(account) });
};

// (async function() {
//   await module.exports.run({}, {}, () => {});
// })();
