// const setup = require('./starter-kit/setup');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// staging
// process.env.CASTING_ASIA_AUTHORIZATION = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoicG9zdGdyZXMiLCJleHAiOjE4MzUxNTk4ODl9.pRijnatFeMuH1bifQ53vqLy7EkcwL1n7nPkcQ6NTOsg';
// process.env.CASTING_ASIA_API = 'https://dev-api.casting-asia.com';

// production
process.env.CASTING_ASIA_AUTHORIZATION = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoicG9zdGdyZXMiLCJleHAiOjE4MjgzMjc4NzV9.gNly-rwdo6BkA355PCJoLnj4MWwjtTEz4HCV7CSeppU';
process.env.CASTING_ASIA_API = 'https://api.casting-asia.com';
// const puppeteer = require('puppeteer');

const casting_asia_headers = {
  'Authorization': process.env.CASTING_ASIA_AUTHORIZATION,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

const fb_cookie = require('./common/fb_cookie');

async function getListPostContent(page, posts, index = 0, results = []) {
  if (!posts) return results;
  if (posts.length === results.length) return results;

  console.log('>>>>>>posts[index]: '+JSON.stringify(posts[index]));
  try {
    await page.goto(posts[index].url, {
        waitUntil: 'networkidle2',
        timeout: 3000000
    });

    /************** POST article in Facepage ***************/
    await page.waitForSelector('.fbPhotoSnowliftPopup', {visible: true, timeout: 3000000});
    await page.waitForSelector('.fbPhotoSnowliftPopup [data-testid=UFI2ReactionLink]', {visible: true, timeout: 3000000});
    await page.click('.fbPhotoSnowliftPopup [data-testid=UFI2ReactionLink]');


    /************** POST article ***************/
    // await page.waitForSelector('.userContentWrapper .userContent', {visible: true, timeout: 3000});
    //await page.waitForSelector('[data-testid=fb-ufi-likelink]', {visible: true, timeout: 5000});
    //await page.click('[data-testid=fb-ufi-likelink]');

    console.log('======= like article: DONE');
    const content = await page.evaluate(() => {
      const URL_PATTERN = /url\("(.*)"\)/;

      function maxValue(list) {
        let dim = 0;
        let item = null;
        list.forEach(it => {
          if (it.width > 40 && it.height > 40 && (it.width + it.height) > dim) {
            dim = it.width + it.height;
            item = it;
          }
        });
        return item ? [item] : [];
      }

      const selector = '.userContentWrapper .userContent';

      if (document.querySelector(selector)) {
        let avatarList = [];
        const contentElm = document.querySelector(selector);
        const nextElm = document.querySelector(selector).nextSibling;
        if (nextElm) {
          avatarList = [...nextElm.querySelectorAll('img')]
            .filter(e => e.src.search('scontent'));
          if (!avatarList.length) {
            avatarList = maxValue([...document.querySelector('#contentArea').querySelectorAll('img')]);
          }
          avatarList = avatarList.map(avatar => {
            if (avatar.src.search('.gif') > -1) {
              const backgroundImage = avatar.style.backgroundImage;
              const result = URL_PATTERN.exec(backgroundImage);
              return result ? result[1] : '';
            }
            return avatar.src || '';
          });
        }
        return [contentElm ? contentElm.innerText : null, avatarList && avatarList.length ? avatarList[0] : null]
      }
    });
    results.push({
      ...posts[index],
      id: posts[index].post_id,
      content: content[0],
      image: content[1],
      isDeleted: !content
    });
  } catch (e) {
    console.log('>>>>>>Error in getting content: '+e);
    results.push(null);
  }
  return await getListPostContent(page, posts, index + 1, results);
}

async function updateDatabase(contents) {
  console.log(`Try to update database: ${JSON.stringify(contents)}`);
  const promises = contents
    .filter(post => !post.isDeleted)
    .map(post => post);

  const results = await Promise.all(promises);
  console.log(results);
  try {
    await axios.request({
      method: 'post',
      url: `${process.env.CASTING_ASIA_API}/rpc/update_cam_post_medias`,
      data: {posts: results},
      headers: casting_asia_headers
    });
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

module.exports.run = async (event, context, callback) => {

  console.time('counting');
  // const browser = await setup.getBrowser();

  for (let index_filename = 2; index_filename <= 5; index_filename++) {
      console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>RUNNING WITH FILENAME: '+index_filename);
      const browser = await puppeteer.launch({headless: true});
      const page = await browser.newPage();
    // console.log(await page.cookies());

      await page.setViewport({width: 1200, height: 1000});
      const rawPosts = event.posts;
      let posts = [];
      try {
        posts = JSON.parse(rawPosts);
      } catch (e) {
        posts = event.posts;
      }

      await page.goto('https://facebook.com', {
        waitUntil: 'networkidle2',
        timeout: 3000000
      });


      let cookiesArr =  JSON.parse(fs.readFileSync(path.join(__dirname, 'common/cookies_name_'+ index_filename + '.json')).toString()) ;
      if (cookiesArr.length !== 0) {
          for (let cookie of cookiesArr) {
            await page.setCookie(cookie)
          }
          console.log('Session has been loaded in the browser')
      }

      const contents = await getListPostContent(page, posts);
      const filteredContent = [...contents.filter(Boolean)];

      console.log('>>>>>>>>>>filteredContent: '+filteredContent);

      // await updateDatabase(filteredContent);
      const response = {
        contents
      };

      await browser.close();
      await page.waitFor(2000);

  }




  // await browser.close();
  console.timeEnd('counting');
  // callback(null, {statusCode: 200, body: JSON.stringify(response)});

};

module.exports.run({
  posts: [
         {
            'post_id': 'trangtrinhadep247',
            'url': 'https://www.facebook.com/trangtrinhadep247/photos/pcb.267236634165003/267236470831686/?type=3&theater'
          },
        /*{
          'post_id': 'windy.tran.547',
          'url': 'https://www.facebook.com/windy.tran.547/posts/2135151566537942'
        },*/
        /*{
        'post_id': 'vominh.tam.942',
        'url': 'https://www.facebook.com/vominh.tam.942/posts/2329027017371488'
      },*/
    /*{
      'post_id': 'vuong.vuhaison',
      // 'influencer_id': 22691,
      // 'campaign_id': 126,
      //'url': 'https://www.facebook.com/vuong.vuhaison/posts/146689393007880'
      'url': 'https://www.facebook.com/vuong.vuhaison/posts/141710150172471'
    },*/
//    {
//      'post_id': 'dinhlanphuong2885_126',
//      'influencer_id': 4623,
//      'campaign_id': 126,
//      'url': 'https://www.facebook.com/dinhlanphuong2885/posts/934599623367951'
//    },
//    {
//      'post_id': 'vuthiha89_126',
//      'influencer_id': 4660,
//      'campaign_id': 126,
//      'url': 'https://www.facebook.com/vuthiha89/posts/1049864421833576'
//    }
//    {
//      'post_id': 'van.lac0ste1989_126',
//      'influencer_id': 22359,
//      'campaign_id': 126,
//      'url': 'https://www.facebook.com/van.lac0ste1989/posts/1773471166080321'
//    },
  ]
}, {}, (err, resp) => {
  // console.log(resp)
});
