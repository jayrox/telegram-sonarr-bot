'use strict';

var SonarrAPI = require('./lib/sonarr-api');
var TelegramBot = require('node-telegram-bot-api');
var NodeCache = require("node-cache");
var _ = require("lodash");

var config = require('./config.json');

var bot = new TelegramBot(config.telegram.botToken, {
  polling: true
});

var sonarr = new SonarrAPI({
  hostname: config.sonarr.hostname,
  apiKey: config.sonarr.apiKey,
  port: config.sonarr.port,
  urlBase: config.sonarr.urlBase,
  ssl: config.sonarr.ssl,
  username: config.sonarr.username,
  password: config.sonarr.password
});

var cache = new NodeCache();

/*
 * get the bot name
 */
bot.getMe().then(function(msg) {
  console.log('Welcome to the sonarr bot %s!', msg.username);
}).catch(function(err) {
  throw new Error(err);
});

/*
 * handle start command
 */
bot.onText(/\/start/, function(msg) {
  var chatId = msg.chat.id;
  var username = msg.from.username || msg.from.first_name;

  var response = [];

  response.push('Hello ' + username + ', use /q to search');
  response.push('\n`/q [series name]` to continue...');

  var opts = {
    "parse_mode": "Markdown",
    "selective": 2,
  };

  bot.sendMessage(chatId, response.join('\n'), opts);
});

/*
 * handle query command
 */
bot.onText(/\/[Qq](uery)? (.+)/, function(msg, match) {
  var messageId = msg.message_id;
  var chatId = msg.chat.id;
  var fromId = msg.from.id;
  var seriesName = match[2];

  sonarr.get("series/lookup", { "term": seriesName })
  .then(function(result) {
    if (!result.length) {
      throw new Error('could not find ' + seriesName + ', try searching again');
    }

    return result;
  })
  .then(function(series) {
    console.log(fromId + ' requested to search for movie ' + seriesName);
	
    var seriesList = [];
    var response = ['*Found ' + series.length + ' series:*'];

    _.forEach(series, function(n, key) {

      var id = key + 1;
      var title = n.title;
      var year = ("year" in n ? n.year : '');

      seriesList.push({
        "id": id,
        "title": n.title,
        "year": n.year,
		"tvdbId": n.tvdbId,
		"titleSlug": n.titleSlug,
		"seasons": n.seasons
      });

      response.push(
        '*' + id + '*) ' + n.title + (n.year ? ' - _' + n.year + '_' : '')
      );
    });

    response.push('\n`/s [n]` to continue...');

    // set cache
    cache.set("seriesList" + fromId, seriesList);

	// console.log(seriesList);
	
    return response.join('\n');
  })
  .then(function(response) {
    var opts = {
      "disable_web_page_preview": true,
      "parse_mode": "Markdown",
      "selective": 2,
    };
    bot.sendMessage(chatId, response, opts);
  })
  .catch(function(err) {
    bot.sendMessage(chatId, "Oh no! " + err);
  });
});

/*
 * handle series selection
 */
bot.onText(/\/[sS](eries)? ([\d]{1})/, function(msg, match) {
  var messageId = msg.message_id;
  var chatId = msg.chat.id;
  var fromId = msg.from.id;
  var seriesId = match[2];
  
  // set movie option to cache
  cache.set("seriesId" + fromId, seriesId);
  
  sonarr.get("profile")
  .then(function (result) {
    if (!result.length) {
      throw new Error("could not get profiles, try searching again");
    }
	
	if (cache.get("seriesList" + fromId) === undefined) {
      throw new Error("could not get previous series list, try searching again");
    }

    return result;
  })
  .then(function(profiles) {
    console.log(fromId + ' requested to get profiles list');

    var profileList = [];
    var response = ['*Found ' + profiles.length + ' profiles:*'];
    _.forEach(profiles, function(n, key) {
	  profileList.push({
	    "id": key + 1,
	    "name": n.name,
	    "profileId": n.id
	  });

	  response.push('*' + (key + 1) + '*) ' + n.name);
    });

    response.push('\n`/p [n]` to continue...');

    // set cache
    cache.set("seriesProfileList" + fromId, profileList);

    return response.join(' ');
  })
  .then(function(response) {
    bot.sendMessage(chatId, response, {
	  "selective": 2,
	  "parse_mode": "Markdown"
    });
  })
  .catch(function(err) {
    bot.sendMessage(chatId, "Oh no! " + err);
  });
});

/*
 * handle folder selection
 */
bot.onText(/\/[pP](rofile)? ([\d]{1})/, function(msg, match) {
  var messageId = msg.message_id;
  var chatId = msg.chat.id;
  var fromId = msg.from.id;
  var profileId = match[2];
  
  // set movie option to cache
  cache.set("seriesProfileId" + fromId, profileId);
  
  sonarr.get("rootfolder")
  .then(function (result) {
    if (!result.length) {
      throw new Error("could not get folders, try searching again");
    }
	
	if (cache.get("seriesList" + fromId) === undefined) {
      throw new Error("could not get previous series list, try searching again");
    }

    return result;
  })
  .then(function(folders) {
    console.log(fromId + ' requested to get folder list');

    var folderList = [];
    var response = ['*Found ' + folders.length + ' folders:*'];
    _.forEach(folders, function(n, key) {
	  folderList.push({
	    "id": key + 1,
	    "path": n.path,
	    "folderId": n.id
	  });

	  response.push('*' + (key + 1) + '*) ' + n.path);
    });

    response.push('\n`/f [n]` to continue...');

    // set cache
    cache.set("seriesFolderList" + fromId, folderList);

    return response.join('\n');
  })
  .then(function(response) {
    bot.sendMessage(chatId, response, {
	  "selective": 2,
	  "parse_mode": "Markdown"
    });
  })
  .catch(function(err) {
    bot.sendMessage(chatId, "Oh no! " + err);
  });
});

/*
 * handle series type selection
 */
bot.onText(/\/[fF](older)? ([\d]{1})/, function(msg, match) {
  var messageId = msg.message_id;
  var chatId = msg.chat.id;
  var fromId = msg.from.id;
  
  var folderId = match[2];
  var folderList = cache.get("seriesFolderList" + fromId);
  
  var profileId = cache.get("seriesProfileId" + fromId);
  var profileList = cache.get("seriesProfileList" + fromId);
  
  var seriesId = cache.get("seriesId" + fromId);
  var seriesList = cache.get("seriesList" + fromId);

  if (folderList === undefined || profileList === undefined || seriesList === undefined) {
    bot.sendMessage(chatId, 'Oh no! Error: something went wrong, try searching again');
  }
  
  var series = _.filter(seriesList, function(item) {
    return item.id == seriesId;
  })[0];

  var profile = _.filter(profileList, function(item) {
    return item.id == profileId;
  })[0];

  var folder = _.filter(folderList, function(item) {
    return item.id == folderId;
  })[0];

  sonarr.post("series", {
    "tvdbId": series.tvdbId,
	"title": series.title,
	"titleSlug": series.titleSlug,
	"seasons": series.seasons,
	"rootFolderPath": folder.path,
	"seasonFolder": true,
	"monitored": false,
	"seriesType": "standard",
	"qualityProfileId": profile.profileId
	
  })
  .then(function(result) {

    console.log(fromId + ' added series ' + series.title);

    if (!result) {
      throw new Error("could not add series, try searching again.");
    }

    bot.sendMessage(chatId, 'Series `' + series.title + '` added', {
      "selective": 2,
      "parse_mode": "Markdown"
    });
  })
  .catch(function(err) {
    bot.sendMessage(chatId, "Oh no! " + err);
  })
  .finally(function() {

    // delete cache items
    cache.del("seriesFolderList" + fromId);
	
    cache.del("seriesProfileId" + fromId);
    cache.del("seriesProfileList" + fromId);
	
    cache.del("seriesId" + fromId);
    cache.del("seriesList" + fromId);	
  });
  
});