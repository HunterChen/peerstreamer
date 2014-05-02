'use strict';

/*
   Keeps track of children using heartbeat.

   it is an event emitter, and will emit a 'childgone'
   event in the case that a child dissappears.
*/

var events = require('events')
  , util = require('util')
  ;

var DEFAULT_HEARTBEAT_TIMEOUT = 2 // seconds
  , DEFAULT_PING_INTERVAL = 3 // seconds
  ;

// So we'll notice within HEARTBEAT_TIMEOUT + PING_INTERVAL seconds.
// risk of false death is low.

var ChildTracker = module.exports.ChildTracker = function (options) {
  options = options || {};
  this.heartbeatTimeout = options.heartbeatTimeout || DEFAULT_HEARTBEAT_TIMEOUT;
  this.pingInterval = options.pingInterval || DEFAULT_PING_INTERVAL;
  this.tracking = {};
};
util.inherits(ChildTracker, events.EventEmitter);

ChildTracker.prototype.add = function (server) {
  // Adds a server to track. Should ping this server
  // until it is dead, at which point emit a 'childgone' event.
  if (!this.tracking.hasOwnProperty(server.name)) {
    this.tracking[server.name] = server;
    this._ping(server);
    return true;
  } else {
    return false;
  }
};

ChildTracker.prototype.getChild = function (serverName) {
  // Returns the Server object if we have it, or null;
  if (this.tracking.hasOwnProperty(serverName)) {
    return this.tracking[serverName];
  } else {
    return null;
  }
};

ChildTracker.prototype.hasChild = function (serverName) {
  return !!this.getChild(serverName);
};

ChildTracker.prototype._ping = function (server) {
  var client = server.getClient({
    timeout: this.heartbeatTimeout
  });

  // Not caused by timeout, but something
  // is definitely broken. Dead.
  client.on('error', this._serverDead.bind(this, server));

  client.invoke('ping', function (err, res) {
    client.removeAllListeners();
    client.close();
    if (err) {
      this._serverDead(server);
    } else {
      // Great!
      this.emit('serverStillAlive', server);
      setTimeout(this._ping.bind(this, server), this.pingInterval*1000);
    }
  }.bind(this));

};

ChildTracker.prototype._serverDead = function (server) {
  // remove it from the tracking
  delete this.tracking[server.name];
  // and emit an event
  this.emit('childgone', server);
};

if (require.main === module) {
  var Server = require('./server').Server
    , zerorpc = require('zerorpc')
    ;
  var ct = new ChildTracker({
    heartbeatTimeout: 2
  , pingInterval: 1
  });
  ct.on('serverStillAlive', function (s) {
    console.log('server', server.name, 'still alive');
  });
  ct.on('childgone', function (s) {
    console.log('server', server.name, 'is dead');
  });


  console.log('Starting server, will fail it after 10 seconds');
  var respond = true;
  var s = new zerorpc.Server({
    ping: function (r) { 
      if (respond) {
        return r(); 
      }
    }
  });
  s.bind('inproc://foo');
  setTimeout(function () {
    respond = false;
    setTimeout(s.close.bind(s), 1000);
  }, 10000);

  var server = new Server('inproc://foo', 'test');
  ct.add(server);
}