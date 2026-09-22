// Lighthouse script example : petClinic.js

const fs = require('fs') // reports -> disk
const puppeteer = require('puppeteer') // lib -> manage user behavior in Chrome
const lighthouse = require('lighthouse/lighthouse-core/fraggle-rock/api.js') // full refresh + scrolls/...

const waitTillHTMLRendered = async (page, timeout = 30000) => { //waiting for a full page load
const checkDurationMsecs = 1000; //if the page size doesn't change (several checks), then the page is fully loaded
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

async function captureReport() { //we will call the function at the end of the script

const browser = await puppeteer.launch({args: ['--allow-no-sandbox-job', '--allow-sandbox-debugging', '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox', '--display', '--ignore-certificate-errors', '--disable-storage-reset=true']});
//arguments in '--' for 1)opening Chrome without a window/display; 2) ignore certificate; 3) way of clicking

const page = await browser.newPage() // open new page in Chrome
await page.setViewport({"width":1920,"height":1080}) //size fullHD, change if we emulate a mobile view

const navigationPromise = page.waitForNavigation({timeout: 30000, waitUntil: ['domcontentloaded']}) // wait 30 sec for the DOMmodel to load

const flow = await lighthouse.startFlow(page, { //define a tool that will measure UI
name: 'petClinic', //set any name
configContext: {
settingsOverrides: {
throttling: {
rttMs: 40, // recommendation for Google- Ok
throughputKbps: 10240, //~ 10Mb Internet, recommendation for Google, don't write more than possible
cpuSlowdownMultiplier: 1, // 1 - use full CPU, 2 - use half of CPU
requestLatencyMs: 0, // not to change 0
downloadThroughputKbps: 0, // not to change 0
uploadThroughputKbps: 0 // not to change 0
},
throttlingMethod: "simulate", // not to change
screenEmulation: { // not to change
mobile: false, // true if we emulate a mobile view
width: 1920, // change if we emulate a mobile view
height: 1080, // change if we emulate a mobile view
deviceScaleFactor: 1, // not to change
disabled: false, // not to change
},
formFactor: "desktop", //emulation of the desktop/mobile view of Chrome
onlyCategories: ['performance'],
},
},
});

//View Links
let HomePage = 'http://localhost:8080/';
let FindOwnersPage = 'http://localhost:8080/owners/find';
let VetPage = 'http://localhost:8080/vets.html';
let ErrorPage = 'http://localhost:8080/oups'

//CSS Selectors
const dropdownButtonSelector = "div.racr-action-bar__item.racr-action-bar__item--viewSelector > div > div > div.racr-dropdown__control > button";
const listSelector = "div[title='List']";
const gridSelector = "div[title='Grid']";
const lifeSelector = "div[title='Life of Line']";
const heatSelector = "div[title='Heat Map']";
const errorMessage = ".racr-notification__close-button";

//Cold Navigations //opening links with "navigate"
await flow.navigate(HomePage, { // in line 46 - we've defined that flow = lighthouse
stepName: 'Home Page'
});
console.log('Home Page opened'); //information output (for yourself)
await flow.navigate(FindOwnersPage, {
stepName: 'Find Owners Page'
});
console.log('Find Owners Page opened');
await flow.navigate(VetPage, {
stepName: 'Vet Page'
});
console.log('Vet Page opened');
await flow.navigate(ErrorPage, {
stepName: 'Error Page'
});
console.log('Error Page opened');


// Selectors for clicking

// await page.waitForSelector(dropdownButtonSelector);
// await page.click(dropdownButtonSelector);
// await page.waitForSelector(listSelector);
// Select flows
// await flow.startTimespan({ stepName: 'Select list-view -- 800' });
// await page.click(listSelector);
// await waitTillHTMLRendered(page);
// await page.waitForSelector(".lv__td.js-cell");
// await flow.endTimespan();
// console.log('Select list-view -- 800');


const reportPath = __dirname + '/user-flow.report.html'; //folder for html report
const reportPathJson = __dirname + '/user-flow.report.json'; //folder for json report

const report = flow.generateReport();
const reportJson = JSON.stringify(flow.getFlowResult()).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); //taken from GitHub

fs.writeFileSync(reportPath, report); //write html report
fs.writeFileSync(reportPathJson, reportJson); //write json report

await browser.close(); //close Chrome
}
captureReport(); //call function

//-->> go to cmd (Ubuntu)
