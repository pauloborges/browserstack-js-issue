/* eslint-env node */
/* eslint eqeqeq: "off", no-console: "off" */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const BrowserStackLib = require('browserstack');

const credentials = {
  username: process.env.BROWSERSTACK_USER,
  password: process.env.BROWSERSTACK_ACCESSKEY
};

class BrowserStack {
  constructor(cred) {
    this.api = BrowserStackLib.createClient(cred);
  }

  getBrowsers() {
    return new Promise((resolve, reject) => {
      this.api.getBrowsers((error, browsers) => {
        if (error) {
          reject(error);
        } else {
          resolve(browsers);
        }
      });
    });
  }
}

/** Asynchronously loads all available browsers.
 *
 * @param {BrowserStack} browserstack - An instance of the BrowserStack object.
 * @returns {Promise<Array<Browser>>} - A promise of of a list of available browsers.
 */
async function loadAvailableBrowsers(browserstack) {
  const browsers = await browserstack.getBrowsers();

  // Filter out beta/dev versions
  return browsers.filter(
    browser => !browser.browser_version || (browser.browser_version && /^\d+(\.\d+)?$/.exec(browser.browser_version))
  );
}

/** Reads browser specs from the disk (file called `browsers.json`).
 *
 * @returns {Array<GroupedBrowserSpec>} - A list of browser specs.
 */
function loadAggregatedBrowserSpecs() {
  const filename = path.join(__dirname, 'browsers.json');
  const browsers = fs.readFileSync(filename, 'utf8');
  return JSON.parse(browsers);
}

/** Finds the browsers that matches the given list of grouped browser specs.
 *
 * @param {Array<Browser>} availableBrowsers - List containing all available browsers. The result
 *  will be a subset of this list.
 * @param {Array<GroupedBrowserSpec>} aggregatedSpecs - List of browser specs where the browsers
 * are grouped by os/os version/device.
 * @returns {Array<Browser>} - A list of browsers that matches the given specs.
 */
function getTargetBrowsers(availableBrowsers, aggregatedSpecs) {
  const targetBrowsers = {};

  aggregatedSpecs.forEach(aggregatedSpec => {
    const specs = aggregatedSpec.browsers.map(spec => ({
      device: aggregatedSpec.device,
      os: aggregatedSpec.os,
      os_version: aggregatedSpec.os_version,
      browser: spec.browser,
      browser_version: parseBrowserVersion(spec.browser_version)
    }));

    specs.forEach(spec => {
      const browsers = getBrowsersThatMatchSpec(availableBrowsers, spec);
      addBrowsers(targetBrowsers, browsers);
    });
  });

  return Object.values(targetBrowsers);
}

function parseBrowserVersion(version) {
  if (version) {
    const res = /last (\d+)/.exec(version);

    if (res) {
      return {
        type: 'last',
        value: res[1]
      };
    } else {
      return {
        type: 'list',
        value: version.split(',')
      };
    }
  } else {
    return {
      type: 'no-version'
    };
  }
}

/** Finds all browsers that matches a given browser spec.
 *
 * @param {Array<Browser>} availableBrowsers - List containing all available browsers.
 * @param {BrowserSpec} spec - A spec that can specify i.e. device, os, os and browser.
 * @returns {Array<Browser>} - A list of browsers that matches the given spec.
 */
function getBrowsersThatMatchSpec(availableBrowsers, spec) {
  let browsers = availableBrowsers.filter(
    browser =>
      spec.device == browser.device &&
      spec.os == browser.os &&
      spec.os_version == browser.os_version &&
      spec.browser == browser.browser
  );

  if (spec.browser_version.type === 'list') {
    const versions = spec.browser_version.value;
    browsers = browsers.filter(browser => versions.includes(browser.browser_version));
  } else if (spec.browser_version.type === 'last') {
    browsers.sort((a, b) => parseFloat(b.browser_version) - parseFloat(a.browser_version));

    if (browsers.length < spec.browser_version.value) {
      console.error('Not enough versions available for the following spec:');
      console.error(JSON.stringify(spec, null, '\t'));
      console.error('Exiting...');
      process.exit(1);
    }

    browsers = browsers.slice(0, spec.browser_version.value);
  }

  if (browsers.length === 0) {
    console.error('No browsers available for the following spec:');
    console.error(JSON.stringify(spec, null, '\t'));
    console.error('Exiting...');
    process.exit(1);
  }

  return browsers;
}

function addBrowsers(browserMap, browsers) {
  browsers.forEach(browser => {
    const id = getBrowserId(browser);

    if (id in browserMap) {
      console.warn('duplicate browser');
    }

    browserMap[id] = browser; // eslint-disable-line no-param-reassign
  });
}

function getBrowserId(browser) {
  return [browser.os, browser.os_version, browser.browser, browser.browser_version, browser.device].join('_');
}

/** Creates a temporary file that contains the given contents.
 *
 * @param {string} contents - The contents to write in the temporary file.
 * @returns {string} - The temporary file's full path.
 */
function createTmpFile(contents) {
  const timestamp = new Date().toISOString();
  const filename = `${os.tmpdir()}${path.sep}widget-env-test-browsers-${timestamp}`;

  fs.writeFileSync(filename, contents);

  return filename;
}

/** Removes a temporary file indicated by the given full path.
 *
 * @param {string} filename - The temporary file's full path.
 */
function removeTmpFile(filename) {
  fs.unlinkSync(filename);
}

/** Executes the environment tests on BrowserStack.
 *
 * @param {string} browsersFile - The full path for a file containing information on which browsers
 * the tests should run (browser specs).
 * @returns {Promise<undefined>} - A promise that resolves when the tests are done.
 */
function runEnvironmentTests(browsersFile) {
  return new Promise((resolve, reject) => {
    const karma = spawn('node_modules/.bin/karma', ['start', path.join(__dirname, 'karma.config.js')], {
      env: {
        ...process.env,
        KARMA_BROWSERSTACK_BROWSERSFILE: browsersFile
      }
    });

    karma.stdout.on('data', data => {
      process.stdout.write(data);
    });

    karma.stderr.on('data', data => {
      process.stderr.write(data);
    });

    karma.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(code);
      }
    });
  });
}

async function main() {
  const browserstack = new BrowserStack(credentials);

  const availableBrowsers = await loadAvailableBrowsers(browserstack);
  const aggregatedBrowserSpecs = loadAggregatedBrowserSpecs();
  const targetBrowsers = getTargetBrowsers(availableBrowsers, aggregatedBrowserSpecs);

    console.log(targetBrowsers);

//   const browsersFile = createTmpFile(JSON.stringify(targetBrowsers));

//   try {
//     await runEnvironmentTests(browsersFile);
//   } catch (error) {
//     process.exit(error);
//   } finally {
//     removeTmpFile(browsersFile);
//   }
}

main();
