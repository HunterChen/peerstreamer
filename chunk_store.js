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

/* Utility */
var LinkedListNode = function (next, previous, value) {
  this.next = next;
  this.previous = previous;
  this.value = value;
  this.locked = true; // cannot be deleted yet;
};

var StoreEntry = function (filename, chunk, llNode) {
  this.filename = filename;
  this.chunk = chunk;
  this.llNode = llNode;
  this.lastUsed = (new Date()).valueOf();
};

StoreEntry.prototype.touch = function () {
  this.lastUsed = (new Date()).valueOf();
};

StoreEntry.prototype.free = function () {
  this.llNode.locked = false;
};

StoreEntry.prototype.lock = function () {
  this.llNode.locked = true;
};

var ChunkStore = module.exports.ChunkStore = function (capacity) {

  this.chunks = {};
  this.count = 0;
  this.capacity = capacity;

  // For now, this acts as the data store
  // TODO persist to disk with cacheing layer.
  this._chunkData = {};

  this.lru = null; // linked list nodes
  this.mru = null; // linked list nodes
};
util.inherits(ChunkStore, events.EventEmitter);

ChunkStore.prototype._getKey = function (filename, chunk) {
  return filename + ':' + chunk;
};

ChunkStore.prototype.add = function (filename, chunk, data) {
  if (this.has(filename, chunk)) {
    // Because chunks immutable, we can just touch it.
    this.touch(filename, chunk);
  } else {
    var fc = this._getKey(filename, chunk);
    // Ok. create a node.
    var node = new LinkedListNode(null, null, fc)
      , entry = new StoreEntry(filename, chunk, node)
      ;

    if (this.mru === null) {
      // Then this.lru is null as well...
      this.mru = this.lru = node;
    } else {
      node.next = this.mru;
      this.mru.previous = node;
      this.mru = node;
    }
    this.chunks[fc] = entry;
    this._chunkData[fc] = data;
    this.count++;
  }

  // TODO should we still do this if we just touched?
  this.emit('addedData', {'filename':filename,'chunk':chunk,'data':data});

  this.trim();
};

ChunkStore.prototype.trim = function () {
  // Check count;
  while (this.count > this.capacity) {
    // Try to find one to delete, and delete it.
    // If I can't find one to delete, BREAK OUT OF THE LOOP
    // the next trim should clean up.
    // Find LRU.
    // Delete that sonofabitch.
    var node = this.lru
      , failed = false
      ;
    while (node.locked) {
      if (node.previous === null) {
        failed = true;
        break;
      } else {
        node = node.previous;
      }
    }
    if (failed) {
      console.log('Unable to delete anything, they are all locked! (', this.count, ')');
      break;
    }
    // If we're here, we have an unlocked node.
    var fc = node.value
      , entry = this.chunks[fc]
      ;

    // assertion
    if (!this.chunks.hasOwnProperty(fc)) {
      throw new Error('Trying to trim fc that is not present!' + fc);
    }


    if (this.lru === node) {
      this.lru = node.previous;
      if (this.mru === node) {
        // if there is one..
        this.mru = null;
      } else {
        node.previous.next = null;
      }
    } else {
      // it has a next
      if (this.mru === node) {
        // then it doesn't have a previous
        this.mru = node.next;
        node.next.previous = null;
      } else {
        // it is interior
        node.next.previous = node.previous;
        node.previous.next = node.next;
      }
    }

    delete this.chunks[fc];
    delete this._chunkData[fc];
    this.count--;
    this.emit('deletedData', {'filename':entry.filename,'chunk':entry.chunk,'data':null});
  }
};

ChunkStore.prototype.free = function (filename, chunk) {
  if (!this.has(filename, chunk)) {
    throw new Error('Attempting to free what we dont have! ' + filename + ':' + chunk);
  }
  var fc = this._getKey(filename, chunk)
    , entry = this.chunks[fc]
    ;
  entry.free();
  this.trim();
};

ChunkStore.prototype.get = function(filename, chunk) {
  var fc = this._getKey(filename, chunk);
  if (this.has(filename, chunk)) {
    var data = this._chunkData[fc];
    this.touch(filename, chunk);
    return data;
  } else {
    return null;
  }
};

ChunkStore.prototype.has = function (filename, chunk) {
  var fc = this._getKey(filename, chunk);
  return this.chunks.hasOwnProperty(fc);
};

ChunkStore.prototype.touch = function (filename, chunk) {
  if (!this.has(filename, chunk)) {
    throw new Error('Tried to touch a chunk we don\'t have');
  }
  // Find the entry;
  var fc = this._getKey(filename, chunk)
    , entry = this.chunks[fc]
    ;
  entry.touch();
  // Ok, now let's update the linked list.
  // We need to move this element to the head.
  var node = entry.llNode
    , next = node.next
    , previous = node.previous
    ;
  if (this.mru === node) {
    // then this is a NOOP!
  } else {
    // We know previous is not null,
    // because then node would be MRU..
    if (this.lru === node) {
      // Then next is null
      this.lru = previous;
      previous.next = null;
    } else {
      previous.next = next;
      next.previous = previous;
    }
    node.previous = null;
    node.next = this.mru;
    this.mru.previous = node;
    this.mru = node;
  }

};

ChunkStore.prototype.lruListToString = function () {
  // outputs LRU list as string;
  if (this.mru === null) {
    return '[M] -> 0 <- [L]';
  }
  var node = this.mru
    , out = '[M] -> ' + this.mru.value
    ;
  if (node === this.lru) {
    out += ' <- [L]';
  }
  while (node) {
    if (node.next) {
      out += ' <-> ' + node.next.value;
      if (node.next.previous !== node) {
        throw new Error('fuck fuck invariant busted');
      }
    }
    if (node.next === this.lru) {
      out += ' <- [L]';
    }
    node = node.next;
  }
  return out;
};

if (require.main === module) {
  var cs = new ChunkStore(20);
  cs.on('addedData', function (s) {
    console.log('added', s.filename, s.chunk, s.data);
  });
  cs.on('deletedData', function (s) {
    console.log('deleted', s.filename, s.chunk, s.data);
  });
  var f = 'f'
    , i
    ;
  for (i=0; i<30;i++) {
    cs.add(f,i, 'd' + i);
    console.log(cs.lruListToString());
  }
  for (i=0; i<5;i++) {
    var free = Math.floor(Math.random() * 25);
    if (cs.has(f, free)) {
      cs.free(f, free);
      console.log(cs.lruListToString());
    } else {
      i--;
    }
  }
  // Special case the head and tail to check
  if (cs.has(f, 0)) {
    cs.free(f, 0);
  }
  if (cs.has(f, 29)) {
    cs.free(f, 29);
  }
  // Free them all.
  for (i=0; i<30;i++) {
    if (cs.has(f, i)) {
      cs.free(f,i, 'd' + i);
    }
  }
  console.log(cs.lruListToString());


  console.log('\nNow checking out touch...');
  cs = new ChunkStore(20);
  for (i=0; i<10;i++) {
    cs.add(f,i, 'd' + i);
  }
  console.log(cs.lruListToString());
  cs.touch(f,9);
  console.log(cs.lruListToString());
  cs.touch(f,0);
  console.log(cs.lruListToString());
  cs.touch(f, 5);
  console.log(cs.lruListToString());
}
