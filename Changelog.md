## Changelog

### v0.1.9
- Fixed issue with keyboard not clearing when issuing `/clear` command
- Create ACL file when it doesn't exist, you will be told to restart the bot if it doesn't exist
- renamed function saveACL to updateACL
- created createACL function
- Added more logging
- More linter fixes
- More housekeeping

### v0.1.8
- Added basic auth to the bot, thanks @jayrox
- Added basic logging (please rerun `npm install`)
- More housekeeping

### v0.1.7
- Added custom keyboard, thanks @jayrox

### v0.1.6
- `/q` now responds with link to series on thetvdb.com

### v0.1.5
- Added command `/clear` to wipe all previous commands chain
- More housekeeping

### v0.1.4
- Sonarr lib is now on npm (you will need to run npm install if you are upgrading)
- Updated a few dev things

### v0.1.3
- Initial monitoring support, please report bugs if found...

### v0.1.2
- Added Docker support

### v0.1.1
- Added RSS Sync command `/rss`
- Added Refresh All Series command `/refresh`

### v0.1.0
- Initial release
