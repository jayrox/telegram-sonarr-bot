'use strict';

var fs          = require('fs');                        // https://nodejs.org/api/fs.html
var _           = require('lodash');                    // https://www.npmjs.com/package/lodash
var NodeCache   = require('node-cache');                // https://www.npmjs.com/package/node-cache
var SonarrAPI   = require('sonarr-api');                // https://www.npmjs.com/package/sonarr-api
var TelegramBot = require('node-telegram-bot-api');     // https://www.npmjs.com/package/node-telegram-bot-api

var state  = require(__dirname + '/lib/state');
var logger = require(__dirname + '/lib/logger');
var i18n   = require(__dirname + '/lib/lang');

/*
 * import config
 */
try {
  var config = require(__dirname + '/config.json');
} catch (err) {
  var config = {};
  config.telegram = {};
  config.bot = {};
  config.sonarr = {};
}

/*
 * import users
 */
try {
  var acl = require(__dirname + '/acl.json');
} catch (err) {
  var acl = {};
  acl.allowedUsers = [];
  acl.revokedUsers = [];
}

/*
 * define response class
 */
class Response {
  constructor(message, keyboard) {
    this.message = message;
    this.keyboard = keyboard;
  }
}

/*
 * set up the telegram bot
 */
var bot = new TelegramBot(process.env.TELEGRAM_BOTTOKEN || config.telegram.botToken, {
  polling: true
});

/*
 * set up the sonarr api
 */
var sonarr = new SonarrAPI({
  hostname: process.env.SONARR_HOST || config.sonarr.hostname,
  apiKey: process.env.SONARR_APIKEY || config.sonarr.apiKey,
  port: process.env.SONARR_PORT || config.sonarr.port || 8989,
  urlBase: process.env.SONARR_URLBASE || config.sonarr.urlBase,
  ssl: process.env.SONARR_SSL || config.sonarr.ssl,
  username: process.env.SONARR_USERNAME || config.sonarr.username,
  password: process.env.SONARR_PASSWORD || config.sonarr.password
});

/*
 * set up a simple caching tool
 */
var cache = new NodeCache({ stdTTL: 120, checkperiod: 150 });

/*
 * get the bot name
 */
bot.getMe()
  .then(function(msg) {
    logger.info('sonarr bot %s initialized', msg.username);
  })
  .catch(function(err) {
    throw new Error(err);
  });

/*
 * handle start command
 */
bot.onText(/\/start/, function(msg) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;

  logger.info('user: %s, message: sent \'/start\' command', fromId);

  if (!isAuthorized(fromId)) {
    replyWithError(chatId, i18n.__('notAuthorized'));
    return;
  }

  var response = ['Hello ' + getTelegramName(msg.from) + ', use /q to search'];
  response.push('\n`/q [series name]` to continue...');

  var opts = {
    'parse_mode': 'Markdown',
    'selective': 2,
  };

  bot.sendMessage(chatId, response.join('\n'), opts);
});

/*
 * on query, select series
 */
bot.onText(/\/[Qq](uery)? (.+)/, function(msg, match) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;
  var seriesName = match[2];

  logger.info('user: %s, message: sent \'/query\' command', fromId);

  if (!isAuthorized(fromId)) {
    replyWithError(chatId, i18n.__('notAuthorized'));
    return;
  }

  sonarr.get('series/lookup', {
      'term': seriesName
    })
    .then(function(result) {
      if (!result.length) {
        throw new Error('could not find ' + seriesName + ', try searching again');
      }

      return result;
    })
    .then(function(series) {
      logger.info('user: %s, message: requested to search for series "%s"', fromId, seriesName);

      var seriesList = [];
      var keyboardList = [];

      if (config.bot.maxResults) {
        series.length = (series.length > config.bot.maxResults ? config.bot.maxResults : series.length);
      }
      
      var response = ['*Found ' + series.length + ' series:*'];

      _.forEach(series, function(n, key) {
        var id = key + 1;
        var keyboardValue = n.title + (n.year ? ' - ' + n.year : '');

        seriesList.push({
          'id': id,
          'title': n.title,
          'year': n.year,
          'tvdbId': n.tvdbId,
          'titleSlug': n.titleSlug,
          'seasons': n.seasons,
          'keyboardValue': keyboardValue
        });

        keyboardList.push( [keyboardValue] );

        response.push(
          '*' + id + '*) ' +
          '[' + n.title + '](http://thetvdb.com/?tab=series&id=' + n.tvdbId + ')' +
          (n.year ? ' - _' + n.year + '_' : '')
        );
      });

      response.push(i18n.__('selectFromMenu'));

      logger.info('user: %s, message: found the following series %s', fromId, keyboardList.join(', '));

      // set cache
      cache.set('seriesList' + fromId, seriesList);
      cache.set('state' + fromId, state.sonarr.SERIES);

      return new Response(response.join('\n'), keyboardList);
    })
    .then(function(response) {
      var keyboard = {
        keyboard: response.keyboard,
        one_time_keyboard: true
      };
      var opts = {
        'disable_web_page_preview': true,
        'parse_mode': 'Markdown',
        'selective': 2,
        'reply_markup': JSON.stringify(keyboard),
      };
      bot.sendMessage(chatId, response.message, opts);
    })
    .catch(function(err) {
      replyWithError(chatId, err);
    });
});

/*
 Captures any and all messages, filters out commands, handles profiles and movies
 sent via the custom keyboard.
 */
bot.on('message', function(msg) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;
  var message = msg.text;

  // If the message is a command, ignore it.
  var currentState = cache.get('state' + fromId);

  if (message[0] !== '/' || (currentState === state.sonarr.FOLDER && message[0] === '/')) {
    // make sure the user has privileges
    if (!isAuthorized(fromId)) {
      replyWithError(chatId, i18n.__('notAuthorized'));
      return;
    }

    switch (currentState) {
      case state.sonarr.SERIES:
        logger.info('user: %s, message: choose the series %s', fromId, message);
        handleSeries(chatId, fromId, message);
        break;
      case state.sonarr.PROFILE:
        logger.info('user: %s, message: choose the profile "%s"', fromId, message);
        handleSeriesProfile(chatId, fromId, message);
        break;
      case state.sonarr.FOLDER:
        logger.info('user: %s, message: choose the folder "%s"', fromId, message);
        handleSeriesFolder(chatId, fromId, message);
        break;
      case state.sonarr.MONITOR:
        logger.info('user: %s, message: choose the monitor type "%s"', fromId, message);
        handleSeriesMonitor(chatId, fromId, message);
        break;
      case state.admin.REVOKE:
        logger.info('user: %s, message: choose to revoke user "%s"', fromId, message);
        handleRevokeUser(chatId, fromId, message);
        break;
      case state.admin.REVOKE_CONFIRM:
        logger.info('user: %s, message: choose the revoke confirmation "%s"', fromId, message);
        handleRevokeUserConfirm(chatId, fromId, message);
        break;
      case state.admin.UNREVOKE:
        logger.info('user: %s, message: choose to unrevoke user "%s"', fromId, message);
        handleUnRevokeUser(chatId, fromId, message);
        break;
      case state.admin.UNREVOKE_CONFIRM:
        logger.info('user: %s, message: choose the unrevoke confirmation "%s"', fromId, message);
        handleUnRevokeUserConfirm(chatId, fromId, message);
        break;
      default:
        logger.info('user: %s, message: received unknown message "%s"', fromId, message);
        replyWithError(chatId, 'Unsure what\'s going on, use the `/clear` command and start over.');
    }
  }
});

/*
 * handle authorization
 */
bot.onText(/\/auth (.+)/, function(msg, match) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;
  var password = match[1];

  var message = [];

  if (isAuthorized(fromId)) {
    message.push('Already authorized.');
    message.push('Type /start to begin.');
    bot.sendMessage(chatId, message.join('\n'));
    return;
  }

  // make sure the user is not banned
  if (isRevoked(fromId)) {
    message.push('Your access has been revoked and cannot reauthorize.');
    message.push('Please reach out to the bot owner for support.');
    bot.sendMessage(chatId, message.join('\n'));
    return;
  }

  if (password === (config.bot.password || process.env.BOT_PASSWORD)) {
    acl.allowedUsers.push(msg.from);
    updateACL();

    if (acl.allowedUsers.length === 1) {
      promptOwnerConfig(chatId, fromId);
    }

    message.push('You have been authorized.');
    message.push('Type /start to begin.');
    bot.sendMessage(chatId, message.join('\n'));
  } else {
    bot.sendMessage(chatId, 'Invalid password.');
  }

  if ((config.bot.owner || process.env.BOT_OWNER) > 0) {
    bot.sendMessage(config.bot.owner || process.env.BOT_OWNER, getTelegramName(msg.from) + ' has been granted access.');
  }
});

/*
 * handle users
 */
bot.onText(/\/users/, function(msg) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;

  if (isAuthorized(fromId)) {
    promptOwnerConfig(chatId, fromId);
  }

  if ((config.bot.owner || process.env.BOT_OWNER) !== fromId) {
    replyWithError(chatId, i18n.__('adminOnly'));
    return;
  }

  var response = ['*Allowed Users:*'];
  _.forEach(acl.allowedUsers, function(n, key) {
    response.push('*' + (key + 1) + '*) ' + getTelegramName(n));
  });

  var opts = {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
  };

  bot.sendMessage(chatId, response.join('\n'), opts);
});

/*
 * handle user access revocation
 */
bot.onText(/\/revoke/, function(msg) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;

  if (isAuthorized(fromId)) {
    promptOwnerConfig(chatId, fromId);
  }

  if ((config.bot.owner || process.env.BOT_OWNER) !== fromId) {
    replyWithError(chatId, i18n.__('adminOnly'));
    return;
  }

  var opts = {};

  if (acl.allowedUsers.length === 0) {
    var message = 'There aren\'t any allowed users.';
    opts = {
      'disable_web_page_preview': true,
      'parse_mode': 'Markdown',
      'selective': 2,
    };
    bot.sendMessage(chatId, message, opts);
  }

  var keyboardList = [];
  var keyboardRow = [];
  var revokeList = [];
  var response = ['*Allowed Users:*'];
  _.forEach(acl.allowedUsers, function(n, key) {
    revokeList.push({
      'id': key + 1,
      'userId': n.id,
      'keyboardValue': getTelegramName(n)
    });
    response.push('*' + (key + 1) + '*) ' + getTelegramName(n));

    keyboardRow.push(getTelegramName(n));
    if (keyboardRow.length == 2) {
      keyboardList.push(keyboardRow);
      keyboardRow = [];
    }
  });

  response.push(i18n.__('selectFromMenu'));


  if (keyboardRow.length == 1) {
    keyboardList.push([keyboardRow[0]]);
  }

  // set cache
  cache.set('state' + fromId, state.admin.REVOKE);
  cache.set('revokeUserList' + fromId, revokeList);

  var keyboard = {
    keyboard: keyboardList,
    one_time_keyboard: true
  };
  opts = {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
    'reply_markup': JSON.stringify(keyboard),
  };
  bot.sendMessage(chatId, response.join('\n'), opts);
});

/*
 * handle user access unrevocation
 */
bot.onText(/\/unrevoke/, function(msg) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;

  if (isAuthorized(fromId)) {
    promptOwnerConfig(chatId, fromId);
  }

  if ((config.bot.owner || process.env.BOT_OWNER) !== fromId) {
    replyWithError(chatId, i18n.__('adminOnly'));
    return;
  }

  var opts = {};

  if (acl.revokedUsers.length === 0) {
    var message = 'There aren\'t any revoked users.';
    opts = {
      'disable_web_page_preview': true,
      'parse_mode': 'Markdown',
      'selective': 2,
    };
    bot.sendMessage(chatId, message, opts);
  }

  var keyboardList = [];
  var keyboardRow = [];
  var revokeList = [];
  var response = ['*Revoked Users:*'];
  _.forEach(acl.revokedUsers, function(n, key) {
    revokeList.push({
      'id': key + 1,
      'userId': n.id,
      'keyboardValue': getTelegramName(n)
    });

    response.push('*' + (key + 1) + '*) ' + getTelegramName(n));
 
    keyboardRow.push(getTelegramName(n));
    if (keyboardRow.length == 2) {
      keyboardList.push(keyboardRow);
      keyboardRow = [];
    }
  });

  response.push(i18n.__('selectFromMenu'));

  if (keyboardRow.length == 1) {
    keyboardList.push([keyboardRow[0]]);
  }

  // set cache
  cache.set('state' + fromId, state.admin.UNREVOKE);
  cache.set('unrevokeUserList' + fromId, revokeList);

  var keyboard = {
    keyboard: keyboardList,
    one_time_keyboard: true
  };
  opts = {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
    'reply_markup': JSON.stringify(keyboard),
  };
  bot.sendMessage(chatId, response.join('\n'), opts);
});


/*
 * handle rss sync
 */
bot.onText(/\/rss/, function(msg) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;

  logger.info('user: %s, message: sent \'/rss\' command', fromId);

  if ((config.bot.owner || process.env.BOT_OWNER) !== fromId) {
    replyWithError(chatId, 'Only the owner can issue RSS Sync.');
    return;
  }

  sonarr.post('command', {
      'name': 'RssSync'
    })
    .then(function() {
      logger.info('user: %s, message: \'/rss\' command successfully executed', fromId);
      bot.sendMessage(chatId, 'RSS Sync command sent.');
    })
    .catch(function(err) {
      replyWithError(chatId, err);
    });
});

/*
 * handle refresh series
 */
bot.onText(/\/refresh/, function(msg) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;

  logger.info('user: %s, message: sent \'/refresh\' command', fromId);

  if ((config.bot.owner || process.env.BOT_OWNER) !== fromId) {
    replyWithError(chatId, 'Only the owner can refresh series.');
    return;
  }

  sonarr.post('command', {
      'name': 'RefreshSeries'
    })
    .then(function() {
      logger.info('user: %s, message: \'/refresh\' command successfully executed', fromId);
      bot.sendMessage(chatId, 'Refresh series command sent.');
    })
    .catch(function(err) {
      replyWithError(chatId, err);
    });
});

/*
 * handle clear command
 */
bot.onText(/\/clear/, function(msg) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;

  logger.info('user: %s, message: sent \'/clear\' command', fromId);

  if (!isAuthorized(fromId)) {
    replyWithError(chatId, i18n.__('notAuthorized'));
    return;
  }

  logger.info('user: %s, message: \'/clear\' command successfully executed', fromId);

  clearCache(fromId);

  bot.sendMessage(chatId, 'All previously sent commands have been cleared, yey!', {
    'reply_markup': {
      'hide_keyboard': true
    }
  });
});

function handleSeries(chatId, fromId, seriesDisplayName) {
  var seriesList = cache.get('seriesList' + fromId);
  if (seriesList === undefined) {
    throw new Error('something went wrong, try searching again');
  }

  var series = _.filter(seriesList, function(item) {
    return item.keyboardValue == seriesDisplayName;
  })[0];

  if (series === undefined) {
    throw new Error('could not find the series with title ' + seriesDisplayName);
  }

  var seriesId = series.id;

  cache.set('seriesId' + fromId, seriesId);

  sonarr.get('profile')
    .then(function(result) {
      if (!result.length) {
        throw new Error('could not get profiles, try searching again');
      }

      if (cache.get('seriesList' + fromId) === undefined) {
        throw new Error('could not get previous series list, try searching again');
      }

      return result;
    })
    .then(function(profiles) {
      logger.info('user: %s, message: requested to get profile list', fromId);

      var profileList = [];
      var keyboardList = [];
      var keyboardRow = [];

      var response = ['*Found ' + profiles.length + ' profiles:*'];
      _.forEach(profiles, function(n, key) {
        profileList.push({
          'id': key + 1,
          'name': n.name,
          'label': n.name,
          'profileId': n.id
        });

        response.push('*' + (key + 1) + '*) ' + n.name);

        // Profile names are short, put two on each custom
        // keyboard row to reduce scrolling
        keyboardRow.push(n.name);
        if (keyboardRow.length === 2) {
          keyboardList.push(keyboardRow);
          keyboardRow = [];
        }
      });

      if (keyboardRow.length == 1) {
        keyboardList.push([keyboardRow[0]]);
      }
      response.push(i18n.__('selectFromMenu'));

      logger.info('user: %s, message: found the following profiles %s', fromId, keyboardList.join(', '));

      // set cache
      cache.set('seriesProfileList' + fromId, profileList);
      cache.set('state' + fromId, state.sonarr.PROFILE);

      return new Response(response.join('\n'), keyboardList);
    })
    .then(function(response) {
      var keyboard = {
        keyboard: response.keyboard,
        one_time_keyboard: true
      };
      var opts = {
        'disable_web_page_preview': true,
        'parse_mode': 'Markdown',
        'selective': 2,
        'reply_markup': JSON.stringify(keyboard),
      };
      bot.sendMessage(chatId, response.message, opts);
    })
    .catch(function(err) {
      replyWithError(chatId, err);
    });
}

function handleSeriesProfile(chatId, fromId, profileName) {
  var profileList = cache.get('seriesProfileList' + fromId);
  if (profileList === undefined) {
    throw new Error('something went wrong, try searching again');
  }

  var profile = _.filter(profileList, function(item) {
    return item.label == profileName;
  })[0];

  if (profile === undefined) {
    throw new Error('could not find the profile ' + profileName);
  }

  // set series option to cache
  cache.set('seriesProfileId' + fromId, profile.id);

  sonarr.get('rootfolder')
    .then(function(result) {
      if (!result.length) {
        throw new Error('could not get folders, try searching again');
      }

      if (cache.get('seriesList' + fromId) === undefined) {
        throw new Error('could not get previous list, try searching again');
      }
      return result;
    })
    .then(function(folders) {
      logger.info('user: %s, message: requested to get folder list', fromId);

      var folderList = [];
      var keyboardList = [];
      var response = ['*Found ' + folders.length + ' folders:*'];
      _.forEach(folders, function(n, key) {
        folderList.push({
          'id': key + 1,
          'path': n.path,
          'folderId': n.id
        });

        response.push('*' + (key + 1) + '*) ' + n.path);

        keyboardList.push([n.path]);
      });
      response.push(i18n.__('selectFromMenu'));

      logger.info('user: %s, message: found the following folders %s', fromId, keyboardList.join(', '));

      // set cache
      cache.set('seriesFolderList' + fromId, folderList);
      cache.set('state' + fromId, state.sonarr.FOLDER);

      return new Response(response.join('\n'), keyboardList);
    })
    .then(function(response) {
      var keyboard = {
        keyboard: response.keyboard,
        one_time_keyboard: true
      };
      var opts = {
        'disable_web_page_preview': true,
        'parse_mode': 'Markdown',
        'selective': 2,
        'reply_markup': JSON.stringify(keyboard),
      };
      bot.sendMessage(chatId, response.message, opts);
    })
    .catch(function(err) {
      replyWithError(chatId, err);
    });
}

function handleSeriesFolder(chatId, fromId, folderName) {
  var seriesId = cache.get('seriesId' + fromId);
  var seriesList = cache.get('seriesList' + fromId);
  var folderList = cache.get('seriesFolderList' + fromId);

  if (seriesList === undefined || seriesId === undefined || folderList === undefined) {
    replyWithError(chatId, 'something went wrong, try searching again');
    return;
  }

  var folder = _.filter(folderList, function(item) {
    return item.path == folderName;
  })[0];

  // set movie option to cache
  cache.set('seriesFolderId' + fromId, folder.folderId);

  logger.info('user: %s, message: requested to get monitor list', fromId);

  var monitor = ['future', 'all', 'none', 'latest', 'first'];
  var monitorList = [];
  var keyboardList = [];
  var keyboardRow = [];
  var response = ['*Select which seasons to monitor:*'];
  _.forEach(monitor, function(n, key) {
    monitorList.push({
      'id': key + 1,
      'type': n
    });

    response.push('*' + (key + 1) + '*) ' + n);

    keyboardRow.push(n);
    if (keyboardRow.length == 2) {
      keyboardList.push(keyboardRow);
      keyboardRow = [];
    }
  });

  if (keyboardRow.length == 1) {
    keyboardList.push([keyboardRow[0]]);
  }

  response.push(i18n.__('selectFromMenu'));

  logger.info('user: %s, message: found the following monitor types %s', fromId, keyboardList.join(', '));

  // set cache
  cache.set('seriesMonitorList' + fromId, monitorList);
  cache.set('state' + fromId, state.sonarr.MONITOR);

  var keyboard = {
    keyboard: keyboardList,
    one_time_keyboard: true
  };
  var opts = {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
    'reply_markup': JSON.stringify(keyboard),
  };
  bot.sendMessage(chatId, response.join('\n'), opts);
}

function handleSeriesMonitor(chatId, fromId, monitorType) {
  var seriesId = cache.get('seriesId' + fromId);
  var seriesList = cache.get('seriesList' + fromId);
  var profileId = cache.get('seriesProfileId' + fromId);
  var profileList = cache.get('seriesProfileList' + fromId);
  var folderId = cache.get('seriesFolderId' + fromId);
  var folderList = cache.get('seriesFolderList' + fromId);
  var monitorList = cache.get('seriesMonitorList' + fromId);

  if (folderList === undefined || profileList === undefined || seriesList === undefined || monitorList === undefined) {
    throw new Error('something went wrong, try searching again');
  }

  var series = _.filter(seriesList, function(item) {
    return item.id == seriesId;
  })[0];

  var profile = _.filter(profileList, function(item) {
    return item.id == profileId;
  })[0];

  var folder = _.filter(folderList, function(item) {
    return item.folderId == folderId;
  })[0];

  var monitor = _.filter(monitorList, function(item) {
    return item.type == monitorType;
  })[0];

  var postOpts = {};
  postOpts.tvdbId = series.tvdbId;
  postOpts.title = series.title;
  postOpts.titleSlug = series.titleSlug;
  postOpts.rootFolderPath = folder.path;
  postOpts.seasonFolder = true;
  postOpts.monitored = true;
  postOpts.seriesType = 'standard';
  postOpts.qualityProfileId = profile.profileId;

  var lastSeason = _.max(series.seasons, 'seasonNumber');
  var firstSeason = _.min(_.reject(series.seasons, {
    seasonNumber: 0
  }), 'seasonNumber');

  if (monitor.type === 'future') {
    postOpts.addOptions = {};
    postOpts.addOptions.ignoreEpisodesWithFiles = true;
    postOpts.addOptions.ignoreEpisodesWithoutFiles = true;
  } else if (monitor.type === 'all') {
    postOpts.addOptions = {};
    postOpts.addOptions.ignoreEpisodesWithFiles = false;
    postOpts.addOptions.ignoreEpisodesWithoutFiles = false;
  } else if (monitor.type === 'none') {
    // mark all seasons (+1) not monitored
    _.each(series.seasons, function(season) {
      if (season.seasonNumber >= lastSeason.seasonNumber + 1) {
        season.monitored = true;
      } else {
        season.monitored = false;
      }
    });
  } else if (monitor.type === 'latest') {
    // update latest season to be monitored
    _.each(series.seasons, function(season) {
      if (season.seasonNumber >= lastSeason.seasonNumber) {
        season.monitored = true;
      } else {
        season.monitored = false;
      }
    });
  } else if (monitor.type === 'first') {
    // mark all as not monitored
    _.each(series.seasons, function(season) {
      if (season.seasonNumber >= lastSeason.seasonNumber + 1) {
        season.monitored = true;
      } else {
        season.monitored = false;
      }
    });

    // update first season
    _.each(series.seasons, function(season) {
      if (season.seasonNumber === firstSeason.seasonNumber) {
        season.monitored = !season.monitored;
      }
    });
  }

  // update seasons to be monitored
  postOpts.seasons = series.seasons;

  logger.info('user: %s, message: adding series "%s" with options %s', fromId, series.title, JSON.stringify(postOpts));

  sonarr.post('series', postOpts)
    .then(function(result) {
      logger.info('user: %s, message: added series "%s"', fromId, series.title);

      if (!result) {
        throw new Error('could not add series, try searching again.');
      }

      bot.sendMessage(chatId, 'Series `' + series.title + '` added', {
        'selective': 2,
        'parse_mode': 'Markdown'
      });
    })
    .catch(function(err) {
      replyWithError(chatId, err);
    })
    .finally(function() {
      clearCache(fromId);
    });
}

function handleRevokeUser(chatId, fromId, revokedUser) {
  if (isAuthorized(fromId)) {
    promptOwnerConfig(chatId, fromId);
  }

  if ((config.bot.owner || process.env.BOT_OWNER) !== fromId) {
    replyWithError(chatId, i18n.__('adminOnly'));
    return;
  }

  var keyboardList = [];
  var response = ['Are you sure you want to revoke access to ' + revokedUser + '?'];
  keyboardList.push(['NO']);
  keyboardList.push(['yes']);

  // set cache
  cache.set('state' + fromId, state.admin.REVOKE_CONFIRM);
  cache.set('revokedUserName' + fromId, revokedUser);

  logger.info('user: %s, message: selected revoke user %s', fromId, revokedUser);

  var keyboard = {
    keyboard: keyboardList,
    one_time_keyboard: true
  };
  var opts = {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
    'reply_markup': JSON.stringify(keyboard),
  };
  bot.sendMessage(chatId, response.join('\n'), opts);
}

function handleRevokeUserConfirm(chatId, fromId, revokedConfirm) {
  if (isAuthorized(fromId)) {
    promptOwnerConfig(chatId, fromId);
  }

  if ((config.bot.owner || process.env.BOT_OWNER) !== fromId) {
    replyWithError(chatId, i18n.__('adminOnly'));
    return;
  }

  logger.info('user: %s, message: selected revoke confirmation %s', fromId, revokedConfirm);

  var revokedUser = cache.get('revokedUserName' + fromId);
  var opts = {};
  var message = '';
  if (revokedConfirm === 'NO' || revokedConfirm === 'no') {
      clearCache(fromId);
      message = 'Access for ' + revokedUser + ' has *NOT* been revoked.';
      opts = {
        'disable_web_page_preview': true,
         'parse_mode': 'Markdown',
        'selective': 2,
      };
      bot.sendMessage(chatId, message, opts);
      return;
  }
  var revokedUserList = cache.get('revokeUserList' + fromId);
  var i = revokedUserList.map(function(e) { return e.keyboardValue; }).indexOf(revokedUser);
  var revokedUserObj = revokedUserList[i];
  var j = acl.allowedUsers.map(function(e) { return e.id; }).indexOf(revokedUserObj.userId);

  acl.revokedUsers.push(acl.allowedUsers[j]);
  acl.allowedUsers.splice(j, 1);
  updateACL();

  message = 'Access for ' + revokedUser + ' has been revoked.';
  opts = {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
  };
  bot.sendMessage(chatId, message, opts);
  clearCache(fromId);
}

function handleUnRevokeUser(chatId, fromId, revokedUser) {
  if (isAuthorized(fromId)) {
    promptOwnerConfig(chatId, fromId);
  }

  if ((config.bot.owner || process.env.BOT_OWNER) !== fromId) {
    replyWithError(chatId, i18n.__('adminOnly'));
    return;
  }

  var keyboardList = [];
  var response = ['Are you sure you want to unrevoke access for ' + revokedUser + '?'];
  keyboardList.push(['NO']);
  keyboardList.push(['yes']);

  // set cache
  cache.set('state' + fromId, state.admin.UNREVOKE_CONFIRM);
  cache.set('revokedUserName' + fromId, revokedUser);

  logger.info('user: %s, message: selected unrevoke user %s', fromId, revokedUser);

  var keyboard = {
    keyboard: keyboardList,
    one_time_keyboard: true
  };
  var opts = {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
    'reply_markup': JSON.stringify(keyboard),
  };
  bot.sendMessage(chatId, response.join('\n'), opts);
}

function handleUnRevokeUserConfirm(chatId, fromId, revokedConfirm) {
  if (isAuthorized(fromId)) {
    promptOwnerConfig(chatId, fromId);
  }

  if ((config.bot.owner || process.env.BOT_OWNER) !== fromId) {
    replyWithError(chatId, i18n.__('adminOnly'));
    return;
  }

  logger.info('user: %s, message: selected unrevoke confirmation %s', fromId, revokedConfirm);

  var revokedUser = cache.get('revokedUserName' + fromId);
  var opts = {};
  var message = '';
  if (revokedConfirm === 'NO' || revokedConfirm === 'no') {
      clearCache(fromId);
      message = 'Access for ' + revokedUser + ' has *NOT* been unrevoked.';
      opts = {
        'disable_web_page_preview': true,
         'parse_mode': 'Markdown',
        'selective': 2,
      };
      bot.sendMessage(chatId, message, opts);
      return;
  }

  var unrevokedUserList = cache.get('unrevokeUserList' + fromId);
  var i = unrevokedUserList.map(function(e) { return e.keyboardValue; }).indexOf(revokedUser);
  var unrevokedUserObj = unrevokedUserList[i];
  var j = acl.revokedUsers.map(function(e) { return e.id; }).indexOf(unrevokedUserObj.userId);
  acl.revokedUsers.splice(j, 1);
  updateACL();

  message = 'Access for ' + revokedUser + ' has been unrevoked.';
  opts = {
    'disable_web_page_preview': true,
    'parse_mode': 'Markdown',
    'selective': 2,
  };
  bot.sendMessage(chatId, message, opts);
  clearCache(fromId);
}

/*
 * save access control list
 */
function updateACL() {
  fs.writeFile(__dirname + '/acl.json', JSON.stringify(acl), function(err) {
    if (err) {
      throw new Error(err);
    }

    logger.info('the access control list was updated!');
  });
}

/*
 * check to see is user is authenticated
 * returns true/false
 */
function isAuthorized(userId) {
  return _.some(acl.allowedUsers, { 'id': userId });
}

/*
 * check to see is user is banned
 * returns true/false
 */
function isRevoked(userId) {
  return _.some(acl.revokedUsers, { 'id': userId });
}

function promptOwnerConfig(chatId, fromId) {
  if ((config.bot.owner || process.env.BOT_OWNER) === 0) {
    var message = ['Your User ID: ' + fromId];
    message.push('Please add your User ID to the config file field labeled \'owner\'.');
    message.push('Please restart the bot once this has been updated.');
    bot.sendMessage(chatId, message.join('\n'));
  }
}

/*
 * handle removing the custom keyboard
 */
function replyWithError(chatId, err) {
  bot.sendMessage(chatId, 'Oh no! ' + err, {
    'parse_mode': 'Markdown',
    'reply_markup': {
      'hide_keyboard': false
    }
  });
}

/*
 * clear caches
 */
function clearCache(fromId) {
  cache.del('seriesId' + fromId);
  cache.del('seriesList' + fromId);
  cache.del('seriesProfileId' + fromId);
  cache.del('seriesProfileList' + fromId);
  cache.del('seriesFolderId' + fromId);
  cache.del('seriesFolderList' + fromId);
  cache.del('seriesMonitorList' + fromId);
  cache.del('state' + fromId);
  cache.del('revokedUserName' + fromId);
  cache.del('revokeUserList' + fromId);
}

/*
 * get telegram name
 */
function getTelegramName(user) {
   return user.username || (user.first_name + (' ' + user.last_name || ''));
}
