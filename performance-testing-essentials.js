// I used `examples from lection/petClinic.js` as an example. I created fallback functions using AI.

const fs = require('fs'); // reports -> disk
const path = require('path'); // lib -> build OS-safe file paths
const puppeteer = require('puppeteer'); // lib -> manage user behavior in Chrome
const lighthouse = require('lighthouse/lighthouse-core/fraggle-rock/api.js'); // full refresh + scrolls/...

const BASE_URL = (process.env.BASE_URL || 'http://localhost').replace(/\/$/, ''); // app URL, can be changed by BASE_URL env variable
const REPORT_HTML = path.join(__dirname, 'performance-testing-essentials.report.html'); // folder for html report
const REPORT_JSON = path.join(__dirname, 'performance-testing-essentials.report.json'); // folder for json report
const ARTIFACTS_DIR = path.join(__dirname, 'performance-testing-essentials-artifacts'); // folder for raw Lighthouse artifacts

const viewport = { // browser window size, change if we emulate a mobile view
  width: 1920, // fullHD width
  height: 1080, // fullHD height
};

// CSS Selectors
const selectors = {
  tablesTab: 'li.page_item a[href$="/tables"]',
  firstTableProduct: '.product-list .al_archive.publish.priced a[href*="/products/"]',
  productTitle: 'h1.entry-title',
  addToCartButton: 'form.add-to-shopping-cart button[type="submit"]',
  cartTab: 'li.page_item a[href$="/cart"]',
  cartProduct: '#shopping-cart-container .cart-products .td-name a',
  placeOrderButton: '#shopping-cart-container input.to_cart_submit[value="Place an order"]',
  checkoutForm: '#shopping-cart-submit-container form',
  placeOrderSubmit: '#shopping-cart-submit-container input[name="cart_submit"][value="Place Order"]',
  thankYouTitle: 'h1.entry-title',
};

// Test data for required checkout fields
const checkoutData = {
  cart_name: 'Test User',
  cart_address: '1 Performance Street',
  cart_postal: '01001',
  cart_city: 'Sumy',
  cart_phone: '+380501112233',
  cart_email: 'test.user@example.com',
};
const checkoutCountry = process.env.CHECKOUT_COUNTRY || 'US'; // default country for checkout, can be changed by CHECKOUT_COUNTRY env variable
const checkoutState = process.env.CHECKOUT_STATE || 'CA'; // used only if the selected country has states

const timeouts = {
  selector: Number(process.env.SELECTOR_TIMEOUT || 8000),
  navigation: Number(process.env.NAVIGATION_TIMEOUT || 12000),
  ajax: Number(process.env.AJAX_TIMEOUT || 10000),
  state: Number(process.env.STATE_TIMEOUT || 3000),
  orderConfirmation: Number(process.env.ORDER_CONFIRMATION_TIMEOUT || 12000),
  htmlRendered: Number(process.env.HTML_RENDERED_TIMEOUT || 8000),
  htmlCheckInterval: Number(process.env.HTML_CHECK_INTERVAL || 500),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitTillHTMLRendered(page, timeout = timeouts.htmlRendered) { // waiting for a full page load
  const checkDurationMsecs = timeouts.htmlCheckInterval; // if the page size doesn't change (several checks), then the page is fully loaded
  const maxChecks = timeout / checkDurationMsecs;
  let lastHTMLSize = 0;
  let checkCounts = 1;
  let countStableSizeIterations = 0;
  const minStableSizeIterations = 3;

  while (checkCounts++ <= maxChecks) {
    const html = await page.content();
    const currentHTMLSize = html.length;
    // const bodyHTMLSize = await page.evaluate(() => document.body.innerHTML.length);
    // console.log('last: ', lastHTMLSize, ' <> curr: ', currentHTMLSize, " body html size: ", bodyHTMLSize);

    if (lastHTMLSize !== 0 && currentHTMLSize === lastHTMLSize) {
      countStableSizeIterations++;
    } else {
      countStableSizeIterations = 0; // reset the counter
    }

    if (countStableSizeIterations >= minStableSizeIterations) {
      console.log("Fully Rendered Page: " + page.url());
      return;
    }

    lastHTMLSize = currentHTMLSize;
    await sleep(checkDurationMsecs);
  }
}

async function clickAndWait(page, selector, options = {}) { // click element and wait while the page is updated
  const { waitForNavigation = true, waitUntil = 'domcontentloaded' } = options;
  await page.waitForSelector(selector, { visible: true });

  if (waitForNavigation) {
    await Promise.all([
      page.waitForNavigation({ waitUntil, timeout: timeouts.navigation }),
      page.click(selector),
    ]);
  } else {
    await page.click(selector);
  }

  await waitTillHTMLRendered(page);
}

async function fillField(page, selector, value) { // fill field using click first, fallback if element is not clickable
  await page.waitForSelector(selector, { visible: true });
  await page.$eval(selector, (element) => element.scrollIntoView({ block: 'center' }));
  await sleep(100);

  try {
    await page.click(selector, { clickCount: 3 });
    await page.type(selector, value, { delay: 60 });
    return;
  } catch (clickError) {
    try {
      await page.focus(selector);
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.type(selector, value, { delay: 60 });
      return;
    } catch (focusError) {
      await page.$eval(selector, (element, fieldValue) => {
        element.value = fieldValue;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
    }
  }
}

async function fillCheckoutForm(page) { // fill all required order form fields
  await page.waitForSelector(selectors.checkoutForm, { visible: true });

  for (const [name, value] of Object.entries(checkoutData)) {
    const selector = `${selectors.checkoutForm} [name="${name}"]`;
    await fillField(page, selector, value);
  }

  await selectCountryAndStateIfAvailable(page, checkoutCountry, checkoutState);
}

async function selectCountryAndStateIfAvailable(page, countryCode, stateCode) { // select country and state only when state exists
  const countrySelector = `${selectors.checkoutForm} select[name="cart_country"]`;
  const stateSelector = `${selectors.checkoutForm} select[name="cart_state"]`;

  await page.select(countrySelector, countryCode);
  await page.$eval(countrySelector, (select) => {
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.options.length > 1,
    { timeout: timeouts.state },
    stateSelector
  ).catch(() => null);

  const stateInfo = await page.$eval(stateSelector, (select) => ({
    isRequired: select.required || select.classList.contains('required'),
    values: Array.from(select.options).map((option) => option.value).filter(Boolean),
  }));

  const selectedState = stateInfo.values.includes(stateCode) ? stateCode : stateInfo.values[0];

  if (selectedState) {
    await page.select(stateSelector, selectedState);
    await page.$eval(stateSelector, (select) => {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return;
  }

  if (stateInfo.isRequired) {
    console.log(`State was not selected: ${countryCode} has no available state options in the form.`);
  }
}

async function assertCheckoutFormIsValid(page) { // fail with field names before submitting an invalid form
  const invalidFields = await page.$$eval(`${selectors.checkoutForm} [required]`, (fields) => fields
    .filter((field) => !field.checkValidity())
    .map((field) => ({
      name: field.getAttribute('name'),
      value: field.value,
      message: field.validationMessage,
    })));

  if (invalidFields.length > 0) {
    throw new Error(`Checkout form is invalid: ${JSON.stringify(invalidFields)}`);
  }
}

async function addTableToCart(page) { // add product and wait for cart AJAX request to finish
  await page.waitForSelector(selectors.addToCartButton, { visible: true });

  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/wp-admin/admin-ajax.php') && response.ok(),
      { timeout: timeouts.ajax }
    ),
    page.click(selectors.addToCartButton),
  ]);

  await waitTillHTMLRendered(page);
}

async function waitForCartProduct(page, productUrl) { // verify that cart contains the product opened earlier
  await page.waitForSelector(selectors.cartProduct, { visible: true });
  await page.waitForFunction(
    (selector, expectedUrl) => {
      const normalizeUrl = (url) => url.replace(/\/$/, '');

      return Array.from(document.querySelectorAll(selector))
        .some((link) => normalizeUrl(link.href) === normalizeUrl(expectedUrl));
    },
    {},
    selectors.cartProduct,
    productUrl
  );
}

async function submitCheckoutOrder(page) { // submit checkout form even if the button is below viewport
  await page.waitForSelector(selectors.placeOrderSubmit);
  await assertCheckoutFormIsValid(page);

  const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: timeouts.navigation });

  try {
    await page.$eval(selectors.placeOrderSubmit, (button) => button.scrollIntoView({ block: 'center' }));
    await sleep(100);
    await page.click(selectors.placeOrderSubmit);
  } catch (error) {
    await page.$eval(selectors.placeOrderSubmit, (button) => {
      if (button.form && typeof button.form.requestSubmit === 'function') {
        button.form.requestSubmit(button);
      } else {
        button.click();
      }
    });
  }

  await navigationPromise;

  await waitTillHTMLRendered(page);
}

async function captureReport() { // we will call the function at the end of the script
  const browser = await puppeteer.launch({
    // headless: false,
    args: [
      '--allow-no-sandbox-job',
      '--allow-sandbox-debugging',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-gpu-sandbox',
      '--ignore-certificate-errors',
      '--disable-storage-reset=true',
      `--window-size=${viewport.width},${viewport.height}`,
    ],
  });
  // arguments in '--' for 1) opening Chrome without a window/display; 2) ignoring certificates; 3) stable CI execution

  try {
    const page = await browser.newPage(); // open new page in Chrome
    await page.setViewport(viewport); // set browser size
    await page.setDefaultTimeout(timeouts.selector); // wait for selector actions

    const flow = await lighthouse.startFlow(page, { // define a tool that will measure UI
      name: 'Performance Testing Essentials - order flow',
      configContext: {
        settingsOverrides: {
          throttling: {
            rttMs: 40, // recommendation for Google - Ok
            throughputKbps: 10240, // ~ 10Mb Internet, recommendation for Google
            cpuSlowdownMultiplier: 1, // 1 - use full CPU, 2 - use half of CPU
            requestLatencyMs: 0,
            downloadThroughputKbps: 0,
            uploadThroughputKbps: 0,
          },
          throttlingMethod: 'simulate',
          screenEmulation: {
            mobile: false, // true if we emulate a mobile view
            width: viewport.width, // change if we emulate a mobile view
            height: viewport.height, // change if we emulate a mobile view
            deviceScaleFactor: 1,
            disabled: false,
          },
          formFactor: 'desktop', // emulation of the desktop/mobile view of Chrome
          onlyCategories: ['performance'],
        },
      },
    });

    // Cold Navigation //opening the main page with "navigate"
    await flow.navigate(BASE_URL, { stepName: 'Open the application' }); // flow = lighthouse
    await page.waitForSelector(selectors.tablesTab, { visible: true });
    console.log('Application opened');

    // Select flows
    await flow.startTimespan({ stepName: 'Navigate to the Tables tab' });
    await clickAndWait(page, selectors.tablesTab);
    await page.waitForSelector(selectors.firstTableProduct, { visible: true });
    await flow.endTimespan();
    console.log('Tables tab opened');

    await flow.startTimespan({ stepName: 'Open first table product card' });
    await clickAndWait(page, selectors.firstTableProduct);
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent.trim().length > 0,
      {},
      selectors.productTitle
    );
    await flow.endTimespan();
    const selectedProductUrl = page.url();
    console.log('First table product card opened');

    await flow.startTimespan({ stepName: 'Add the table to the cart' });
    await addTableToCart(page);
    await flow.endTimespan();
    console.log('Product added to cart');

    await flow.startTimespan({ stepName: 'Open the cart' });
    await clickAndWait(page, selectors.cartTab);
    await waitForCartProduct(page, selectedProductUrl);
    await flow.endTimespan();
    console.log('Cart opened');

    await flow.startTimespan({ stepName: 'Click Place an order' });
    await clickAndWait(page, selectors.placeOrderButton);
    await page.waitForSelector(selectors.checkoutForm, { visible: true });
    await flow.endTimespan();
    console.log('Checkout page opened');

    await flow.startTimespan({ stepName: 'Fill required fields and place order' });
    await fillCheckoutForm(page);
    await submitCheckoutOrder(page);
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent.toLowerCase().includes('thank'),
      { timeout: timeouts.orderConfirmation },
      selectors.thankYouTitle
    );
    await flow.endTimespan();
    console.log('Order placed');

    const report = await flow.generateReport();
    fs.writeFileSync(REPORT_HTML, report); // write html report

    const reportJson = JSON.stringify(await flow.createFlowResult())
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');

    fs.writeFileSync(REPORT_JSON, reportJson); // write json report

    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    const artifacts = flow.createArtifactsJson();
    const artifactsPath = path.join(ARTIFACTS_DIR, 'artifacts.json');
    fs.writeFileSync(artifactsPath, JSON.stringify(artifacts));

    for (const [index, step] of artifacts.gatherSteps.entries()) {
      if (step.artifacts.traces?.defaultPass) {
        fs.writeFileSync(
          path.join(ARTIFACTS_DIR, `step-${index + 1}.trace.json`),
          JSON.stringify(step.artifacts.traces.defaultPass)
        );
      }

      if (step.artifacts.devtoolsLogs?.defaultPass) {
        fs.writeFileSync(
          path.join(ARTIFACTS_DIR, `step-${index + 1}.devtoolslog.json`),
          JSON.stringify(step.artifacts.devtoolsLogs.defaultPass)
        );
      }
    }

    console.log(`Reports saved:\n${REPORT_HTML}\n${REPORT_JSON}`);
    console.log(`Artifacts saved:\n${ARTIFACTS_DIR}`);
  } finally {
    await browser.close(); // close Chrome
  }
}

captureReport().catch((error) => {
  console.error(error);
  process.exit(1);
});
