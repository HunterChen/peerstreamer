'use strict';

var zerorpc = require('zerorpc')
  , ChildTracker = require('./child_tracker').ChildTracker
  , Server = require('./server').Server
  , ChunkDirectory = require('./chunk_directory').ChunkDirectory
  , ChunkStore = require('./chunk_store').ChunkStore
  , Reporter = require('./reporter').Reporter
  , Stream = require('./stream').Stream
  , StreamManager = require('./stream_manager').StreamManager
  , VideoDatabase = require('./video_database').VideoDatabase
  ;

var CHUNK_STORE_CAPACITY = 50;

var Node = module.exports.Node = function (options) {
  this.port = options.port;
  this.name = options.name;
  this.address = 'tcp://0.0.0.0:' + this.port;

  this._setupRpcServer();

  this.childTracker = new ChildTracker();
  this.ChunkDirectory = new ChunkDirectory();
  this.chunkStore = new ChunkStore(CHUNK_STORE_CAPACITY);

  if (options.masterport) {
    this.master = new Server('tcp://0.0.0.0:' + options.masterport, 'master');
    this.reporter = new Reporter(this.chunkStore, this.master, this);
    this.registerWithMaster();

    this.streamManager = new StreamManager(this.chunkStore, this);
    this.hasMaster = true;
  } else {
    this.hasMaster = false;
    if (options.videodatabase) {
      // create one.
      this.videoDatabase = new VideoDatabase(options.videodatabase)
    } else {
      this.videoDatabase = null;
    }
  }

  this.childTracker.on('serverStillAlive', function (c) {
    console.log('Still alive: ', c);
  });
  
  this.childTracker.on('childgone', function (c) {
    console.log('Child Dead: ', c);
    this.ChunkDirectory.removeServer(c.name);
  }.bind(this));

};

Node.prototype.start = function () {
  this._server.bind('tcp://0.0.0.0:' + this.port);
  console.log('Node started on ' + this.port);
};

Node.prototype.registerWithMaster = function() {
  console.log('Sending register to master', this.master.address);
  this.master.getClient().invoke('register', this.name, this.address, function (err, response) {
    // TODO anything?
  });
};


Node.prototype._setupRpcServer = function () {
  this._server = new zerorpc.Server({
    get: this.handleGet.bind(this)
  , report: this.handleReport.bind(this)
  , register: this.handleRegister.bind(this)
  , query: this.handleQuery.bind(this)
  , ping:  function (r) { r(); }
  });
};

Node.prototype.handleGet = function (filename, chunk, fromChild, streamId, reply) {
  if (!this.hasMaster) {
    console.log('Serving get for', filename, chunk);
    if (this.videoDatabase) {
      return this.videoDatabase.get(filename, chunk, function (err, data) {
        reply(err, {data:data, streamId: null})
      });
    } else {
      var data = filename + ':' + chunk;
      return reply(null, {data:data, streamId: null});
    }
  }

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


Node.prototype.handleReport = function (report, reply) {
  console.log('Got report:', report);
  if (!this.childTracker.hasChild(report.from)) {
    //TODO: handle this better
    return reply('child not here', 'nok');
  }

  if (report.action === 'ADDED') {
    this.ChunkDirectory.insert(report.filename, report.chunk, report.from);
  } else if ( report.action === 'DELETED') {
    this.ChunkDirectory.remove(report.filename, report.chunk, report.from);
  } else {
    //WHAT?
    throw new Error('Unexpected report action: ' + report.action);
  }
  reply(null, 'ok');
};

Node.prototype.handleRegister = function (peername, peeraddress, reply) {
  console.log('Got register from', peername, peeraddress);
  var s = new Server(peeraddress, peername)
    , added = this.childTracker.add(s)
    ;
  if (! added) { // then we already had this child.. flap!
    this.ChunkDirectory.removeServer(peername);
    console.log('Child flapped');
  }
  console.log('Added child? ', added);
  reply(null, 'ok');
};


Node.prototype.handleQuery = function (filename, chunknumber, reply) {
  var serverNames = this.ChunkDirectory.getServers(filename, chunknumber)
    , servers = []
    ;
  serverNames.forEach(function(serverName) {
    servers.push(this.childTracker.getChild(serverName).asSerializableObject());
  }.bind(this));
  reply(null, servers);
};


if (require.main === module) {
  var argv = require('optimist')
    .demand(['port', 'name'])
    .describe('masterport', 'optionally specify master')
    .describe('videodatabase', 'specificy directory to use as video database for masterless nodes')
    .argv
    , n = new Node({
      name: argv.name
    , port: argv.port
    , masterport: argv.masterport
    , videodatabase: argv.videodatabase
    })
    ;

  n.start();
}
