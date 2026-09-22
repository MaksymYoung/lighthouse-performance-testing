const fs = require('fs')
const puppeteer = require('puppeteer')
const lighthouse = require('lighthouse/lighthouse-core/fraggle-rock/api.js')

const waitTillHTMLRendered = async (page, timeout = 30000) => {
  const checkDurationMsecs = 1000;
  const maxChecks = timeout / checkDurationMsecs;
  let lastHTMLSize = 0;
  let checkCounts = 1;
  let countStableSizeIterations = 0;
  const minStableSizeIterations = 3;

  while(checkCounts++ <= maxChecks){
    let html = await page.content();
    let currentHTMLSize = html.length; 

    let bodyHTMLSize = await page.evaluate(() => document.body.innerHTML.length);

    //console.log('last: ', lastHTMLSize, ' <> curr: ', currentHTMLSize, " body html size: ", bodyHTMLSize);

    if(lastHTMLSize != 0 && currentHTMLSize == lastHTMLSize) 
      countStableSizeIterations++;
    else 
      countStableSizeIterations = 0; //reset the counter

    if(countStableSizeIterations >= minStableSizeIterations) {
      console.log("Fully Rendered Page: " + page.url());
      break;
    }

    lastHTMLSize = currentHTMLSize;
    await page.waitForTimeout(checkDurationMsecs);
  }  
};

async function captureReport() {
	const browser = await puppeteer.launch({args: ['--allow-no-sandbox-job', '--allow-sandbox-debugging', '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox', '--display', '--ignore-certificate-errors', '--disable-storage-reset=true']});
	//const browser = await puppeteer.launch({"headless": false, args: ['--allow-no-sandbox-job', '--allow-sandbox-debugging', '--no-sandbox', '--ignore-certificate-errors', '--disable-storage-reset=true']});
	const page = await browser.newPage();
	const baseURL = "https://www.demoblaze.com/index.html";
	
	await page.setViewport({"width":1920,"height":1080});
	await page.setDefaultTimeout(10000);
	
	const navigationPromise = page.waitForNavigation({timeout: 30000, waitUntil: ['domcontentloaded']});
	await page.goto(baseURL);
    await navigationPromise;
		
	const flow = await lighthouse.startFlow(page, {
		name: 'demoblaze',
		configContext: {
		  settingsOverrides: {
			throttling: {
			  rttMs: 40,
			  throughputKbps: 10240,
			  cpuSlowdownMultiplier: 1,
			  requestLatencyMs: 0,
			  downloadThroughputKbps: 0,
			  uploadThroughputKbps: 0
			},
			throttlingMethod: "simulate",
			screenEmulation: {
			  mobile: false,
			  width: 1920,
			  height: 1080,
			  deviceScaleFactor: 1,
			  disabled: false,
			},
			formFactor: "desktop",
			onlyCategories: ['performance'],
		  },
		},
	});

  	//================================NAVIGATE================================
    await flow.navigate(baseURL, {
		stepName: 'open main page'
		});
  	console.log('main page is opened');
	
	const username = "testy123";
	const pwrd     = "testy123";
	
	//================================SELECTORS================================
	const loginTab      = "#login2";
	const loginUsername = "#loginusername";
	const loginPassword = "#loginpassword";
	const loginSubmit   = ".modal-footer button[onclick='logIn()']";
	const loginCheck    = "#logout2[style='display: block;']";
	const aboutUs       = "a[data-target='#videoModal']";
	const aboutUsCheck  = "#videoModal[style='display: block;']"
	
	await page.waitForSelector(loginTab);
	await page.click(loginTab);
	await navigationPromise;
	await waitTillHTMLRendered(page);
	
	await page.waitForSelector(loginUsername);
	await page.type(loginUsername, username);
	await page.waitForSelector(loginPassword);
	await page.type(loginPassword, pwrd);
	await page.waitForSelector(loginSubmit);
	
	//================================PAGE_ACTIONS================================
	await flow.startTimespan({ stepName: 'login' });
		await page.click(loginSubmit);
        await waitTillHTMLRendered(page);
		await page.waitForSelector(loginCheck);
    await flow.endTimespan();
    console.log('login is completed');

	await page.waitForSelector(aboutUs);
	await flow.startTimespan({ stepName: 'about us' });
		await page.click(aboutUs);
		await waitTillHTMLRendered(page);
		await page.waitForSelector(aboutUsCheck);
	await flow.endTimespan();
	console.log('about us is completed');

	//================================REPORTING================================
	const reportPath = __dirname + '/user-flow.report.html';
	//const reportPathJson = __dirname + '/user-flow.report.json';

	const report = await flow.generateReport();
	//const reportJson = JSON.stringify(flow.getFlowResult()).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
	
	fs.writeFileSync(reportPath, report);
	//fs.writeFileSync(reportPathJson, reportJson);
	
    await browser.close();
}
captureReport();
