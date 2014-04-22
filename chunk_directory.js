'use strict';

/*
  Datastructure from mapping what servers have which filename:chunk pairs.
  Used by a master; updated in response to server reports, registers, and deaths.

  `server` in all these is a Server datastructure
*/

var ChunkDirectory = module.exports.ChunkDirectory = function () {
};

ChunkDirectory.prototype.insert = function (filename, chunk, server) {
};

ChunkDirectory.prototype.getServers = function (filename, chunk) {
};

ChunkDirectory.prototype.remove = function (filename, chunk, server) {
  // Removes association of this filename / chunk with the server
};

ChunkDirectory.prototype.removeServer = function (server) {
  // Removes all of the entries for this server.
};
