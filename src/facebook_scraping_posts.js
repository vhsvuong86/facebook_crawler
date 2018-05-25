const fb_cookie = require('./common/fb_cookie');
const puppeteer = require('puppeteer');

const MAX_NUMBER_POSTS = 10;
// const PATTERN = /^.*(?:post\/)?(\d+)&.*$/;
const FBID_PATTERN = /fbid=(\d+)/;
const TIMEOUT = 3000;

// const REACTION_PATTERN = /(\d*,?\d+)(?=\W+\w+\W+reacted)/;
const NUMBER_PATTERN = /(\d*,?\d+)/;

function formatNumber(value) {
  if (typeof value === 'number') {
    return value;
  }
  let data;
  if (data = value.match(NUMBER_PATTERN)) {
    return +(data[0].replace(',', ''));
  }
  return str;
}

function getPostId(url) {
  const data = FBID_PATTERN.exec(url);
  return data && data[1];
}

async function scrape(page, fbid, itemTargetCount = 40, scrollDelay = 500) {
  await page.goto(`https://www.facebook.com/${fbid}`);
  let items = [];
  try {
    let previousHeight;
    while (items.length < itemTargetCount) {
      items = await page.evaluate((fbid) => {
        const elements = document.querySelectorAll(`span > span [data-utime]`);
        const items = [];
        for (let element of elements) {
          const href = element.closest('a').href;
          // if (href.indexOf(`${fbid}/posts`) > -1 || href.indexOf('photo.php?fbid=') > -1) {
          if (href.indexOf('photo.php?fbid=') > -1) {
            items.push(href);
          }
        }
        return items;
      }, fbid);
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForFunction(`document.body.scrollHeight > ${previousHeight}`);
      await page.waitFor(scrollDelay);
    }
  } catch (e) {
  }
  return items.slice(0, itemTargetCount);
}

/*
post_output['created'] = post_input['created_time'] if 'created_time' in post_input else None
post_output['sentence'] = post_input['message'] if 'message' in post_input else None
post_output['comments_old'] = len(post_input['comments']['data']) if "comments" in post_input else None
post_output['likes_old'] = post_input['likes']["summary"]["total_count"] if "likes" in post_input else None
post_output['image'] = post_input['full_picture'] if "full_picture" in post_input else None
post_output['fb_id'] = post_input['id']
posts_output.append(post_output)
*/

async function triggerLoadCommentData(page) {
  await page.waitForSelector('div.UFIShareRow', {visible: true, timeout: TIMEOUT});
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll('div.UFIShareRow > div:nth-child(1) span')];
    const commentElm = elements.find(e => e.innerText.indexOf('Comment') > -1);
    if (commentElm) {
      const event = document.createEvent('MouseEvents');
      event.initEvent('mouseover', true, false);
      // applies this event to my HTML element
      commentElm.dispatchEvent(event);
    }
  });
}

async function triggerLoadReactionData(page, selector) {
  await page.evaluate((selector) => {
    const elem = document.querySelector(selector);
    if (elem) {
      const event = document.createEvent('MouseEvents');
      event.initEvent('mouseover', true, false);
      // applies this event to my HTML element
      elem.dispatchEvent(event);
    }
  }, selector);
}

async function getPostDetail(page, postId) {
  let result = {fb_id: postId};
  const reactionPromise$ = new Promise((resolve) => {
    page.on('response', async resp => {
      // reaction
      if (resp.url().indexOf('/ufi/reaction/tooltip/?ft_ent_identifier=') > -1) {
        let text = await resp.text();
        const data = JSON.parse(text.replace('for (;;);', ''));
        if (data && data.payload) {
          const reactions = data.payload.split('\n');
          let haveMoreReactions;
          if (reactions.length && (haveMoreReactions = reactions[reactions.length - 1].match(NUMBER_PATTERN))) {
            resolve(formatNumber(haveMoreReactions[1]) + reactions.length - 1);
          } else {
            resolve(reactions ? reactions.length : 0);
          }
        } else {
          resolve(0);
        }
      }
    });
  });

  const commentPromise$ = new Promise((resolve) => {
    page.on('response', async resp => {
      // comment
      if (resp.url().indexOf('/ufi/comment/tooltip/?ft_ent_identifier=') > -1) {
        let text = await resp.text();
        const data = JSON.parse(text.replace('for (;;);', ''));
        if (data && data.payload) {
          const comments = data.payload.split('\n');
          let haveMoreComment;
          if (comments.length && (haveMoreComment = comments[comments.length - 1].match(NUMBER_PATTERN))) {
            resolve(formatNumber(haveMoreComment[1]) + comments.length - 1);
          } else {
            resolve(comments ? comments.length : 0);
          }
        } else {
          resolve(0);
        }
      }
    });
  });

  const selector = `a[rel='theater'] img`;
  const reactionLink = `.uiLayer span[data-tooltip-uri^='/ufi/reaction/tooltip/?ft_ent_identifier']`;
  const shareLink = `a[ajaxify^='/ajax/shares/view']`;

  await page.goto(`https://www.facebook.com/${postId}`);
  await page.waitForSelector(selector, {visible: true, timeout: TIMEOUT});

  result['created'] = await page.evaluate(() => {
    return document.querySelector('[data-utime]').getAttribute('data-utime');
  });

  result['sentence'] = await page.$eval('.userContent', e => e.innerText);

  const postImage = await page.$(selector);
  if (postImage) {
    result['image'] = await page.$eval(selector, e => e.src);
    await postImage.click();
  }

  const promises = [];

  try {
    await page.waitForSelector(reactionLink, {visible: true, timeout: TIMEOUT});
    promises.push(reactionPromise$.then(like => ({likes: formatNumber(like)})));
    await triggerLoadReactionData(page, reactionLink);
  } catch (e) {
    result['links'] = 0;
  }

  try {
    await page.waitForSelector(shareLink, {visible: true, timeout: TIMEOUT});
    promises.push(page.$eval(shareLink, e => e.innerText).then(share => ({shares: formatNumber(share)})));
  } catch (e) {
    // no share
    result['shares'] = 0;
  }

  try {
    await page.waitForFunction(async() => {
      return await page.evaluate(() => {
        const pattern = /(\d+) Comment(:?s?)/;
        const elms = [...document.querySelector('div > span')];
        return !!elms.find(e => pattern.exec(e.innerText));
      });
    }, {timeout: TIMEOUT});
    promises.push(commentPromise$.then(comment => ({comments: comment})));
    // trigger load comment
    await triggerLoadCommentData(page);
  } catch (e) {
    // no comments
    result['comments'] = 0;
  }

  return await Promise.all(promises)
    .then(data => {
      data.forEach((item) => {
        result = {...result, ...item};
      });
      return result;
    });
}

module.exports.getPosts = async function(page, fbid, num_posts) {
  let postIds = await scrape(page, fbid, num_posts || MAX_NUMBER_POSTS);
  postIds = postIds.map(getPostId);
  const result = [];
  for (let i = 0; i < postIds.length; i++) {
    let post = await getPostDetail(page, postIds[i]);
    result.push(post);
  }
  return result;
};

module.exports.run = async (event, context, callback) => {
  process.setMaxListeners(Infinity);
  context.callbackWaitsForEmptyEventLoop = false;

  console.time('counting');
  // const browser = await setup.getBrowser();
  const browser = await puppeteer.launch({headless: false});
  const page = await browser.newPage();
  if (fb_cookie) {
    await page.setCookie(...fb_cookie);
  }

  await browser.close();
  console.timeEnd('counting');

};

// (async function () {
//   await module.exports.run({}, {}, () => {});
// })();