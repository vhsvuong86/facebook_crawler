const fb_cookie = require('./common/fb_cookie');
const puppeteer = require('puppeteer');

const MAX_NUMBER_POSTS = 10;
const PATTERN = /^.*fbid=(\d+)&.*$/;

function getPostId(url) {
  const data = PATTERN.exec(url);
  return data && data[1];
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

async function getPostDetail(page, fbid) {
  return fbid;
  await

}

module.exports.run = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.time('counting');
  // const browser = await setup.getBrowser();
  const browser = await puppeteer.launch({headless: true});

  const page = await browser.newPage();
  page.setViewport({width: 1200, height: 1000});

  if (fb_cookie) {
    await page.setCookie(...fb_cookie);
  }

  await page.goto('https://www.facebook.com/ngoctrinhfashion89');
  const items = await scrape(page, MAX_NUMBER_POSTS);
  const postIds = items.map(getPostId);
  // console.log(items.length);

  console.log(getPostDetail(postIds[0]));

  await browser.close();

  console.timeEnd('counting');

  callback(null, {statusCode: 200, body: JSON.stringify(items)});
};

(async function() {
  await module.exports.run({}, {}, () => {});
})();
