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
  , fs = require('fs')
  , path = require('path')
  , LRU = require('lru-cache')
  ;

// location enum
var LOCATION_CACHE = 0 //'inside the inner cache'
  , LOCATION_PENDING = 1 //'removed from inner cache, write pending'
  , LOCATION_DISK = 2 //'inside the disk'
  , LOCATION_NONE = -1
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

  this.persisted = false;
  this.deleted = false;
  this.chunkPath = null;
  this.location = LOCATION_NONE;
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

var ChunkStore = module.exports.ChunkStore = function (capacity, directory) {

  this.chunks = {};
  this.count = 0;
  this.capacity = capacity;
  this.hotCacheSize = 5;
  this.directory = directory;

  this.hotCache = LRU({
    max: this.hotCacheSize
  , dispose: this.handleHotCacheEvict.bind(this)
  }); 
  this.pendingWriteChunks = {}; // pending store.
  this.sequenceNumber = 0; // for uniqueness on file writes
  this.pendingDeletes = [];

  this.lru = null; // linked list nodes
  this.mru = null; // linked list nodes

  setInterval(this.sync.bind(this), 500); // too fast.
};
util.inherits(ChunkStore, events.EventEmitter);

ChunkStore.prototype._getKey = function (filename, chunk) {
  return filename + ':' + chunk;
};

ChunkStore.prototype._generateChunkPath = function (filename, chunk) {
  var chunkPath = filename + ':' + chunk + ':' + this.sequenceNumber + '.chunk';
  this.sequenceNumber++;
  return path.join(this.directory, chunkPath);
};

ChunkStore.prototype.add = function (filename, chunk, data) {
  /*
  on put,
     shove it into the in-memory cache
     start writing it to disk
     once its written,
       mark it as persisted
       if it is present in the `pending` dictionary, remove it
        and update that items location
  */
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

    this.hotCache.set(fc, data);
    entry.location = LOCATION_CACHE;
    this.chunks[fc] = entry;

    this.writeChunk(filename, chunk, data, function (err, chunkPath) {
      // Ok, now we can persist it.
      if (err) {
        // TODO what do we do?
        // explode for now...
        throw err;
      }
      entry.chunkPath = chunkPath;
      entry.persisted = true;
      // Check if it is in the pendingWriteChunks, delete if so,
      // and flip its location to disk
      if (this.pendingWriteChunks.hasOwnProperty(fc)) {
        // That means that the location is LOCATION_PENDING
        // by deleting it, we set location to LOCATION_DISK
        // assertion
        if (entry.location !== LOCATION_PENDING) {
          throw new Error('Found ' + fc + ' in pendingWriteChunks, but its location is' + entry.location);
        }
        delete this.pendingWriteChunks[fc];
        entry.location = LOCATION_DISK;
      }
    }.bind(this));
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

    /*
    on delete,
       remove from datastructure and put in delete queue
    */
    entry.deleted = true;
    if (entry.location === LOCATION_PENDING) {
      // Then on write, location will be set to disk,
      // and it will be cleared from the pending dictionary
      // for us.
      delete this.chunks[fc];
      this.pendingDeletes.push(entry);
    } else if (entry.location === LOCATION_CACHE) {
      // We can't delete it from this.chunks, yet,
      // because then handleHotCacheEvict won't be able
      // to find it. But delete it from the cache,
      // and let handleHotCacheEvict take care of cleaning up
      this.hotCache.del(fc);
    } else if (entry.location === LOCATION_DISK) {
      // Schedule the deletion
      delete this.chunks[fc];
      this.pendingDeletes.push(entry);
    }

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

ChunkStore.prototype.lock = function (filename, chunk) {
  if (!this.has(filename, chunk)) {
    throw new Error('Attempting to lock what we dont have! ' + filename + ':' + chunk);
  }
  var fc = this._getKey(filename, chunk)
    , entry = this.chunks[fc]
    ;
  entry.lock();
};

ChunkStore.prototype.get = function(filename, chunk) {
  /*
  on get,
     check where it is (CACHE, PENDING, DISK), get it,
     and put it in the cache, updating position accordingly
     if it is on DISK, read it,
        put it in cache, and set location to CACHE
     if it is in CACHE, get it.
     if it is in PENDING, get it,
        __delete it from pending__
        put it in cache, and set location to CACHE.
  */
  if (this.has(filename, chunk)) {
    var fc = this._getKey(filename, chunk)
      , entry = this.chunks[fc]
      , data
      ;

    // could use switch / case, but fine.
    if (entry.location === LOCATION_CACHE) {
      data = this.hotCache.get(fc);
    } else if (entry.location === LOCATION_DISK) {
      data = this.readChunk(entry.chunkPath);
      this.hotCache.set(fc, data);
      entry.location = LOCATION_CACHE;
    } else if (entry.location === LOCATION_PENDING) {
      data = this.pendingWriteChunks[fc];
      delete this.pendingWriteChunks[fc];
      this.hotCache.set(fc, data);
      entry.location = LOCATION_CACHE;
    } else {
      throw new Error('Get for chunk with no location!' + fc);
    }
    if (!data) {
      throw new Error('Had chunk, but could not find data!' + fc);
    }
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

ChunkStore.prototype.handleHotCacheEvict = function (fc, data) {
  /*
   on eviction from the in-memory cache,
     if it is not persisted, put it in the pending dictionary,
       set LOCATION_PENDING
       it will be removed when the write finishes,
     otherwise, if it is persisted, set LOCATION_DISK.
  */
  if (!this.chunks.hasOwnProperty(fc)) {
    throw new Error('Element ' + fc + ' evicted from the cache, but were not tracking it!');
  }
  var entry = this.chunks[fc];
  if (entry.deleted) {
    // Well, we need to clean up then
    delete this.chunks[fc];
    this.pendingDeletes.push(entry);
  } else if (entry.persisted) {
    // Great.
    entry.location = LOCATION_DISK;
  } else {
    // Well, this means that it is currently being written to disk.
    // but it's been evicted from the cache! uh oh. store it in pendingWriteChunks
    // and set location to pending
    this.pendingWriteChunks[fc] = data;
    entry.location = LOCATION_PENDING;
  }
};

ChunkStore.prototype.writeChunk = function (filename, chunk, data, callback) {
  // Callback gets called with (err, filename);
  var chunkPath = this._generateChunkPath(filename, chunk);
  fs.writeFile(chunkPath, data, function (err) {
    return callback(err, chunkPath);
  });
};

ChunkStore.prototype.readChunk = function (chunkPath) {
  // TODO this needs to be async
  return fs.readFileSync(chunkPath, {encoding:'ascii'});
};


ChunkStore.prototype.sync = function () {
  /*
   on sync,
      first write out our data structure, for all entries `persisted`.
      the, delete what is in our delete queue.
  */
  var myPendingDeletes = this.pendingDeletes;
  this.pendingDeletes = []; // not a clear, because we want outs to be OK
  // I now have responsibility for deleting these files or,
  // if they are not yet peresiste, putting that off to the next sync.

  // First write out our datastructure.
  // TODO (this should be mutexed?)
  // TODO this should be async?
  this._writeOutDatastructure();
  this._doDeletes(myPendingDeletes);
};

ChunkStore.prototype._writeOutDatastructure = function () { 
  var outObj = {}
    , fc
    , entry
    ;
  for (fc in this.chunks) {
    if (this.chunks.hasOwnProperty(fc)) {
      entry = this.chunks[fc];
      if (entry.persisted && !entry.deleted) {
        outObj[path.basename(entry.chunkPath)] = {
          filename: entry.filename
        , chunk: entry.chunk
        , lastUsed: entry.lastUsed
        };
      }
    }
  }
  // TODO async
  var manifestPath = path.join(this.directory, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(outObj));
};

ChunkStore.prototype._doDeletes = function (entries) {
  // TODO: make this async
  entries.forEach(function (entry) {
    if (!entry.persisted) {
      // There is still a write ongoing for this.
      // so just put it back
      this.pendingDeletes.push(entry);
    } else {
      fs.unlinkSync(entry.chunkPath);
    }
  }.bind(this));
};

if (require.main === module) {
  var cs = new ChunkStore(20, 'chunkstoredev');
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
  setTimeout(cs.sync.bind(cs),100);
  
  console.log('\nNow checking out touch...');
  cs = new ChunkStore(20, 'chunkstoredev');
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
