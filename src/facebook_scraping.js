const savedCookie = [{"name":"fr","value":"0wYV1EvEacMCPldvi.AWULX4HO2_krkGauEfc1icSK-6E.BbA5Q8.77.FsD.0.0.BbA5RH.AWUw2sJp","domain":".facebook.com","path":"/","expires":1534737223.565506,"size":81,"httpOnly":true,"secure":true,"session":false},{"name":"presence","value":"EDvF3EtimeF1526961225EuserFA21B25087202053A2EstateFDutF1526961225653CEchFDp_5f1B25087202053F2CC","domain":".facebook.com","path":"/","expires":-1,"size":103,"httpOnly":false,"secure":true,"session":true},{"name":"pl","value":"n","domain":".facebook.com","path":"/","expires":1534737220.330497,"size":3,"httpOnly":true,"secure":true,"session":false},{"name":"xs","value":"6%3ACH6bDoddNiedbw%3A2%3A1526961220%3A19041%3A15662","domain":".facebook.com","path":"/","expires":1534737220.330305,"size":53,"httpOnly":true,"secure":true,"session":false},{"name":"datr","value":"PJQDW8cdzr-LcF18M2nJZSyN","domain":".facebook.com","path":"/","expires":1590033215.56493,"size":28,"httpOnly":true,"secure":true,"session":false},{"name":"c_user","value":"100025087202053","domain":".facebook.com","path":"/","expires":1534737220.330227,"size":21,"httpOnly":false,"secure":true,"session":false},{"name":"wd","value":"1200x1000","domain":".facebook.com","path":"/","expires":1527566023,"size":11,"httpOnly":false,"secure":true,"session":false},{"name":"sb","value":"PJQDWzQqhIOukAT51gPZnLSz","domain":".facebook.com","path":"/","expires":1590033220.330091,"size":26,"httpOnly":true,"secure":true,"session":false}];

const setup = require('./starter-kit/setup');
const MAX_NUMBER_POSTS = 10;
const puppeteer = require('puppeteer');

const BUTTON_LOGIN_SELECTOR = 'input[data-testid=\'royal_login_button\']';


function randomTime(min,max){
  return Math.random() * (max - min) + min;
}

async function scrapePosts(page, username, itemTargetCount) {
  await page.goto(`https://www.facebook.com/${username}`);
  // console.log('Go to personal page');
  await page.waitForSelector('#fb-timeline-cover-name',{visible:true});
  // console.log('Start processing profile');

  let items = [];

  try {
    let previousHeight;
    
    while (items.length < itemTargetCount) {       
      items = await page.evaluate((username)=>{
        const selectorString = `#recent_capsule_container div[id*='feed_subtitle'] a[href*='${username}'][href*='posts']`;
        // console.log(selectorString);
        const elements = document.querySelectorAll(selectorString);
        console.log("List query elements: " + elements);
        const items = [];
        for (let element of elements) {
          items.push(element.href);
        }
        return items;
      }, username);
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForFunction(`document.body.scrollHeight > ${previousHeight}`);
      const scrollDelay = randomTime(500, 1000);
      // console.log("Delay: " + scrollDelay);
      await page.waitFor(scrollDelay);
      console.log('Get item number: ' + items.length);
    }
  } catch (e) {
      console.log("Getting errors: " + e.message);
  }
  return items;
}


module.exports.run = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.time('counting');
  const browser = await puppeteer.launch({ headless: true });
  // const browser = await setup.getBrowser();
  const page = await browser.newPage();  

  if (savedCookie) {
    const cookies = JSON.parse(savedCookie);
    await page.setCookie(...cookies);
  } else {
    // login and get cookies
  }
  
  const username = "ngoctrinhfashion89"; // testing
  await scrapePosts(page, username)

  await browser.close();
  console.timeEnd('counting'); 

  const response = {
    success: true
  }
  callback(null, response);

};



