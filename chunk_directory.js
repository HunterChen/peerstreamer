'use strict';

/*
  Datastructure from mapping what servers have which filename:chunk pairs.
  Used by a master; updated in response to server reports, registers, and deaths.

  `server` in all these is a Server datastructure
*/

var ChunkDirectory = module.exports.ChunkDirectory = function () {
  this.fcDirectory = {}; // fc : [s1, s2, s3...]
  this.servers = {}; // server : [fc1, fc2,..]; used to avoid walking the fcDirectory 
};

ChunkDirectory.prototype.insert = function (filename, chunk, server) {
  var fc = filename + chunk;
  if (fc in this.fcDirectory) {
    if (this.fcDirectory[fc].indexOf(server) !== -1) {
      this.fcDirectory[fc].push(server);
      this.insertServerFC(fc, server);
    }
  } else {
    this.fcDirectory[fc] = [server];
    this.insertServerFC(fc, server);
  }
};

ChunkDirectory.prototype.insertServerFC = function(fc, server) {
  if (server in this.servers) {
      this.servers[server] = this.servers.push(fc);
  } else {
    this.servers[server] = [fc];
  }
};

ChunkDirectory.prototype.removeServerFC = function(fc, server) {
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
