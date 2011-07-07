#!/usr/bin/node

var dgram  = require('dgram')
  , sys    = require('sys')
  , net    = require('net')
  , fs     = require('fs')

var node = process.argv.shift();
var file = process.argv.shift();
var config_file = process.argv.shift();

process.argv.unshift(file);
process.argv.unshift(node);

// this needs to be an abs path, or relative to the cd
var config = require(config_file).config;

// this is a TinySpeck specific way of getting the hostname, when
// one wasn't specified in the config. we do this for most hosts,
// but we use the config where we're running multiple statsd's on
// a single server
if (!config.hostname){
        var hostname = fs.readFileSync('/etc/tshost', 'utf8');
        hostname = hostname.replace(/\s+$/, '');
        config.hostname = hostname;
}

// daemonize
require('service').run({
        lockFile: config.lock_file,
        logFile : config.log_file,
});

var counters = {};
var timers = {};
var debugInt, flushInt, server;

var run = function(config){

  if (! config.debug && debugInt) {
    clearInterval(debugInt); 
    debugInt = false;
  }

  if (config.debug) {
    if (debugInt !== undefined) { clearInterval(debugInt); }
    debugInt = setInterval(function () { 
      sys.log("Counters:\n" + sys.inspect(counters) + "\nTimers:\n" + sys.inspect(timers));
    }, config.debugInterval || 10000);
  }

  if (server === undefined) {
    server = dgram.createSocket('udp4', function (msg, rinfo) {
      if (config.dumpMessages) { sys.log(msg.toString()); }
      var bits = msg.toString().split(':');
      var key = bits.shift()
                    .replace(/\s+/g, '_')
                    .replace(/\//g, '-')
                    .replace(/[^a-zA-Z_\-0-9\.]/g, '');

      if (bits.length == 0) {
        bits.push("1");
      }

      for (var i = 0; i < bits.length; i++) {
        var sampleRate = 1;
        var fields = bits[i].split("|");
        if (fields[1] === undefined) {
            sys.log('Bad line: ' + fields);
            continue;
        }
        if (fields[1].trim() == "ms") {
          if (! timers[key]) {
            timers[key] = [];
          }
          timers[key].push(Number(fields[0] || 0));
        } else {
          if (fields[2] && fields[2].match(/^@([\d\.]+)/)) {
            sampleRate = Number(fields[2].match(/^@([\d\.]+)/)[1]);
          }
          if (! counters[key]) {
            counters[key] = 0;
          }
          counters[key] += Number(fields[0] || 1) * (1 / sampleRate);
        }
      }
    });

    server.bind(config.port || 8125);

    var flushInterval = Number(config.flushInterval || 10000);

    flushInt = setInterval(function () {
      var statString = '';
      var ts = Math.round(new Date().getTime() / 1000);
      var numStats = 0;
      var key;

      for (key in counters) {
        var value = counters[key] / (flushInterval / 1000);
        var message = "";
        message += 'stats.counters.' + key + '.' + config.hostname + '.value ' + value + ' ' + ts + "\n";
        message += 'stats.counters.' + key + '.' + config.hostname + '.count ' + counters[key] + ' ' + ts + "\n";
        statString += message;
        counters[key] = 0;

        numStats += 1;
      }

      for (key in timers) {
        if (timers[key].length > 0) {
          var percents = config.percents || [10,50,90];

          var values = timers[key].sort(function (a,b) { return a-b; });
          var count = values.length;
          var min = values[0];
          var max = values[count - 1];

          var percent_values = {};
          for (var i=0; i<percents.length; i++) {
            var idx = (count - Math.round(((100 - percents[i]) / 100) * count)) - 1;
            if (idx < 0) idx = 0;
            percent_values["percent_"+percents[i]] = values[idx];
          }

          var sum = 0;
          for (var i=0; i<count; i++) sum += values[i];
          var mean = sum / count;

          timers[key] = [];

          var message = "";
          message += 'stats.timers.' + key + '.' + config.hostname + '.min ' + min + ' ' + ts + "\n";
          message += 'stats.timers.' + key + '.' + config.hostname + '.max ' + max + ' ' + ts + "\n";
          message += 'stats.timers.' + key + '.' + config.hostname + '.mean ' + mean + ' ' + ts + "\n";
          message += 'stats.timers.' + key + '.' + config.hostname + '.count ' + count + ' ' + ts + "\n";
          for (var i in percent_values) {
            message += 'stats.timers.' + key + '.' + config.hostname + '.' + i + ' ' + percent_values[i] + ' ' + ts + "\n";
          }
          statString += message;

          numStats += 1;
        }
      }

      statString += 'statsd.' + config.hostname + '.numStats ' + numStats + ' ' + ts + "\n";

      try {
        var graphite = net.createConnection(config.graphitePort, config.graphiteHost);
        graphite.on('error', function() {
          //log error'd stats in case we want to get them later
          //this is a common case - we shouldn't go down just because graphite is down
          sys.log(statString);
        });
        graphite.on('connect', function() {
          this.write(statString);
          this.end();
        });
      } catch(e){
        // no big deal
        //log error'd stats in case we want to get them later
        sys.log(statString);
      }

    }, flushInterval);
  }

};

// start it up
console.log("Starting statsd...");
run(config);
