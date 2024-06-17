# Overview

This module is a companion to the [ConfSync](https://github.com/jhuckaby/confsync) configuration management system.  ConfSync Satellite is the file installer, which should be installed on all your servers.  It pings S3 for configuration changes every minute (or on a schedule you set), and is activated by [cron](https://en.wikipedia.org/wiki/Cron).  It is shipped as a precompiled binary and thus has no dependencies.

# Installation

The easiest way to install ConfSync Satellite is to use one of our precompiled binaries.  It can live anywhere on the filesystem, but the auto-installer will place it into the `/opt/confsync` directory.  Make sure you are `root` (superuser) to install this:

```sh
curl -s https://raw.githubusercontent.com/jhuckaby/confsync-satellite/main/install.sh | bash
```

This will auto-detect your operating system and system architecture, and download and install the appropriate static binary for your server.  The install script also adds ConfSync Satellite to [cron](https://en.wikipedia.org/wiki/Cron), specifically in `/etc/cron.d/confsync-satellite.cron`, which is set to run once per minute.  It also creates a sample configuration file, if one doesn't exist.

See below for details about the configuration file, but here is a quick command to set all the common properties:

```sh
/opt/confsync/satellite.bin config --Storage.AWS.region us-west-1 --Storage.AWS.credentials.accessKeyId YOUR_ACCESS_KEY --Storage.AWS.credentials.secretAccessKey YOUR_SECRET_KEY --Storage.S3.params.Bucket YOUR_S3_BUCKET --Storage.S3.keyPrefix YOUR_S3_PREFIX
```

**Note:** If you would rather download the binary file manually and install it to a location of your choice, expand this section for details:

<details><summary>Manual Installation</summary>

```sh
mkdir /opt/confsync
curl -L -o /opt/confsync/satellite.bin https://github.com/jhuckaby/confsync-satellite/releases/latest/download/confsync-satellite-linux-x64
chmod 755 /opt/confsync/satellite.bin
/opt/confsync/satellite.bin --install
```

Note that in this case you will have to select the correct binary for your platform.  The static binary flavors available are:

- `confsync-satellite-linux-arm64`
- `confsync-satellite-linux-x64`
- `confsync-satellite-macos-arm64`
- `confsync-satellite-macos-x64`

The `confsync-satellite-linux-x86` binary should work on any 64-bit Linux OS on x86 hardware, including RedHat/CentOS and Debian/Ubuntu.  Change `x86` to `arm64` if you are running Linux on ARM (e.g. Raspberry Pi).  If you are installing on macOS, replace `linux` with `macos`, but note your Mac's architecture (`x64` or `arm64` a.k.a. Apple Silicon).

</details>

# Configuration

ConfSync Satellite expects a JSON formatted configuration file to live in the same directory as the binary executable, and named `config.json`.  This sample one will be installed for you on first run, if the file doesn't exist:

```json
{
	"enabled": true,
	"threads": 1,
	"scatter": 5,
	"web_hook": "",
	"allow_shell_exec": false,
	"temp_dir": "/var/run",
	"log_dir": "/var/log",
	"log_filename": "confsync-satellite.log",
	"log_columns": ["hires_epoch", "date", "hostname", "pid", "component", "category", "code", "msg", "data"],
	"debug_level": 9,
	"upload_errors": true,
	"upload_receipts": true,
	"receipt_uptime_grace_sec": 360,
	"Storage": {
		"engine": "S3",
		"AWS": {
			"region": "us-west-1",
			"credentials": {
				"accessKeyId": "YOUR_AMAZON_ACCESS_KEY",
				"secretAccessKey": "YOUR_AMAZON_SECRET_KEY"
			},
			"connectTimeout": 5000,
			"socketTimeout": 5000,
			"maxAttempts": 50
		},
		"S3": {
			"keyPrefix": "YOUR_S3_KEY_PREFIX",
			"fileExtensions": true,
			"params": {
				"Bucket": "YOUR_S3_BUCKET_ID"
			}
		}
	}
}
```

See below for details about all the configuration properties.

## enabled

This boolean enables or disables ConfSync Satellite.  Set this to `false` to pause operations.  The default is `true` (enabled).

## threads

This is the number of threads to use when processing files to be installed.  It can be useful if you have a large amount of config files, and want to speed up installs.  The default is 1 thread.

## scatter

The `scatter` property sets the maximum number of seconds to random-sleep on startup.  This allows your servers to run Satellite at slightly different times, avoiding potential S3 "Slow Down" errors.  The default is 5 seconds.

## web_hook

ConfSync Satellite can fire off a web hook for all file installations.  This web hook is different than the ones configured in [ConfSync Web Hooks](https://github.com/jhuckaby/confsync#web-hooks), as this runs on **all** of your servers.  For example, if you have 50 servers and push a config file revision, ConfSync Satellite's web hook will be fired 50 times at once.

To use the feature, place a URL into the `web_hook` configuration property.  Example:

```js
"web_hook": "https://myserver.com/myscript.php"
```

The request itself will be a `HTTP POST`, and the payload will be a JSON document that describes the file that was just installed or updated.  Example request body (pretty-printed):

```json
{
	"title": "My Great App",
	"id": "myapp",
	"username": "jhuckaby",
	"path": "/opt/myapp/conf/config.json",
	"web_hook": "http://localhost:3000/api/config/reload",
	"modified": 1697049843.871,
	"created": 1696441493.515,
	"live": {
		"dev": {
			"rev": "r5",
			"start": 1696993875.524,
			"duration": 600
		},
		"prod": {
			"rev": "r5",
			"start": 1696993875.524,
			"duration": 600
		}
	},
	"mode": "600",
	"uid": "root",
	"rev": "r5"
}
```

The `User-Agent` header for these requests will be set to `ConfSync Satellite v#.#.#` (where `#.#.#` will be `1.0.0` or higher).

## allow_shell_exec

By default, ConfSync does not allow arbitrary shell commands to be executed when your config files are installed.  This is a security measure, because if a hacker gained access to your S3 bucket, they could literally insert custom commands which would be executed on all your servers.  They could install malware, or delete all your files.

Now, if you accept these risks, and you are absolutely sure that your S3 bucket is fully locked down and private, then you can set the `allow_shell_exec` property to `true`.  This will allow ConfSync to attach shell commands to specific config file installations, so they can do things like notify your app that it needs to reload.

For more details, see [ConfSync Shell Exec](https://github.com/jhuckaby/confsync#shell-exec).

## temp_dir

This is the directory on disk where ConfSync Satellite will keep its local state (just a JSON file), and a PID file.  It defaults to `/var/run`, which is present on all Linux and macOS flavors.

## log_dir

This is the directory on disk where ConfSync Satellite will keep its one log file.  It defaults to `/var/log`, which s present on all Linux and macOS flavors.  Note that the log will automatically be rotated and archived daily.  See [Logging](#logging) below for details.

## log_filename

This is the log filename that ConfSync Satellite will use.  It defaults to `confsync-satellite.log`.  See [Logging](#logging) below for details.

## log_columns

These are the log columns that ConfSync Satellite will include in its log file.  See [Logging](#logging) below for details.

## debug_level

This is the logging level for debug messages.  `1` is the quietest, and `9` is the loudest.  See [Logging](#logging) below for details.

## upload_errors

Set this to `true` to have ConfSync Satellite automatically upload all errors to a unique S3 key.  The S3 file will be in an `errors/` subdirectory, and be named using the server's hostname.  Using this you can quickly see if any of your servers encountered errors installing your files.  It defaults to `true`.

## upload_receipts

Set this to `true` to have ConfSync Satellite automatically upload a "receipt" for each file installation or upgrade.  The receipt is a small JSON document that lives in a special location in S3.  The idea is that ConfSync can display a deployment's progress, or show proof that a file revision was successfully deployed to all servers.  It defaults to `true`.

The receipt files will live in the following S3 location: `receipts/FILE_ID/REVISION/HOSTNAME-TIMESTAMP.json`.  The contents are the same as the [web hook payloads](#web_hook).

## receipt_uptime_grace_sec

To reduce noise in autoscale or edge environments, the uploading of receipt files is skipped unless the server's uptime is beyond a threshold, the default being 6 minutes.  This prevents noise by new servers coming online and performing their first sync.  Adjust this to your liking, or set it to `0` to disable the grace period, and upload all receipts regardless.

## fatal

When this property us `true` (which is the default) ConfSync Satellite will emit all errors to STDERR, and exit with a non-zero exit code if any errors occurred.  This is a great way to capture a "failure state" during a critical run such as a bootstrap init startup routine (e.g. as part of autoscale cloud init).

## Storage

The `Storage` section in the config file is shared with [ConfSync](https://github.com/jhuckaby/confsync), and the values **must** be consistent between the two.  Meaning, however you configured ConfSync for AWS / S3, you should configure these properties in ConfSync Satellite with the same values:

| Property Path | Type | Description |
|---------------|------|-------------|
| `Storage.engine` | String | The storage engine to use.  This should be set to `S3`.  Support for other engines may be added in the future. |
| `Storage.AWS.region` | String | The AWS region where your S3 bucket lives, e.g. `us-west-1`. |
| `Storage.AWS.credentials.accessKeyId` | String | Your AWS access account key ID.  You can omit this if you have AWS authentication handled elsewhere (IAM, EC2, etc.). |
| `Storage.AWS.credentials.secretAccessKey` | String | Your AWS account secret key.  You can omit this if you have AWS authentication handled elsewhere (IAM, EC2, etc.). |
| `Storage.AWS.connectTimeout` | Number | The timeout for connecting to S3, in milliseconds. |
| `Storage.AWS.socketTimeout` | Number | The idle socket timeout for communicating with S3, in milliseconds. |
| `Storage.AWS.maxAttempts` | Number | The number of retry attempts to make for failed S3 operations (includes exponential backoff). |
| `Storage.S3.keyPrefix` | String | Optionally prefix all the S3 keys with a directory, such as `confsync/`.  Useful when pointing to a shared S3 bucket. |
| `Storage.S3.fileExtensions` | Boolean | Add a `.json` extension onto all S3 keys.  It is highly recommended that you leave this enabled, as it allows your S3 bucket to be backed up / replicated more easily.  See [S3 File Extensions](https://github.com/jhuckaby/pixl-server-storage#s3-file-extensions) for details. |
| `Storage.S3.params.Bucket` | String | Your AWS S3 bucket name.  Make sure the region matches! |

## Environment Variables

ConfSync Satellite can also be configured via environment variables.  These can be declared in your shell environment where Satellite runs (i.e. `/etc/environment`), or you can include a [dotenv](https://www.npmjs.com/package/dotenv) (`.env`) file in the same directory as the binary executable (i.e. `/opt/confsync/.env`).  Either way, the variable name syntax is `CONFSYNC_key` where `key` is a JSON configuration property path.

For overriding configuration properties via environment variable, you can specify any top-level JSON key from `config.json`, or a *path* to a nested property using double-underscore (`__`) as a path separator.  For boolean properties, you can specify `1` for true and `0` for false.  Here is an example of some env vars:

```
CONFSYNC_debug_level=9
CONFSYNC_Storage__AWS__region="us-west-1"
CONFSYNC_Storage__AWS__credentials__accessKeyId="YOUR_AWS_ACCESS_KEY_HERE"
CONFSYNC_Storage__AWS__credentials__secretAccessKey="YOUR_AWS_SECRET_KEY_HERE"
CONFSYNC_Storage__S3__keyPrefix="YOUR_S3_KEY_PREFIX_HERE"
CONFSYNC_Storage__S3__params__Bucket="YOUR_S3_BUCKET_HERE"
```

Almost every configuration property can be overridden using this environment variable syntax.  The only exceptions are things like arrays, e.g. `log_columns`.

## Command-Line Arguments

The ConfSync Satellite binary typically runs headless (via cron), but it also accepts the following command-line arguments:

| Argument | Description |
|----------|-------------|
| `--install` | This runs first-time installation tasks such as creating the cron job and a sample configuration file. |
| `--uninstall` | This deletes everything including the binary executable file. |
| `--config` | Optionally set custom configuration properties using dot path notation. |
| `--debug` | Setting this flag runs Satellite in debug mode, causing it to emit the log to the console. |
| `--quiet` | This silences all output from Satellite. |
| `--fatal` | This will cause all errors to emit to STDERR (even with `--quiet`), and the process will exit with a non-zero code. |
| `--refresh` | This will cause Satellite to re-download and re-install all config files. |

# Logging

ConfSync Satellite keeps its own log file, which contains all errors, transactions and debug messages.  By default, this log file is created in the `/var/log` directory, and is named `confsync-satellite.log`.  Here is an example log snippet:

```
[1697822051.832][2023-10-20 10:14:11][myserver01][19647][Satellite][debug][5][ConfSync Satellite starting run][{"pkg":true,"uid":0,"gid":0,"pid":19647,"ppid":11044,"node":"v18.5.0","arch":"x64","platform":"linux","argv":["/opt/confsync/satellite","/snapshot/jhuckaby/git/confsync-satellite/satellite.js","--debug"],"execArgv":[],"host_id":2669704495}]
[1697822051.834][2023-10-20 10:14:11][myserver01][19647][Storage][debug][5][Setting up storage system v3.1.17][]
[1697822052.339][2023-10-20 10:14:12][myserver01][19647][S3][debug][5][Setting up Amazon S3 (us-west-1)][]
[1697822052.339][2023-10-20 10:14:12][myserver01][19647][S3][debug][6][S3 Bucket ID: jhuckaby-test][]
[1697822052.463][2023-10-20 10:14:12][myserver01][19647][Satellite][debug][5][Serial has changed, performing full sync][{"old":"b96556f09824212b8a51b3d7aeb79dca6f2c0e028de81e3bf9fc82702e071e65","new":"fb4cd927cc0091336614fc26ba38f1b94bea27be7b0315cf5aa58a4fef750f31"}]
[1697822052.485][2023-10-20 10:14:12][myserver01][19647][Satellite][debug][8][Server matched groups: prod][]
[1697822052.486][2023-10-20 10:14:12][myserver01][19647][Satellite][debug][7][File revision has changed (r6 --> r7)][{"title":"Game Config","path":"/opt/game/conf.json","id":"game","username":"jhuckaby","modified":1697822035.073,"created":1695695900.54,"live":{"prod":{"rev":"r7","start":1697822035.073,"duration":0},"dev":{"rev":"r4","start":1696045693.918,"duration":0}},"mode":"400","uid":"games","gid":"apache","counter":7}]
[1697822052.522][2023-10-20 10:14:12][myserver01][19647][Satellite][debug][5][Installing new file revision: game: r7][{"title":"Game Config","path":"/opt/game/conf.json","id":"game","username":"jhuckaby","modified":1697822035.073,"created":1695695900.54,"live":{"prod":{"rev":"r7","start":1697822035.073,"duration":0},"dev":{"rev":"r4","start":1696045693.918,"duration":0}},"mode":"400","uid":"games","gid":"apache","counter":7,"rev":"r7"}]
[1697822052.538][2023-10-20 10:14:12][myserver01][19647][Satellite][transaction][file_write][/opt/game/conf.json][{"title":"Game Config","path":"/opt/game/conf.json","id":"game","username":"jhuckaby","modified":1697822035.073,"created":1695695900.54,"live":{"prod":{"rev":"r7","start":1697822035.073,"duration":0},"dev":{"rev":"r4","start":1696045693.918,"duration":0}},"mode":"400","uid":12,"gid":48,"counter":7,"rev":"r7"}]
[1697822053.559][2023-10-20 10:14:13][myserver01][19647][Satellite][debug][5][Sync complete, exiting][]
```

The top-level `debug_level` property in your `config.json` controls how verbose the debug log entries are.  A `debug_level` level of `1` is the most quiet, and only contains transactions and errors.  A level of `5` is a fair bit louder, and level `9` is the loudest.  Use these higher levels for troubleshooting issues.

A "transaction" will be logged for every file install, regardless of the debug level.  here is an example:

```
[1697822052.538][2023-10-20 10:14:12][myserver01][19647][Satellite][transaction][file_write][/opt/game/conf.json][{"title":"Game Config","path":"/opt/game/conf.json","id":"game","username":"jhuckaby","modified":1697822035.073,"created":1695695900.54,"live":{"prod":{"rev":"r7","start":1697822035.073,"duration":0},"dev":{"rev":"r4","start":1696045693.918,"duration":0}},"mode":"400","uid":12,"gid":48,"counter":7,"rev":"r7"}]
```

You can customize the location and filename of the log file by including top-level `log_dir` and `log_filename` properties in your `config.json` file.

You can also optionally customize the log "columns" that are written out.  By default, the following columns are written for each row:

| Log Column | Description |
|------------|-------------|
| `hires_epoch` | This is a high-resolution [Epoch timestamp](https://en.wikipedia.org/wiki/Unix_time). |
| `date` | This is a human-readable date/time stamp in the format: `YYYY-MM-DD HH:MI:SS` (in the local server timezone). |
| `hostname` | This is the hostname of the server running ConfSync Satellite. |
| `pid` | This is the Process ID (PID) of the ConfSync Satellite process running on the server. |
| `component` | This is the name of the current component, or simply `Satellite` for generic messages. |
| `code` | This is the error code, transaction code, or debug log level of the message, from `1` to `9`. |
| `msg` | This is the log message text itself. |
| `data` | Any additional data that accompanies the message will be in this column, in JSON format. |

To customize the log columns, include a top-level `log_columns` property in your `config.json` file, and set it to an array of strings, where each string specifies the column.  Example:

```json
"log_columns": ["hires_epoch", "date", "hostname", "pid", "component", "code", "msg", "data"]
```

The log files are automatically rotated daily, and compressed archives kept for 7 days.  This is automatically configured via the [logrotate](https://linux.die.net/man/8/logrotate) system on Linux.  See the `/etc/logrotate.d/confsync-satellite` file.

# Upgrading

To upgrade ConfSync Satellite, simply re-run the initial auto-install command:

```sh
curl -s https://raw.githubusercontent.com/jhuckaby/confsync-satellite/main/install.sh | bash
```

This will download and install the latest version while preserving your existing configuration file.

If you installed ConfSync Satellite manually, just re-download the static binary and replace the old one with it.

# Development

You can install the ConfSync Satellite source code by using [Git](https://en.wikipedia.org/wiki/Git) ([Node.js](https://nodejs.org/) is also required):

```sh
git clone https://github.com/jhuckaby/confsync-satellite.git
cd confsync-satellite
npm install
```

You can then run it in debug mode by issuing this command:

```sh
node satellite.js --debug
```

To repackage the binary executables for Linux and macOS, run this command:

```sh
npm run package
```

# License (MIT)

**The MIT License**

*Copyright (c) 2023 Joseph Huckaby.*

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
