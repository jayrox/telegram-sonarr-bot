'use strict';

var SonarrAPI = require('sonarr-api');
var TelegramBot = require('node-telegram-bot-api');
var NodeCache = require('node-cache');
var _ = require('lodash');

try {
  var config = require('./config.json');
} catch (e) {
  var config = {};
  config.telegram = {};
  config.sonarr = {};
}

var bot = new TelegramBot(process.env.TELEGRAM_BOTTOKEN || config.telegram.botToken, {
  polling: true
});

var sonarr = new SonarrAPI({
  hostname: process.env.SONARR_HOST || config.sonarr.hostname,
  apiKey: process.env.SONARR_APIKEY || config.sonarr.apiKey,
  port: process.env.SONARR_PORT || config.sonarr.port || 8989,
  urlBase: process.env.SONARR_URLBASE || config.sonarr.urlBase,
  ssl: process.env.SONARR_SSL || config.sonarr.ssl,
  username: process.env.SONARR_USERNAME || config.sonarr.username,
  password: process.env.SONARR_PASSWORD || config.sonarr.password
});

var cache = new NodeCache();

/*
 * get the bot name
 */
bot.getMe()
  .then(function(msg) {
    console.log('Welcome to the sonarr bot %s!', msg.username);
  })
  .catch(function(err) {
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

  sonarr.get('series/lookup', { 'term': seriesName })
    .then(function(result) {
      if (!result.length) {
        throw new Error('could not find ' + seriesName + ', try searching again');
      }

      return result;
    })
    .then(function(series) {
      console.log(fromId + ' requested to search for series ' + seriesName);

      var seriesList = [];
      var keyboardList = [];
      var response = ['*Found ' + series.length + ' series:*'];

      _.forEach(series, function(n, key) {

        var id = key + 1;
        var keyboard_value = n.title + (n.year ? ' - ' + n.year : '');
        

        seriesList.push({
          'id': id,
          'title': n.title,
          'year': n.year,
          'tvdbId': n.tvdbId,
          'titleSlug': n.titleSlug,
          'seasons': n.seasons,
          'keyboard_value': keyboard_value
        });
        
        keyboardList.push([keyboard_value])
        
        response.push(
          '*' + id + '*) ' +
          '[' + n.title + '](http://thetvdb.com/?tab=series&id=' + n.tvdbId + ')' +
          (n.year ? ' - _' + n.year + '_' : '')
        );
      });

      response.push('\nPlease select from the menu below...');

      // set cache
      cache.set("seriesList" + fromId, seriesList);
      cache.set('state' + fromId, state.SERIES);

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
      bot.sendMessage(chatId, 'Oh no! ' + err);
    });
});



/*
 * handle rss sync
 */
bot.onText(/\/rss/, function(msg) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;

  sonarr.post('command', { 'name': 'RssSync' })
    .then(function() {
      console.log(fromId + ' sent command for rss sync');
      bot.sendMessage(chatId, 'RSS Sync command sent.');
    })
    .catch(function(err) {
      bot.sendMessage(chatId, 'Oh no! ' + err);
    });
});

/*
 * handle refresh series
 */
bot.onText(/\/refresh/, function(msg) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;

  sonarr.post('command', { 'name': 'RefreshSeries' })
    .then(function() {
      console.log(fromId + ' sent command for refresh series');
      bot.sendMessage(chatId, 'Refresh series command sent.');
    })
    .catch(function(err) {
      bot.sendMessage(chatId, 'Oh no! ' + err);
    });
});

/*
 * handle clear command
 */
bot.onText(/\/clear/, function(msg) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;

  cache.del('seriesId' + fromId);
  cache.del('seriesList' + fromId);
  cache.del('seriesProfileId' + fromId);
  cache.del('seriesProfileList' + fromId);
  cache.del('seriesFolderId' + fromId);
  cache.del('seriesFolderList' + fromId);
  cache.del('seriesMonitorList' + fromId);

  bot.sendMessage(chatId, 'All previously sent commands have been cleared, yey!');
});

/*
 * Shared err message logic, primarily to handle removing the custom keyboard
 */
function replyWithError(chatId, err) {
  bot.sendMessage(chatId, 'Oh no! ' + err, {
    'parse_mode': 'Markdown',
    'reply_markup': {
      'hide_keyboard': false
    }
  });
}

class Response {
    constructor(message, keyboard) {
      this.message = message;
      this.keyboard = keyboard;
    }
}

var state = {
  SERIES: 1,
  PROFILE: 2,
  FOLDER: 3,
  MONITOR: 4
};

/*
 Captures any and all messages, filters out commands, handles profiles and movies
 sent via the custom keyboard.
 */
bot.on('message', function(msg) {
  var chatId = msg.chat.id;
  var fromId = msg.from.id;
  // If the message is a command, ignore it.
  
  var currentState = cache.get('state' + fromId);
  if(msg.text[0] != '/' || (currentState == state.FOLDER && msg.text[0] == '/')) {
    // Check cache to determine state, if cache empty prompt user to start a movie search
    if (currentState === undefined) {
      replyWithError(chatId, new Error('Try searching for a movie first with `/m movie name`'));
    } else {
      console.log("currentstate: " + currentState)
      switch(currentState) {
        case state.SERIES:
          var seriesDisplayName = msg.text;
          handleSeries(chatId, fromId, seriesDisplayName);
          break;  
        case state.PROFILE:
          var seriesProfileName = msg.text;
          handleSeriesProfile(chatId, fromId, seriesProfileName);
          break;  
        case state.FOLDER:
          var seriesFolderName = msg.text;
          console.log("seriesFolderName: " + seriesFolderName)
          handleSeriesFolder(chatId, fromId, seriesFolderName);
          break;
        case state.MONITOR:
          var seriesMonitor = msg.text;
          console.log("seriesmonitor: " + seriesMonitor)
          handleSeriesMonitor(chatId, fromId, seriesMonitor);
          break;            
        default:
          replyWithError(chatId, new Error('Unsure what\'s going on, use the `/clear` command and start over.'));
      }
    }
  }
});

function handleSeries(chatId, fromId, seriesDisplayName) {
  var seriesList = cache.get('seriesList'+fromId);
  if (seriesList === undefined) {
    replyWithError(chatId, new Error('something went wrong, try searching again'));
  }
  var series = _.filter(seriesList, function(item) {
    return item.keyboard_value == seriesDisplayName;
  })[0];
  if(series === undefined){
    replyWithError(chatId, new Error('Could not find the series with title "' + seriesDisplayName + '"'));
  }
  
  var seriesId = series.id;
  
  cache.set('seriesId'+fromId, seriesId);
  
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
    var keyboardList = [];
    var keyboardRow = [];

    var response = ['*Found ' + profiles.length + ' profiles:*'];
    _.forEach(profiles, function(n, key) {
	  profileList.push({
	    "id": key + 1,
	    "name": n.name,
        "label": n.name,
	    "profileId": n.id
	  });

      response.push('*' + (key + 1) + '*) ' + n.name);

      // Profile names are short, put two on each custom
      // keyboard row to reduce scrolling
      keyboardRow.push(n.name);
      if (keyboardRow.length == 2) {
        keyboardList.push(keyboardRow);
        keyboardRow = [];
      }
    });
      
    if (keyboardRow.length == 1) {
      keyboardList.push([keyboardRow[0]])
    }
    response.push('\nPlease select from the menu below.');

    // set cache
    cache.set("seriesProfileList" + fromId, profileList);
    cache.set('state' + fromId, state.PROFILE);

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
    bot.sendMessage(chatId, "Oh no! " + err);
  });
}

function handleSeriesProfile(chatId, fromId, profileName) {
  var profileList = cache.get('seriesProfileList' + fromId);
  if (profileList === undefined) {
    replyWithError(chatId, new Error('Error: something went wrong, try searching again'));
  }

  var profile = _.filter(profileList, function(item) {
    return item.label == profileName;
  })[0];
  if(profile === undefined){
    replyWithError(chatId, new Error('Could not find the profile "' + profileName + '"'));
  }

  var profileId = profile.id;
  
  // set series option to cache
  cache.set("seriesProfileId" + fromId, profileId);
  
  sonarr.get("rootfolder")
  .then(function (result) {
    if (!result.length) {
      throw new Error("could not get folders, try searching again");
    }
    if (cache.get("seriesList" + fromId) === undefined) {
      throw new Error("could not get previous list, try searching again");
    }
    return result;
  })
  .then(function(folders) {
    console.log(fromId + ' requested to get folder list');

    var folderList = [];
    var keyboardList = [];
    var response = ['*Found ' + folders.length + ' folders:*'];
    _.forEach(folders, function(n, key) {
	  folderList.push({
	    "id": key + 1,
	    "path": n.path,
	    "folderId": n.id
	  });

	  response.push('*' + (key + 1) + '*) ' + n.path);
      
      keyboardList.push([n.path])
    });
    response.push('\nPlease select from the menu below.');
    
    // set cache
    cache.set("seriesFolderList" + fromId, folderList);
    cache.set('state' + fromId, state.FOLDER);

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
    bot.sendMessage(chatId, "Oh no! " + err);
  });
}

function handleSeriesFolder(chatId, fromId, folderName) {
  var seriesId = cache.get('seriesId' + fromId);
  var seriesList = cache.get('seriesList' + fromId);
  var folderList = cache.get("seriesFolderList" + fromId);
  if (seriesList === undefined || seriesId === undefined || folderList === undefined) {
    replyWithError(chatId, new Error('Error: something went wrong, try searching again'));
  }

  var folder = _.filter(folderList, function(item) {
    return item.path == folderName;
  })[0];
  
  // set movie option to cache
  cache.set('seriesFolderId' + fromId, folder.folderId);
  console.log("hSF: " + folder.folderId)
  console.log(folder)

  console.log(fromId + ' requested to get monitor list');

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
    keyboardList.push([keyboardRow[0]])
  }

  response.push('\nPlease select from the menu below.');

  // set cache
  cache.set('seriesMonitorList' + fromId, monitorList);
  cache.set('state' + fromId, state.MONITOR);

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
    bot.sendMessage(chatId, 'Oh no! Something went wrong, try searching again');
  }
  
  console.log("seriesListLen: " + seriesList.length)
  console.log("profileListLen: " + profileList.length)
  console.log("folderListLen: " + folderList.length)
  console.log("monitorListLen: " + monitorList.length)
    
  var series = _.filter(seriesList, function(item) {
    return item.id == seriesId;
  })[0];

  console.log("series:")
  console.log(series)

  var profile = _.filter(profileList, function(item) {
    return item.id == profileId;
  })[0];

  console.log("profile")
  console.log(profile)

  var folder = _.filter(folderList, function(item) {
    return item.folderId == folderId;
  })[0];
  
  console.log("folderId: " + folderId)
  console.log("folderList")
  console.log(folderList)

  console.log("folder")
  console.log(folder)

  var monitor = _.filter(monitorList, function(item) {
    return item.type == monitorType;
  })[0];
  
  console.log("monitor")
  console.log(monitor)
  
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
    
  sonarr.post("series", {
    "tvdbId": series.tvdbId,
	 "title": series.title,
	 "titleSlug": series.titleSlug,
	 "seasons": series.seasons,
	 "rootFolderPath": folder.path,
	 "seasonFolder": true,
	 "monitored": false,
	 "seriesType": "standard",
	 "qualityProfileId": profileId
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
    cache.del('seriesId' + fromId);
    cache.del('seriesList' + fromId);
    cache.del('seriesProfileId' + fromId);
    cache.del('seriesProfileList' + fromId);
    cache.del('seriesFolderId' + fromId);
    cache.del('seriesFolderList' + fromId);
    cache.del('seriesMonitorList' + fromId);	
  });
}
