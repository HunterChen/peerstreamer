'use strict';

/*
   Datastructure for storing chunks, or anything
   that needs to be indexed by filename:chunk

   Probably a thin wrapping around a hash table.

    - Used by a peer to track actual chunk data
    - Used by the master maybe as part of the chunk_directory
      data structure to track the presence of a chunk?
*/

var ChunkStore = module.exports.ChunkStore = function () {
	this.chunks = {};
};

ChunkStore.prototype.add = function (filename, chunk, data) {
	var fc = filename + chunk;
	this.chunks[fc] = data;
};

ChunkStore.prototype.delete = function (filename, chunk, data) {
	var fc = filename + chunk;
	if (this.chunks[fc] === data) {
		delete this.chunks[fc];
	} else {
		//something went wrong, data delete requested is outdated? what do?
	}
};
