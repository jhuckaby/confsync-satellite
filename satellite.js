#!/usr/bin/env node

// ConfSync Satellite
// Automatically deploys config files from S3
// Installs itself via crontab to run every minute
// See: https://github.com/jhuckaby/confsync
// Copyright (c) 2023 Joseph Huckaby, MIT License

const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const Path = require('path');
const dotenv = require('dotenv');
const cli = require('pixl-cli');
const Logger = require('pixl-logger');
const Request = require('pixl-request');
const StandaloneStorage = require('pixl-server-storage/standalone');
const pkgInfo = require('./package.json');

cli.global();
const Tools = cli.Tools;
const args = cli.args;
const async = Tools.async;
const self_bin = Path.resolve( process.pkg ? process.argv[0] : process.argv[1] );

const host_hash = Tools.digestHex( os.hostname(), 'sha256' );
const host_id = parseInt( host_hash.substring(0, 8), 16 ); // 32-bit numerical hash

var SAMPLE_CONFIG = {
	"enabled": true,
	"fatal": true,
	"threads": 1,
	"scatter": 5,
	"web_hook": "",
	"allow_shell_exec": false,
	"temp_dir": "/var/run",
	"log_dir": "/var/log",
	"log_filename": "confsync-satellite.log",
	"log_columns": [
		"hires_epoch",
		"date",
		"hostname",
		"pid",
		"component",
		"category",
		"code",
		"msg",
		"data"
	],
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
};

var config_file = Path.join( Path.dirname( self_bin ), 'config.json' );
var config = {};

if (!fs.existsSync(config_file) || args.install || (args.other && (args.other[0] == 'install'))) {
	// first time installation, add self to crontab
	if (!args.cron) args.cron = '* * * * *';
	if (!args.user) args.user = 'root';
	
	print("\nConfSync Satellite Auto-Installer v" + pkgInfo.version + "\n");
	
	var raw_tab = "";
	raw_tab += "# Run ConfSync Satellite for automatic config file installation.\n";
	raw_tab += "# See: https://github.com/jhuckaby/confsync\n";
	raw_tab += "PATH=$PATH:/usr/bin:/bin:/usr/local/bin:/usr/sbin:/sbin:/usr/local/sbin\n";
	raw_tab += args.cron + ' ' + args.user + ' ' + self_bin + " --quiet\n";
	
	var cron_file = '/etc/cron.d/confsync-satellite.cron';
	if (!fs.existsSync(cron_file)) {
		fs.writeFileSync( cron_file, raw_tab, { mode: 0o644 } );
		
		// try to give crond a hint that it needs to reload
		if (fs.existsSync('/etc/crontab')) fs.utimesSync( '/etc/crontab', new Date(), new Date() );
		if (fs.existsSync('/var/spool/cron')) fs.utimesSync( '/var/spool/cron', new Date(), new Date() );
		
		print("\nInstalled cron schedule: " + cron_file + "\n");
	}
	
	// also write a logrotate.d conf file
	var logrotated_file = '/etc/logrotate.d/confsync-satellite';
	if (!fs.existsSync(logrotated_file)) {
		fs.writeFileSync( logrotated_file, "/var/log/confsync-satellite.log {\n  rotate 7\n  daily\n  compress\n  missingok\n  notifempty\n}\n" );
	}
	
	if (!fs.existsSync(config_file)) {
		config = SAMPLE_CONFIG;
		
		// allow CLI to override any config option on install
		var overrides = Tools.copyHashRemoveKeys( args, { debug:1, install:1, other:1, cron:1, user:1 } );
		for (var key in overrides) {
			if (overrides[key] === '_DELETE_') Tools.deletePath( config, key );
			else Tools.setPath( config, key, overrides[key] );
		}
		
		var raw_config = JSON.stringify( config, null, "\t" );
		fs.writeFileSync( config_file, raw_config, { mode: 0o600 } );
		print("\nConfig file has been created: " + config_file + "\n");
	}
	
	print("\nInstallation complete.\n\n");
	process.exit(0);
}
else if (args.uninstall || (args.other && (args.other[0] == 'uninstall'))) {
	// remove from cron and exit
	var cron_file = '/etc/cron.d/confsync-satellite.cron';
	if (fs.existsSync(cron_file)) fs.unlinkSync( cron_file );
	
	// try to give crond a hint that it needs to reload
	if (fs.existsSync('/etc/crontab')) fs.utimesSync( '/etc/crontab', new Date(), new Date() );
	if (fs.existsSync('/var/spool/cron')) fs.utimesSync( '/var/spool/cron', new Date(), new Date() );
	if (fs.existsSync(config_file)) fs.unlinkSync( config_file );
	
	// also delete log rotate config
	var logrotated_file = '/etc/logrotate.d/confsync-satellite';
	if (fs.existsSync(logrotated_file)) fs.unlinkSync( logrotated_file );
	
	// also delete self
	if (fs.existsSync(self_bin)) fs.unlinkSync( self_bin );
	
	print("\nConfSync Satellite has been removed.\n");
	print("\n");
	process.exit(0);
}

if (!fs.existsSync(config_file)) die("Config file not found: " + config_file + "\n");
config = Tools.parseJSON( fs.readFileSync(config_file, 'utf8') );

if (args.config || (args.other && (args.other[0] == 'config'))) {
	// modify config via CLI args, save, and exit
	var overrides = Tools.copyHashRemoveKeys( args, { debug:1, config:1, other:1 } );
	for (var key in overrides) {
		if (overrides[key] === '_DELETE_') Tools.deletePath( config, key );
		else Tools.setPath( config, key, overrides[key] );
	}
	
	var raw_config = JSON.stringify( config, null, "\t" );
	fs.writeFileSync( config_file, raw_config, { mode: 0o600 } );
	print("\nConfig file has been updated: " + config_file + "\n");
	print("\n");
	process.exit(0);
}

// load env vars from /etc/environment, if present
if (fs.existsSync('/etc/environment')) try {
	var env = dotenv.parse( fs.readFileSync('/etc/environment') );
	Tools.mergeHashInto( process.env, env );
}
catch (err) {;}

// load env vars from a .env file, if present
var env_file = Path.join( Path.dirname( self_bin ), '.env' );
if (fs.existsSync(env_file)) try {
	var env = dotenv.parse( fs.readFileSync(env_file) );
	Tools.mergeHashInto( process.env, env );
}
catch (err) {;}

// special treatment for HOSTNAME env var
if (!process.env.HOSTNAME) process.env.HOSTNAME = os.hostname();

// allow environment vars to override config
for (var key in process.env) {
	if (key.match(/^CONFSYNC_(.+)$/)) {
		var path = RegExp.$1.trim().replace(/^_+/, '').replace(/_+$/, '').replace(/__/g, '/');
		var value = process.env[key].toString();
		
		// massage value into various types
		if (value === 'true') value = true;
		else if (value === 'false') value = false;
		else if (value.match(/^\-?\d+$/)) value = parseInt(value);
		else if (value.match(/^\-?\d+\.\d+$/)) value = parseFloat(value);
		
		if (value === '_DELETE_') Tools.deletePath(config, path);
		else Tools.setPath(config, path, value);
	}
}

// allow CLI args to override config
for (var key in args) {
	if (args[key] === '_DELETE_') Tools.deletePath( config, key );
	else Tools.setPath( config, key, args[key] );
}

// exit quietly if not enabled
if (!config.enabled && !args.debug) process.exit(0);

// optionally disable all ANSI color
if (("color" in config) && !config.color) {
	cli.chalk.enabled = false;
}

// optionally switch users
if (!args.debug && config.uid && (process.getuid() == 0)) {
	var user = Tools.getpwnam( config.uid );
	if (user) process.setuid( user.uid );
}

var app = {
	
	errors: [],
	
	init() {
		// setup logger
		var self = this;
		var log_file = Path.join( config.log_dir, config.log_filename );
		Tools.mkdirp.sync( Path.dirname(log_file) );
		
		this.logger = new Logger( log_file, config.log_columns );
		this.logger.set( 'debugLevel', config.debug_level );
		this.logger.set( 'sync', true );
		this.logger.set( 'echo', !!args.debug );
		this.logger.set( 'color', !!args.color && cli.chalk.enabled );
		
		// accumulate errors so we can possibly send them up to s3
		this.logger.on('row', function(line, cols, args) {
			if ((args.component == 'Satellite') && (args.category == 'error')) self.errors.push(line);
		});
		
		this.logDebug(5, "ConfSync Satellite v" + pkgInfo.version + " starting run", {
			pkg: !!process.pkg,
			uid: process.getuid(),
			gid: process.getgid(),
			pid: process.pid,
			ppid: process.ppid || 0,
			node: process.version,
			arch: process.arch,
			platform: process.platform,
			argv: process.argv,
			execArgv: process.execArgv,
			host_id 
		});
		
		// create a http request instance for web hooks
		this.request = new Request( "ConfSync Satellite v" + pkgInfo.version );
		this.request.setTimeout( 30 * 1000 );
		this.request.setFollow( 5 );
		this.request.setAutoError( true );
		this.request.setKeepAlive( true );
		
		// setup s3 storage
		config.Storage.logger = this.logger;
		this.storage = new StandaloneStorage(config.Storage, this.check.bind(this));
	},
	
	check() {
		// load state
		var self = this;
		
		this.state_file = Path.join( config.temp_dir, 'confsync-satellite-state.json' );
		this.state = fs.existsSync(this.state_file) ? Tools.parseJSON( fs.readFileSync(this.state_file, 'utf8') ) : { serial: "FIRST_RUN", files: {} };
		
		// if server has no state, set a flag so we can skip over gradual deploys
		if (this.state.serial == 'FIRST_RUN') args.initial = true;
		
		// optional refresh of all files (this also skips over graduals)
		if (args.refresh) this.state = { serial: "", files: {} };
		
		// check serial on S3
		// additional retries here (beyond those offered in pixl-server-storage) due to AWS 
		// metadata-based auth subsystem (e.g. 169.254.169.254) -- it can randomly fail, 
		// and it is NOT retried as part of the AWS-SDK retry mechanism.  Since this initial 
		// request is almost always the one that fails, we wrap this one with retries.
		// https://github.com/aws/aws-sdk-js-v3/issues/4407
		
		async.retry( { times: 5, interval: 1000 }, 
			function(callback) {
				self.storage.get( 'serial', callback );
			},
			function(err, data) {
				if (err) {
					self.logError('s3', "Failed to load serial: " + err);
					return self.shutdown();
				}
				if (data.value == self.state.serial) {
					self.logDebug(9, "Serial has not changed, exiting.", data);
					return self.shutdown();
				}
				
				self.logDebug(5, "Serial has changed, performing full sync", {
					old: self.state.serial,
					new: data.value
				});
				
				// copy new serial to state object, will save at end
				self.state.serial = data.value;
				
				self.sync();
			}
		); // async.retry
	},
	
	sync() {
		// load master data
		var self = this;
		
		this.storage.get( 'master', function(err, data) {
			if (err) {
				self.logError('s3', "Failed to load master data: " + err);
				return self.shutdown();
			}
			self.master = data;
			
			// some sanity checks
			if (!self.master.groups || !self.master.groups.length) {
				self.logDebug(5, "No target groups defined, exiting.");
				return self.finish();
			}
			if (!self.master.files || !self.master.files.length) {
				self.logDebug(5, "No config files defined, exiting.");
				return self.finish();
			}
			
			if (!self.detectGroups()) return;
			
			async.eachLimit( self.master.files, config.threads || 1, self.syncFile.bind(self), self.finish.bind(self) );
		});
	},
	
	matchEnv(criteria) {
		// apply criteria match on environment
		var num_crit = Tools.numKeys(criteria);
		var num_matches = 0;
		
		for (var key in criteria) {
			if ((key in process.env) && process.env[key].toString().match( new RegExp(criteria[key]) )) num_matches++;
		}
		
		return num_matches == num_crit;
	},
	
	detectGroups() {
		// see which group(s) we belong to
		var self = this;
		this.groups = {};
		
		this.master.groups.forEach( function(group) {
			if (!group.env) return;
			if (self.matchEnv(group.env)) self.groups[ group.id ] = 1;
		} );
		
		if (!Tools.numKeys(this.groups)) {
			this.logDebug(5, "Server does not match any groups, exiting.");
			this.finish();
			return false;
		}
		
		this.logDebug(8, "Server matched groups: " + Object.keys(this.groups).join(', ') );
		return true;
	},
	
	getSortedGroups() {
		// sort our matched groups by priority descending
		var self = this;
		
		var groups = Object.keys(this.groups).map( function(group_id) {
			return Tools.findObject(self.master.groups, { id: group_id });
		} );
		
		// sort groups by priority descending (so priority 1 is latter prevails)
		groups = groups.sort( function(a, b) {
			return (b.priority || 5) - (a.priority || 5);
		} );
		
		return groups;
	},
	
	syncFile(file, callback) {
		// sync one config file
		var self = this;
		var now = Tools.timeNow();
		if (!file.live) file.live = {}; // sanity
		
		// see if file even targets this server
		if (file.env && !this.matchEnv(file.env)) {
			this.logDebug(8, "File does not target this server, skipping: " + file.id, file);
			return process.nextTick(callback);
		}
		
		// see which rev we need to install
		var revs_to_install = {};
		for (var group_id in this.groups) {
			if (file.live[group_id]) {
				// check for gradual roll (duration)
				// only honor this if we're not refreshing, and not doing the initial install
				if (file.live[group_id].duration && !args.refresh && !args.initial) {
					var start = file.live[group_id].start;
					var duration = host_id % file.live[group_id].duration;
					if (now - start >= duration) {
						// it is now time for this server!
						revs_to_install[ file.live[group_id].rev ] = group_id;
					}
					else {
						// not ready to roll here, mark local state to keep trying
						self.state.serial = 'GRADUAL_DEPLOY_IN_PROGRESS';
						
						var remain_sec = Math.floor( duration - (now - start) ); // for logging
						this.logDebug(8, "File is being gradually deployed, and is not yet ready for this server, skipping: " + file.id + " (" + remain_sec + " sec remain)", file);
						return process.nextTick(callback);
					}
				}
				else {
					revs_to_install[ file.live[group_id].rev ] = group_id;
				}
			}
		}
		var rev_to_install = Tools.firstKey(revs_to_install);
		if (!rev_to_install) {
			this.logDebug(8, "File has not been deployed to any of our groups, skipping: " + file.id, file);
			return process.nextTick(callback);
		}
		
		if (Tools.numKeys(revs_to_install) > 1) {
			// conflict!
			this.logDebug(2, "File conflict warning: Multiple unique revisions target groups we are in (will use: " + rev_to_install + ")", { revs_to_install, file });
		}
		
		var cur_rev = this.state.files[file.id] || 'n/a';
		if (cur_rev == rev_to_install) {
			this.logDebug(8, "File revision has not changed (" + cur_rev + "), skipping: " + file.id, file);
			return process.nextTick(callback);
		}
		
		this.logDebug(7, "File revision has changed (" + cur_rev + " --> " + rev_to_install + ")", file);
		
		// fetch new revision
		this.storage.listFind( 'files/' + file.id, { rev: rev_to_install }, function(err, item) {
			if (err) {
				self.logDebug(2, "Could not locate " + file.id + " revision: " + rev_to_install + ": " + err + " (will retry)", file);
				
				// this should never happen, so set flag to keep trying
				self.state.serial = 'REQUEST_RETRY';
				
				return callback();
			}
			
			file.rev = rev_to_install; // for logging
			self.logDebug(5, "Installing new file revision: " + file.id + ": " + rev_to_install, file);
			
			// apply overrides (multiple?)
			if (item.overrides) {
				self.getSortedGroups().forEach( function(group) {
					var overrides = item.overrides[group.id];
					if (!overrides) return;
					
					self.logDebug(8, "Applying file overrides for group: " + group.id, overrides);
					
					if (Tools.isaHash(overrides)) {
						// apply JSON path overrides
						for (var key in overrides) {
							if (overrides[key] === '_DELETE_') Tools.deletePath( item.base, key );
							else Tools.setPath( item.base, key, overrides[key] );
						}
					}
					else {
						// non-JSON file, just replace base entirely
						item.base = overrides;
					}
				}); // foreach sorted group
			} // overrides
			
			// prepare file for writing
			var payload = Tools.isaHash(item.base) ? (JSON.stringify(item.base, null, "\t") + "\n") : item.base;
			var mode = parseInt( file.mode || config.mode || '644', 8 ); // 8 == octal
			var temp_file = file.path + '.' + process.pid + '.tmp';
			
			var do_chown = false;
			if ('uid' in file) {
				if (typeof(file.uid) != 'number') {
					var info = Tools.getpwnam(file.uid, true);
					if (!info) {
						self.logError('fs', "Failed to lookup local user info: " + file.uid, file);
						return callback();
					}
					file.uid = info.uid;
					if (!('gid' in file)) file.gid = info.gid;
				}
				if (('gid' in file) && (typeof(file.gid) != 'number')) {
					var info = Tools.getgrnam(file.gid, true);
					if (!info) {
						self.logError('fs', "Failed to lookup local group info: " + file.gid, file);
						return callback();
					}
					file.gid = info.gid;
				}
				if (!('gid' in file)) file.gid = file.uid;
				do_chown = true;
			}
			
			// create parent dirs if needed
			var dir = Path.dirname(file.path);
			if (!fs.existsSync(dir)) try { Tools.mkdirp.sync(dir); }
			catch (err) {
				self.logError('fs', "Failed to create directory: " + dir + ": " + err, file);
				return callback();
			}
			
			// write temp file, apply mode/uid/gid, atomically rename
			try {
				fs.writeFileSync( temp_file, payload, { mode } );
				
				// apply UID/GID if configured
				if (do_chown) fs.chownSync( temp_file, file.uid, file.gid );
				
				// rename over destination (atomic write)
				fs.renameSync( temp_file, file.path );
			}
			catch (err) {
				self.logError('fs', "Failed to write file: " + file.path + ": " + err, file);
				return callback();
			}
			
			self.logTransaction('file_write', file.path, file);
			
			// update state
			self.state.files[file.id] = rev_to_install;
			
			// optional exec shell action
			if (file.exec && config.allow_shell_exec) {
				var cmd = Tools.sub( file.exec, file );
				self.logDebug(5, "Executing shell action: " + cmd);
				
				var opts = { timeout: config.exec_timeout || 5000, encoding: 'utf8' };
				try { 
					var output = cp.execSync(cmd, opts).trim();
					self.logDebug(6, "Command output: " + output);
				}
				catch (err) {
					self.logError('exec', "Failed to exec shell command: " + cmd + ": " + err, file);
				}
			} // exec
			
			// optionally send signal to PID
			if (file.signal && file.pid) {
				self.logDebug(5, "Sending " + file.signal + " to PID in: " + file.pid);
				if (fs.existsSync(file.pid)) {
					try { 
						var pid = parseInt( fs.readFileSync(file.pid, 'utf8') );
						if (!pid) throw new Error("PID not found in file: " + file.pid);
						process.kill( file.signal, pid );
					}
					catch(err) {
						self.logError('fs', "Failed to send " + file.signal + ": " + err, file);
					}
				}
				else {
					self.logDebug(5, "PID file does not exist, skipping action: " + file.pid);
				}
			}
			
			// further augment file object for receipt and web hook payloads
			file.server = {
				hostname: os.hostname(),
				arch: os.arch(),
				platform: os.platform(),
				release: os.release(),
				version: os.version(),
				load: os.loadavg(),
				mem: os.totalmem(),
				uptime: os.uptime()
			};
			
			var finishSync = function() {
				// optional upload receipt
				if (config.upload_receipts && (!config.receipt_uptime_grace_sec || (file.server.uptime > config.receipt_uptime_grace_sec))) {
					var s3_key = 'receipts/' + file.id + '/' + file.rev + '/' + file.server.hostname + '-' + Math.floor(now);
					self.logDebug(9, "Uploading deploy receipt: " + s3_key);
					self.storage.put( s3_key, file, function(err) {
						if (err) self.logError('s3', "Failed to upload deploy receipt to S3: " + err);
						else self.logDebug(9, "Deploy receipt uploaded successfully: " + s3_key);
						callback();
					} );
				}
				else callback();
			}; // finishSync
			
			// optional web hooks
			if (file.web_hook || config.web_hook) {
				async.parallel([
					function(callback) {
						if (!file.web_hook) return callback();
						self.request.json( file.web_hook, file, function(err) {
							if (err) self.logDebug(6, 'Web hook failed: ' + err);
							else self.logDebug(9, "Web hook fired successfully: " + file.web_hook);
							callback();
						} );
					},
					function(callback) {
						if (!config.web_hook) return callback();
						self.request.json( config.web_hook, file, function(err) {
							if (err) self.logDebug(6, 'Web hook failed: ' + err);
							else self.logDebug(9, "Web hook fired successfully: " + config.web_hook);
							callback();
						} );
					}
				], finishSync);
			}
			else finishSync();
		}); // listFind
	},
	
	finish() {
		this.logDebug(5, "Sync complete, exiting");
		
		// save state to disk
		fs.writeFileSync( this.state_file, JSON.stringify(this.state) + "\n" );
		
		this.shutdown();
	},
	
	writePIDFile() {
		// only one copy of CLI should run at one time
		this.pid_file = Path.join( config.temp_dir, 'confsync-satellite-pid.txt' );
		
		if (fs.existsSync(this.pid_file)) {
			var pid = parseInt( fs.readFileSync( this.pid_file, 'utf8' ) );
			var running = false;
			
			try { process.kill(pid, 0); running = true; } catch(e) {;}
			
			if (running) {
				die("Another copy of ConfSync Satellite is running at PID " + pid + ".\n");
			}
		}
		
		fs.writeFileSync( this.pid_file, '' + process.pid );
	},
	
	deletePIDFile() {
		// we done
		if (this.pid_file) {
			try { fs.unlinkSync(this.pid_file); } catch (e) {;}
		}
	},
	
	shutdown() {
		// upload errors to s3, then shutdown
		var self = this;
		this.deletePIDFile();
		
		if (!this.errors.length || !config.upload_errors) {
			this.logDebug(9, "Shutdown complete, exiting.");
			process.exit(0);
			return;
		}
		
		var payload = Buffer.from( this.errors.join("") + "\n" );
		var s3_key = 'errors/' + os.hostname() + '.log';
		
		this.storage.put( s3_key, payload, function(err) {
			if (err) self.logError('s3', "Failed to upload errors to S3: " + err);
			self.logDebug(9, "Shutdown complete, exiting.");
			
			if (config.fatal) {
				process.stderr.write( self.errors.join("") + "\n" );
				process.exit(1);
			}
			else process.exit(0);
		} );
	},
	
	debugLevel(level) {
		// check if we're logging at or above the requested level
		return (this.logger.get('debugLevel') >= level);
	},
	
	logDebug(level, msg, data) {
		// proxy request to system logger with correct component
		if (this.debugLevel(level)) {
			this.logger.set( 'component', 'Satellite' );
			this.logger.print({ 
				category: 'debug', 
				code: level, 
				msg: msg, 
				data: data 
			});
		}
	},
	
	logError(code, msg, data) {
		// proxy request to system logger with correct component
		this.logger.set( 'component', 'Satellite' );
		this.logger.error( code, msg, data );
	},
	
	logTransaction(code, msg, data) {
		// log transaction, emit event, and fire applicable web hooks
		var self = this;
		if (!data) data = {};
		
		this.logger.set( 'component', 'Satellite' );
		this.logger.transaction( code, msg, data );
	}
	
}; // app

app.writePIDFile();

// random startup delay
if (args.debug || args.refresh || !config.scatter) app.init();
else {
	setTimeout( function() { app.init(); }, host_id % (config.scatter * 1000) );
}
