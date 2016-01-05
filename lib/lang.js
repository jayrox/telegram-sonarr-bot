var i18n = require('i18n'); // https://www.npmjs.com/package/i18n

/*
 * set up multilingual support
 */
i18n.configure({
    locales: ['en'],
    directory: __dirname + '/../locales'
});

module.exports = i18n;
