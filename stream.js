'use strict';
var Server = require('./server').Server;

var Stream = module.exports.Stream = function (filename, initialChunk, chunkStore, master) {
  this.filename = filename;
  this.initialChunk = initialChunk;
  this.chunkCursor = initialChunk;
  this.master = master;

  this.chunkSource = null;

  this.chunkStore = chunkStore;
  this.done = false;
};

Stream.prototype._getChunkFromSource = function (source, filename, chunk, callback) {
  source.getClient().invoke('get', filename, chunk, function (err, res) {
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
    this.chunkCursor++;
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
        this.chunkSource = null;
        return this.advanceCursorFromNullSource(callback);
      }
    });
  }
};

Stream.prototype.advanceCursorFromSource = function (callback) {
  if (!this.chunkSource) {
    throw new Error('WHAT ARE YOU DOING');
  }

  this._getChunkFromSource(this.chunkSource, this.filename, this.chunkCursor, function (err, chunkData) {
    if (err) {
      return callback(err);
    }

    if (chunkData === null) {
      return callback(null, false);
    }
    this.chunkStore.add(this.filename, this.chunkCursor, chunkData);
    this.chunkCursor++;
    return callback(null, true);
  }.bind(this));
};

Stream.prototype.advanceCursorFromNullSource = function (callback) {
  // Then I need to find one.
  this.master.getClient().invoke('query', this.filename, this.chunkCursor, function (err, serializedPossiblePeers) {
    // Convert the raw {name: 'name', address: 'address'} peer list into a list of Servers
    var possiblePeers = [];
    serializedPossiblePeers.forEach(function (s) {
      possiblePeers.push(new Server(s.name, s.address));
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
        this.chunkSource = this.master;
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
    this.chunkSource = possiblePeers.shift();
    this.advanceCursorFromSource(function(err, advanced) {
      if (err) {
        return callback(err);
      }
      if (advanced) {
        // Hurray. Nothing more do to,
        return callback(null, true);
      } else {
        // Fuck. try the next one.
        this.advanceFromQueryResult(possiblePeers, callback);
      }
    }.bind(this));
  }
};