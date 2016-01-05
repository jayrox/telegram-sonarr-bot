# telegram-sonarr-bot

Bot which lets you or others add series to [Sonarr](https://sonarr.tv/) via the messaging service [Telegram](https://telegram.org/).

Contact [@BotFather](http://telegram.me/BotFather) on Telegram to create and get a bot token.

Getting Started
---------------

## Prerequisites
- [Node.js](http://nodejs.org)
- [Git](https://git-scm.com/downloads) (optional)

## Installation

```bash
# Clone the repository
git clone https://github.com/onedr0p/telegram-sonarr-bot
```

```bash
# Install dependencies
cd telegram-sonarr-bot
npm install
```

```bash
# Copy acl.json.template to acl.json
cp acl.json.template acl.json
```

```bash
# Copy config.json.template to config.json
cp config.json.template config.json
```

In `config.json` fill in the values below:

Telegram:
- **botToken** your Telegram Bot token

Bot:
- **password** the password to access the bot
- **owner** your Telegram user ID. (you can fill this in later)

Sonarr:
- **hostname**: hostname where Sonarr runs (required)
- **apiKey**: Your API to access Sonarr (required)
- **port**: port number Sonarr is listening on (optional, default: 5050)
- **urlBase**: URL Base of Sonarr (optional, default: empty)
- **ssl**: Set to true if you are connecting via SSL (default: false)
- **username**: HTTP Auth username (default: empty)
- **password**: HTTP Auth password (default: empty)

**Important note**: Restart the bot after making any changes to the `config.json` file.

```bash
# Start the bot
node sonarr.js
```

## Usage (commands)

### First use
Send the bot the `/auth` command with the password you created in `config.json`

### Adding a series

Send the bot a message with the series name

`/q game of`

The bot will reply with

```
Found 6 series:
1) Game of Crowns - 2014
2) Game of Thrones - 2011
3) Game of Silence
4) Game of Silence (TR) - 2012
5) The Genius Game - 2013
6) More Than A Game - The Story of Football

Please select from the menu below.
```

The bot will ask you for the quality

```
Found 2 profiles:
1) SD 2) HD

Please select from the menu below.
```

The bot will ask you where the path you want the series to go

```
Found 2 folders:
1) /Television/Airing/
2) /Television/Archived/

Please select from the menu below.
```

Lastly, the bot will ask you which seasons you would like to monitor/download

```
Select which seasons to monitor:
1) future
2) all
3) none
4) latest
5) first

Please select from the menu below.
```

If everything goes well, you'll see a text from the bot saying the series was added.

### Additional commands
* `/clear` clear all previous commands and cache

### Admin commands
* `/rss` perform an RSS Sync
* `/refresh` refreshes all series
* `/users` list users
* `/revoke` ban user from bot
* `/unrevoke` unban user from bot

## Docker
Alternatively you may use Docker to start the bot
```
docker run --name telegram-sonarr-bot \
  -e TELEGRAM_BOTTOKEN=
  -e BOT_PASSWORD=
  -e BOT_OWNER=
  -e SONARR_HOST=
  -e SONARR_APIKEY=
  -e SONARR_PORT=
  -e SONARR_URLBASE=
  -e SONARR_SSL=
  -e SONARR_USERNAME=
  -e SONARR_PASSWORD=
  telegram-sonarr-bot
```

**Prebuilt** Docker image for this bot can be found [here](https://hub.docker.com/r/subzero79/docker-telegram-sonarr-bot), thanks [@subzero79](https://github.com/subzero79)

## License
(The MIT License)

Copyright (c) 2015 Devin Buhl <devin.kray@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
