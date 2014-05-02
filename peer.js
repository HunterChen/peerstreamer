'use strict';

var zerorpc = require('zerorpc')
  , Server = require('./server').Server
  , ChunkStore = require('./chunk_store').ChunkStore
  , Reporter = require('./reporter').Reporter
  , Stream = require('./stream').Stream
  ;

var Peer = module.exports.Peer = function (name, port, masterport) {
  this.name = name;
  this.port = port;
  this.address = 'tcp://0.0.0.0:' + port;
  this.master = new Server('tcp://0.0.0.0:' + masterport, 'master');

  this.chunkStore = new ChunkStore();
  this.reporter = new Reporter(this.chunkStore, this.master, this);
  this.registerWithMaster();
  var stream = new Stream('file', 0, this.chunkStore, this.master);

  this.chunkStore.on('addedData', function(info) {
    console.log(info);
  });

  stream.advanceCursor(function(err, advanced){
    console.log(err, advanced);
  });
  
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

Peer.prototype.handleStream = function (filename, startingat, reply) {
  startingat = parseInt(startingat, 10);
  var current = startingat
    , client = this.master.getClient()
    ;
  var _getOne = function () {
    client.invoke('get', filename, current, function (err, res, more){
      reply(null, res, true);
      current++;
      _getOne();
    });
  }.bind(this);
  _getOne();
};

Peer.prototype.handleGet = function (filename, chunk, reply) {
  // TODO (is this from a peer or a child?)
  // if it's from a child I think we want to start streaming
  // until we get it,
  // But for peer we want to just reject.
  // But for now just check chunkstore
  console.log('Serving get for', filename, ':', chunk);
  reply(null, this.chunkStore.get(filename, chunk));
};

Peer.prototype._setupRpcServer = function () {
  this._server = new zerorpc.Server({
    stream: this.handleStream.bind(this)
  , ping: function (r) { r(); }
  , get: this.handleGet.bind(this)
  });
};


if (require.main === module) {
  var argv = require('optimist').demand(['port', 'name', 'masterport']).argv
    , p = new Peer(argv.name, argv.port, argv.masterport)
    ;

  p.start();
}