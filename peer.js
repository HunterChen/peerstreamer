'use strict';

var zerorpc = require('zerorpc')
  , Server = require('./server').Server
  , ChunkStore = require('./chunk_store').ChunkStore
  , Reporter = require('./reporter').Reporter
  , Stream = require('./stream').Stream
  , StreamManager = require('./stream_manager').StreamManager
  ;

var Peer = module.exports.Peer = function (name, port, masterport) {
  this.name = name;
  this.port = port;
  this.address = 'tcp://0.0.0.0:' + port;
  this.master = new Server('tcp://0.0.0.0:' + masterport, 'master');

  this.chunkStore = new ChunkStore();
  this.reporter = new Reporter(this.chunkStore, this.master, this);
  this.registerWithMaster();

  this.streamManager = new StreamManager(this.chunkStore, this);

  this._setupRpcServer();
};

Peer.prototype.start = function () {
  this._server.bind('tcp://0.0.0.0:' + this.port);
  console.log('Peer ' + this.name + ' started on ' + this.port);

};

Peer.prototype.registerWithMaster = function() {
  console.log('Sending register to master', this.master.address);
  this.master.getClient().invoke('register', this.name, this.address, function (err, response) {
    // TODO anything?
  });
};

Peer.prototype.handleGet = function (filename, chunk, fromChild, streamId, reply) {
  console.log('GET: ', filename, ':', chunk, fromChild, streamId);
  if (fromChild) {
    console.log('Serving get from child', filename, ':', chunk);
    // TODO what if stream is null
    var stream = this.streamManager.get(filename, chunk, streamId);
    if (chunk < stream.position) {
      return reply('Chunk requested for file', filename, ':', chunk, 'is less than stream', streamId, 'position', stream.position);
    }
    var registered = stream.registerPositionCallback(chunk, function () {
      var data = this.chunkStore.get(filename, chunk);
      stream.advancePosition();
      reply(null, {data:data, streamId: stream.id});
    }.bind(this));
    if (!registered) {
      // Then the callback to registerPositionCallback will NOT
      // be called, so we're not calling reply twice.
      reply('Already Waiting for', filename, ':', chunk, ' stop sending duplicates');
    }

  } else {
    // It's a peer, so just give what we have. Perform our best.
    reply(null, {data:this.chunkStore.get(filename, chunk), streamId: null});
  }
};

Peer.prototype._setupRpcServer = function () {
  this._server = new zerorpc.Server({
    ping: function (r) { r(); }
  , get: this.handleGet.bind(this)
  });
};


if (require.main === module) {
  var argv = require('optimist').demand(['port', 'name', 'masterport']).argv
    , p = new Peer(argv.name, argv.port, argv.masterport)
    ;

  p.start();
}