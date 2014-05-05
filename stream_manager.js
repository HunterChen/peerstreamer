'use strict';

/*
Holds a bunch of streams
*/

var Stream = require('./stream').Stream;

var StreamManager = module.exports.StreamManager = function (chunkStore, master) {
  this.streams = {};
  this.chunkStore = chunkStore;
  this.master = master;
};


// Returns a Stream.
// streamId can be left out, in which case a NEW STREAM
// is returned
// If streamId is included but the specified stream cannot be found,
// returns null
StreamManager.prototype.get = function (filename, chunk, streamId) {
  console.log('Get stream', filename, ':', chunk, '>', streamId === null);
  if (typeof(streamId) === 'undefined' || streamId === null) {
    // Make a new one.
    var newStream = new Stream(filename, chunk, this.chunkStore, this.master);
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
