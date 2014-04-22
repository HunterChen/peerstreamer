'use strict';

/*
   Keeps track of children using heartbeat.

   it is an event emitter, and will emit a 'childgone'
   event in the case that a child dissappears.
*/

var events = require('events')
  , util = require('util')
  ;

var ChildTracker = module.exports.ChildTracker = function () {
};
util.inherits(ChildTracker, events.EventEmitter);

ChildTracker.prototype.add = function (server) {
  // Adds a server to track. Should ping this server
  // until it is dead, at which point emit a 'childgone' event.
};