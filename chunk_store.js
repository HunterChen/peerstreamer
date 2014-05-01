'use strict';

/*
   Datastructure for storing chunks, or anything
   that needs to be indexed by filename:chunk

   Probably a thin wrapping around a hash table.

    - Used by a peer to track actual chunk data
    - Used by the master maybe as part of the chunk_directory
      data structure to track the presence of a chunk?
*/


var events = require('events')
  , util = require('util')
  ;

var ChunkStore = module.exports.ChunkStore = function () {
  this.chunks = {};
};
util.inherits(ChunkStore, events.EventEmitter);

ChunkStore.prototype.add = function (filename, chunk, data) {
  var fc = filename + chunk;
  this.chunks[fc] = data;
  this.emit('addedData', {'filename':filename,'chunk':chunk,'data':data});
};

ChunkStore.prototype.delete = function (filename, chunk, data) {
  var fc = filename + chunk;
  if (this.chunks[fc] === data) {
    delete this.chunks[fc];
    this.emit('deletedData', {'filename':filename,'chunk':chunk,'data':data});
  } else {
    //something went wrong, data delete requested is outdated? what do?
  }
};

ChunkStore.prototype.get = function(filename, chunk) {
  if (this.chunks.hasOwnProperty(filename+chunk)) {
    return this.chunks[filename+chunk];
  } else {
    return null;
  }
};


if (require.main === module) {
  var cs = new ChunkStore();
  cs.on('addedData', function (s) {
    console.log('added', s.filename, s.chunk, s.data);
  });
  cs.on('deletedData', function (s) {
    console.log('deleted', s.filename, s.chunk, s.data);
  });
  var f = 'file1';
  cs.add(f,1, 'd1');
  cs.add(f,2, 'd2');
  cs.delete(f, 1, 'd2');
  cs.delete(f, 1, 'd1');
}