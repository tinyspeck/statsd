#!/usr/bin/node

var node = process.argv.shift();
var file = process.argv.shift();
var config_file = process.argv.shift();

process.argv.unshift(file);
process.argv.unshift(node);

// you could also `cd` in the shell script, but we do it here
require.paths.push('/usr/local/statsd');
var config = require('./'+config_file).config;

// this is a TinySpeck specific way of getting the hostname, when
// one wasn't specified in the config. we do this for most hosts,
// but we use the config where we're running multiple statsd's on
// a single server
if (!config.hostname){
	var fs = require('fs');
	var hostname = fs.readFileSync('/etc/tshost', 'utf8');
	hostname = hostname.replace(/\s+$/, '');
	config.hostname = hostname;
}

// daemonize
require('service').run({
        lockFile: config.lock_file,
        logFile : config.log_file,
});

// start it up
console.log("Starting statsd...");
require('stats').run(config);
