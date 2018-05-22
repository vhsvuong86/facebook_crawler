const savedCookie = [{"name":"urlgen","value":"\"{\\\"time\\\": 1526532215}:1fJAlL:iky9guo0Ixqxq3OjdwfRMSCVtGw\"","domain":".instagram.com","path":"/","expires":-1,"size":65,"httpOnly":false,"secure":false,"session":true},{"name":"sessionid","value":"IGSC5715bdf7b7aaba07ac9bef63fb88859b79bc07ca0c2b48d44b36c56aa9c19820%3AHT2YvWNqRzdtHmBj9TN6vZiFZwupG8pn%3A%7B%22_auth_user_id%22%3A7334753059%2C%22_auth_user_backend%22%3A%22accounts.backends.CaseInsensitiveModelBackend%22%2C%22_auth_user_hash%22%3A%22%22%2C%22_platform%22%3A4%2C%22_token_ver%22%3A2%2C%22_token%22%3A%227334753059%3A8mbXKFNxJtBdM2HLV0X9USCo6sd7whvx%3A33363abfd289c8edc3465bed52a9a2c8ceef8e837cdb173acd5a27600767ef53%22%2C%22last_refreshed%22%3A1526532215.0881340504%7D","domain":".instagram.com","path":"/","expires":1534308215.410123,"size":495,"httpOnly":true,"secure":true,"session":false},{"name":"rur","value":"PRN","domain":".instagram.com","path":"/","expires":-1,"size":6,"httpOnly":false,"secure":false,"session":true},{"name":"mcd","value":"3","domain":".instagram.com","path":"/","expires":-1,"size":4,"httpOnly":false,"secure":false,"session":true},{"name":"ds_user_id","value":"7334753059","domain":".instagram.com","path":"/","expires":1534308216.192412,"size":20,"httpOnly":false,"secure":false,"session":false},{"name":"mid","value":"Wv0IcwAEAAFRClCq6oC22JoBlbIB","domain":".instagram.com","path":"/","expires":-1,"size":31,"httpOnly":false,"secure":false,"session":true},{"name":"shbid","value":"10259","domain":".instagram.com","path":"/","expires":1527137016.192165,"size":10,"httpOnly":false,"secure":false,"session":false},{"name":"shbts","value":"1526532215.8948","domain":".instagram.com","path":"/","expires":1527137016.1922,"size":20,"httpOnly":false,"secure":false,"session":false},{"name":"csrftoken","value":"cg1FOCPY432nsuRXiO2xsRL0W08JBKJw","domain":".instagram.com","path":"/","expires":1557981816.190683,"size":41,"httpOnly":false,"secure":true,"session":false}];

const setup = require('./starter-kit/setup');
const utils = require('./common/utils');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const SELECT_LOGIN_SELECTOR = "._g9ean a";
const BUTTON_LOGIN_SELECTOR = "button._qv64e";

const SHORT_DELAY = 500;
const MAX_NUMBER_POSTS = 48;
const MAX_NUMBER_LIKES = 24;


function calculateFinalResult(idata, fdata) {
  // we assume influencer having a bigger weight, let say weight = 10
  // then we calculate average age and gender base on influencer data
  console.log("start final calculation");
  const weight = 10;
  let sumAges = fdata.ages.reduce((a, b) => {
    return a + b;
  });

  let total = fdata.ages.length;
  let dominantGender;  
  let genderPercent;

  if (idata.age) { // if we can detect age/gender of influencer, we add weight
    sumAges += idata.age*weight; 
    total += weight;
  }
  if (idata.gender == "male") fdata.male += weight;
  if (idata.gender == "female") fdata.female += weight;

  if (fdata.male > fdata.female) {
    dominantGender = "male";
    genderPercent = fdata.male * 100 / total;
  } else {
    dominantGender = "female";
    genderPercent = fdata.female * 100 / total;
  }
  
  return {
    avgAges: sumAges/total,
    genderPercent: genderPercent,
    dominantGender: dominantGender
  }
}

function parsePostData(it) {
  return {
    likes: it.node.edge_media_preview_like.count,
    comments: it.node.edge_media_to_comment.count,
    //shortcode: it.node.shortcode,
    post_id: `${it.node.id}_${it.node.owner.id}`,
    image: it.node.display_url,
    sentence: it.node.edge_media_to_caption.edges[0].node.text,
    created: it.node.taken_at_timestamp
  } 
}

async function scrapePosts(page, posts, username, itemTargetCount) {
  let previousHeight;
  let currentHeight;
  let media = undefined;
  let picUrl = null;
  let info = {};

  // console.log(`https://www.instagram.com/${username}`);
  await page.goto(`https://www.instagram.com/${username}`);
  await page.waitForSelector("article", {visible:true});

  // because instagram does not call ajax request for the first 12 posts
  // we need to parse the page to retrieve them
  const content = await page.content();
  const $ = cheerio.load(content);
  try {
    const data = $("body").find("script")[0].children[0].data.replace("window._sharedData = ", "").replace(";", "");
    const user_data = JSON.parse(data);
    const user = user_data.entry_data.ProfilePage[0].graphql.user;

    Object.assign(info, {
      followers: user.edge_followed_by.count,
      avatar: user.profile_pic_url_hd,
      id: user.id,
      name: user.full_name,
      introduce: user.biography
    });

    if (posts.length < itemTargetCount) {
      media = user.edge_owner_to_timeline_media || [];
      for (let it of media.edges) {
        posts.push(parsePostData(it));
      }          
    }
  } catch (e) {
    console.log("Getting errors: " + e.message);
  }

  // scroll to load all items before processing them
  while (posts.length < itemTargetCount) { 
    // continue scrolling down
    previousHeight = await page.evaluate('document.body.scrollHeight');
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitFor(SHORT_DELAY);

    currentHeight = await page.evaluate('document.body.scrollHeight');
    if (currentHeight == previousHeight) {
      break; // nothing to get
    }
  }

  // calculate avg likes/comments
  // let sumLikes = 0;
  // let sumComments = 0;
  // for (let item of posts) {
  //   sumLikes += item.likes;
  //   sumComments += item.comments;    
  // }

  // info.avgLikes = sumLikes/posts.length;
  // info.avgComments = sumComments/posts.length;

  // predict gender and age
  // const predictData = await utils.predictAgeGender(picUrl);
  // Object.assign(info, predictData);

  return info;
}


module.exports.run = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.time('counting');
  const browser = await setup.getBrowser();
  const page = await browser.newPage();
  page.setViewport({width: 1200, height: 1000});

  if (savedCookie === null) {
    // login with pre-defined account
  } else {
    await page.setCookie(...savedCookie);
  }

  let posts = [];
  let userList = [];

  // listen responses from all ajax requests
  page.on('response', async res => {
    if (res.url().startsWith("https://www.instagram.com/graphql")) {
      const jsonData = await res.json();
      if (posts.length < MAX_NUMBER_POSTS && jsonData.data.user && jsonData.data.user.edge_owner_to_timeline_media) {
        // get posts ajax api
        const media = jsonData.data.user.edge_owner_to_timeline_media;
        for (let it of media.edges) {
          posts.push(parsePostData(it));
        }
        //console.log("post list", media.edges.length);
      } else if (jsonData.data.shortcode_media && jsonData.data.shortcode_media.edge_liked_by) {
        // get likes list ajax api
        const media = jsonData.data.shortcode_media.edge_liked_by;
        for (let it of media.edges) {
          userList.push({
            id: it.node.id,
            url: it.node.profile_pic_url
          });
        }
        //console.log("user list", userList.length);
      }      
    }
  });    

  console.log("Received event: ", event)
  let info = await scrapePosts(page, posts, event.user_name, MAX_NUMBER_POSTS);
  info.posts = posts;

  // console.log(posts.length);

  // await page.waitFor(SHORT_DELAY);
  // // console.log(userList.length);
  // // let counter = 1;
  // for (let item of posts) {
  //   await utils.simulateScroll(page, item, MAX_NUMBER_LIKES);
  //   // console.log(counter);
  //   // counter += 1;
  // }  
  
  // console.log(`need to predict age for ${userList.length} users`);
  // const res2 = await utils.scrapeAgeGender(page, userList, MAX_NUMBER_LIKES);
  // const final = calculateFinalResult(res, res2);
  // Object.assign(final, res);

  // const response = {
  //   statusCode: 200,
  //   body: JSON.stringify(info),
  // };

  await browser.close();
  console.timeEnd('counting'); 

  callback(null, info);
};




