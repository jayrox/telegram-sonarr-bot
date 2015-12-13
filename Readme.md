# telegram-sonarr-bot

Bot which lets you or others add series to [Sonarr](https://sonarr.tv/) via the messaging service [Telegram](https://telegram.org/).

Contact [@BotFather](http://telegram.me/BotFather) on Telegram to create and get a bot token.

For now, please make your bot username something unique. For example @fred-flintstone-sonarr-bot or something...

Getting Started
---------------

### Prerequisites
- [Node.js](http://nodejs.org)
- [Git](https://git-scm.com/downloads) (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/onedr0p/telegram-sonarr-bot
```

```bash
# Install dependencies
cd telegram-sonarr-bot
npm install
```

Then copy `config.json.template` to `config.json` and fill in the values.

Please refer to the Sonarr specific configuration below:

- **hostname**: hostname where Sonarr runs (required)
- **apiKey**: Your API to access Sonarr (required)
- **port**: port number Sonarr is listening on (optional, default: 5050)
- **urlBase**: URL Base of Sonarr (optional, default: empty)
- **ssl**: Set to true if you are connecting via SSL (default: false)
- **username**: HTTP Auth username (default: empty)
- **password**: HTTP Auth password (default: empty)

```bash
# Start the bot
node sonarr.js
```

### Usage

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

/s [n] to continue...
```

Send the number of the series you want with the /s flag

```
/s 2
```

The bot will ask you for the quality

```
Found 2 profiles:
1) SD 2) HD

/p [n] to continue...
```

Send the number of the profile

```
/p 2
```

Lastly, the bot will ask you where the path you want the series to go

```
Found 2 folders:
1) /Television/Airing/
2) /Television/Archived/

/f [n] to continue...
```

Send the number of the folder

```
/f 1
```

If everything goes well, you'll see a text from the bot saying the series was added.

### Changelog

#### v0.1.1
- Added RSS Sync command `/rss`
- Added Refresh All Series command `/refresh`

#### v0.1.0
- Initial release

### License
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
