module.exports = config => {
  config.set({
    hostname: 'dev.partnerbookingkit.com',
    port: 9876,
    colors: true,
    logLevel: config.LOG_DEBUG,
    concurrency: 2,
    singleRun: true,
    frameworks: ['jasmine'],
    exclude: [],
    files: ['test.js'],
    reporters: ['dots', 'BrowserStack'],

    customLaunchers: {
      browserstack_iphone7: {
        base: 'BrowserStack',
        os: 'ios',
        os_version: '10.3',
        browser: 'Mobile Safari',
        device: 'iPhone 7',
        browser_version: null,
        real_mobile: true
      },
      browserstack_iphoneSe: {
        base: 'BrowserStack',
        os: 'ios',
        os_version: '10.3',
        browser: 'Mobile Safari',
        device: 'iPhone SE',
        browser_version: null,
        real_mobile: false
      }
    },
    browsers: [
      'browserstack_iphone7',
      'browserstack_iphoneSe'
    ],

    browserStack: {
      username: process.env.BROWSERSTACK_USER,
      accessKey: process.env.BROWSERSTACK_ACCESSKEY,
      build: `BrowserStack JS issue - ${Date.now()}`,
      video: false
    }
  });
};
