'use strict';

/*
Holds a bunch of streams
*/

var Stream = require('./stream').Stream
  , util = require('util')
  , events = require('events')
  ;

var StreamManager = module.exports.StreamManager = function (chunkStore, thisNode) {
  this.streams = {};
  this.chunkStore = chunkStore;
  this.thisNode = thisNode;
};
util.inherits(StreamManager, events.EventEmitter);

// Returns a Stream.
// streamId can be left out, in which case a NEW STREAM
// is returned
// If streamId is included but the specified stream cannot be found,
// returns null
StreamManager.prototype.get = function (filename, chunk, streamId) {
  console.log('Get stream', filename, ':', chunk, '>', streamId === null);
  if (typeof(streamId) === 'undefined' || streamId === null) {
    // Make a new one.
    var newStream = new Stream(filename, chunk, this.chunkStore, this.thisNode);
    newStream.on('masterTimedout', function() {
      this.emit('masterTimedout');
    }.bind(this));
    
    newStream.fillBuffer();
    this.streams[newStream.id] = newStream;
    return newStream;
  } else {
    if (this.streams.hasOwnProperty(streamId)) {
      return this.streams[streamId];
    } else {
      return null;
    }
  }
};
