'use strict';

var util = require('util')
  , events = require('events')
  , uuid = require('node-uuid')
  , Server = require('./server').Server
  ;

var BUFFER_SIZE_IN_CHUNKS = 10;

var Stream = module.exports.Stream = function (filename, initialChunk, chunkStore, master) {
  // Position is NEXT thing that is allowed to be read.
  // chunkCursor is the chunk __after__ the last one we have,
  //  __or______ the NEXT one we have to get.

  this.filename = filename;
  this.initialChunk = initialChunk;
  this.chunkCursor = initialChunk;
  this.position = initialChunk;
  this.master = master;

  this.chunkSource = null;
  this._chunkSourceIsMaster = false;
  this._chunkSourceStreamId = null;

  this.chunkStore = chunkStore;
  this.done = false;

  this._positionCallbacks = {};

  // State to mutex advanceCursor* and friends.
  this._fillingBuffer = false;
  this.id = uuid.v4();

  this.on('positionAdvanced', this.checkWaitingCallbacks.bind(this));
  this.on('chunkCursorAdvanced', this.checkWaitingCallbacks.bind(this));
};
util.inherits(Stream, events.EventEmitter);

Stream.prototype.setSource = function (server) {
  // Reset source state and set to given server.
  this.chunkSource = server;
  this._chunkSourceIsMaster = false;
  this._chunkSourceStreamId = null;
};

Stream.prototype._getChunkFromSource = function (source, filename, chunk, isMaster, streamId, callback) {
  source.getClient().invoke('get', filename, chunk, isMaster, streamId, function (err, res) {
    if (err) {
      return callback(err);
    } else {
      return callback(null, res);
    }
  });
};


Stream.prototype.advanceCursor = function (callback) {
  // Get next chunk, from some server.
  /// Will callback with (err Err, advanced bool)
  if (this.chunkStore.get(this.filename, this.chunkCursor) !== null) {
    // Great. Chunk store has it already. Move.
    this.advanceChunkCursor();
    return setImmediate(function () {
      callback(null, true);
    });
  }

  if (this.chunkSource === null) {
    this.advanceCursorFromNullSource(callback);
  } else {
    // I have a chunk source, but it might not have my chunk :<
    this.advanceCursorFromSource(function(err, advanced) {
      if (advanced) {
        return callback(null, true);
      } else {
        this.setSource(null);
        return this.advanceCursorFromNullSource(callback);
      }
    }.bind(this));
  }
};

Stream.prototype.advanceCursorFromSource = function (callback) {
  if (!this.chunkSource) {
    throw new Error('WHAT ARE YOU DOING');
  }

  this._getChunkFromSource(
    this.chunkSource
  , this.filename
  , this.chunkCursor
  , this._chunkSourceIsMaster
  , this._chunkSourceStreamId
  , function (err, response) {
    if (err) {
      return callback(err);
    }
    
    if (response.data === null) {
      return callback(null, false);
    }
    this.chunkStore.add(this.filename, this.chunkCursor, response.data);
    this.advanceChunkCursor();
    this._chunkSourceStreamId = response.streamId;
    return callback(null, true);
  }.bind(this));
};

Stream.prototype.advanceCursorFromNullSource = function (callback) {
  // Then I need to find one.
  this.master.getClient().invoke('query', this.filename, this.chunkCursor, function (err, serializedPossiblePeers) {
    // Convert the raw {name: 'name', address: 'address'} peer list into a list of Servers
    var possiblePeers = [];
    serializedPossiblePeers.forEach(function (s) {
      possiblePeers.push(new Server(s.address, s.name));
    });

    if (err) {
      return callback(err);
    }
    this.advanceCursorFromPossiblePeers(possiblePeers, function (err, advanced) {
      if (err) {
        return callback(err);
      }

      if (advanced) {
        return callback(null, true);
      } else {
        // Fallback to master.
        // and need to resort to the master.
        // Dont need to check if the master has it,
        // because the master ALWAYS has it. :D
        // TODO handle error
        this.setSource(this.master);
        this._chunkSourceIsMaster = true;
        this.advanceCursorFromSource(callback);
      }
    }.bind(this));
  }.bind(this));
};

Stream.prototype.advanceCursorFromPossiblePeers = function (possiblePeers, callback) {
  if (possiblePeers.length === 0) {
    // Then we're out of options,
    return callback(null, false);
  } else {
    // Try one.
    this.setSource(possiblePeers.shift());
    this.advanceCursorFromSource(function(err, advanced) {
      if (err) {
        return callback(err);
      }
      if (advanced) {
        // Hurray. Nothing more do to,
        return callback(null, true);
      } else {
        // Fuck. try the next one.
        this.advanceCursorFromPossiblePeers(possiblePeers, callback);
      }
    }.bind(this));
  }
};

Stream.prototype.fillBuffer = function () {
  // Moves the buffer forward, if nothing else is.
  if (this._fillingBuffer) {
    // Someone else in on the JOB.
    // Stop being a whiteknight.
    return false;
  } else {
    this._fillingBuffer = true;
  }

  var step = function () {
    if ((this.chunkCursor - this.position) > BUFFER_SIZE_IN_CHUNKS) {
      // Great. We're done here.
      this._fillingBuffer = false; 
    } else {
      this.advanceCursor(function (err, advanced) {
        if (err) {
          throw new Error(err); // BLOW UP. TODO: DONT BLOW UP.
        }
        if (advanced) {
          // Recurse.
          console.log('Advanced cursor position to', this.chunkCursor);
          step();
        } else {
          throw new Error('Failed to advance. Nolan, WHAT IS HAPPENING?');
        }
      }.bind(this));
    }
  }.bind(this);
  step();
};

Stream.prototype.registerPositionCallback = function (chunk, callback) {
  // Registers a callback that will be called (and deleted!)
  // when:
  // - this.position === chunk AND
  // - this.chunkCursor > chunk
  //
  // returns true  if successfully stored
  // returns false if not, probably because something else is
  if (this._positionCallbacks.hasOwnProperty(chunk)) {
    return false;
  } else {
    this._positionCallbacks[chunk] = callback;
    setImmediate(this.checkWaitingCallbacks.bind(this));
    return true;
  }
};

Stream.prototype.checkWaitingCallbacks = function () {
  // Checks the conditions are such that we 
  // can call a callback! If so, will delete it and call it.
  //
  // - get callback, if any, at position.
  // - check if k > our position.

  if (this._positionCallbacks.hasOwnProperty(this.position)) {
    if (this.chunkCursor > this.position) {
      // Great. Get it and delete it.
      var callback = this._positionCallbacks[this.position];
      delete this._positionCallbacks[this.position];
      callback();
    } else {
      // Too bad. This will be called again onChunkCursorIncrement,
      // so maybe then things will be ready.
    }
  } else {
    // Do nothing. Users cannot skip.
  }
};

Stream.prototype.advancePosition = function () {
  this.position++;
  this.fillBuffer();
  // TODO free that chunk (let the chunkStore eliminate it?)
  this.emit('positionAdvanced');
};

Stream.prototype.advanceChunkCursor = function () {
  this.chunkCursor++;
  this.emit('chunkCursorAdvanced');
};
