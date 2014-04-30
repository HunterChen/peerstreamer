'use strict';

/*
  Datastructure from mapping what servers have which filename:chunk pairs.
  Used by a master; updated in response to server reports, registers, and deaths.

  `server` in all these is a Server datastructure
*/


var events = require('events')
  , util = require('util')
  ;

var ChunkDirectory = module.exports.ChunkDirectory = function () {
  this.fcDirectory = {}; // fc : [s1, s2, s3...]
  this.servers = {}; // server : [fc1, fc2,..]; used to avoid walking the fcDirectory 
};
util.inherits(ChunkDirectory, events.EventEmitter);

ChunkDirectory.prototype.insert = function (filename, chunk, server) {
  var fc = filename + chunk;
  if (fc in this.fcDirectory) {
    if (this.fcDirectory[fc].indexOf(server) !== -1) {
      this.fcDirectory[fc].push(server);
      this._insertServerFC(fc, server);
      this.emit('inserted', {'filename':filename,'chunk':chunk,'server':server});
    }
  } else {
    this.fcDirectory[fc] = [server];
    this._insertServerFC(fc, server);    
    this.emit('inserted', {'filename':filename,'chunk':chunk,'server':server});
  }
};

ChunkDirectory.prototype._insertServerFC = function(fc, server) {
  if (server in this.servers) {
      this.servers[server] = this.servers.push(fc);
  } else {
    this.servers[server] = [fc];
  }
};

ChunkDirectory.prototype._removeServerFC = function(fc, server) {
  var index = this.servers[server].indexOf(fc);
  this.servers[server].splice(index, 1);
  if (this.servers[server].length === 0) {
    delete this.servers[server];
  }
};

ChunkDirectory.prototype.remove = function (filename, chunk, server) {
  // Removes association of this filename / chunk with the server
  var fc = filename + chunk;
  if (fc in this.fcDirectory) {
    var index = this.fcDirectory[fc].indexOf(server);
    if (index !== -1) {
      this.fcDirectory[fc].splice(index, 1);
      this.removeServerFC(fc, server);
    }
  }
};

ChunkDirectory.prototype.getServers = function (filename, chunk) {
  var fc = filename + chunk;
  return this.fcDirectory[fc] || [];
};

ChunkDirectory.prototype.removeServer = function (server) {
  // Removes all of the entries for this server.
  var chunksToRemove = this.servers[server];
  for (var i = 0; i < chunksToRemove.length; i++) {
    var fc = chunksToRemove[i];
    var index = this.fcDirectory[fc].indexOf(server);
    if (index !== -1) {
      this.fcDirectory[fc].splice(index, 1);
    }
  }
  delete this.servers[server];
};


if (require.main === module) {
  var Server = require('./server').Server;
  

  var cd = new ChunkDirectory();

  cd.on('inserted', function (s) {
    console.log('inserted', s.filename, s.chunk, 'on', s.server.name);
  });

  var s1 = new Server('inproc://foo1', 's1');
  var s2 = new Server('inproc://foo2', 's2');

  var f1 = 'file1';
  var f2 = 'file2';
  cd.insert(f1, 1, s1);
}