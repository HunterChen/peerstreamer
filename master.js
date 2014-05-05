'use strict';
var zerorpc = require('zerorpc')
  , ChildTracker = require('./child_tracker').ChildTracker
  , Server = require('./server').Server
  , ChunkDirectory = require('./chunk_directory').ChunkDirectory
  ;

var Master = module.exports.Master = function (port) {
  this.port = port;
  this._setupRpcServer();
  this.childTracker = new ChildTracker();
  this.ChunkDirectory = new ChunkDirectory();

  this.childTracker.on('serverStillAlive', function (c) {
    console.log('Still alive: ', c);
  });
  this.childTracker.on('childgone', function (c) {
    console.log('Child Dead: ', c);
  });
};

Master.prototype._setupRpcServer = function () {
  this._server = new zerorpc.Server({
    get: this.handleGet.bind(this)
  , report: this.handleReport.bind(this)
  , register: this.handleRegister.bind(this)
  , query: this.handleQuery.bind(this)
  });
};

Master.prototype.start = function () {
  this._server.bind('tcp://0.0.0.0:' + this.port);
  console.log('Master started on ' + this.port);
};

Master.prototype.handleGet = function (filename, chunk, fromChild, streamId, reply) {
  var data = filename + ':' + chunk;
  console.log("Serving get for", filename, chunk);
  reply(null, {data:data, streamId: null});
};

Master.prototype.handleReport = function (report, reply) {
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

Master.prototype.handleRegister = function (peername, peeraddress, reply) {
  console.log('Got register from', peername, peeraddress);
  var s = new Server(peeraddress, peername)
    , added = this.childTracker.add(s)
    ;
  console.log('Added child? ', added);
  reply(null, 'ok');
};

Master.prototype.handleQuery = function (filename, chunknumber, reply) {
  var serverNames = this.ChunkDirectory.getServers(filename, chunknumber)
    , servers = []
    ;
  serverNames.forEach(function(serverName) {
    servers.push(this.childTracker.getChild(serverName).asSerializableObject());
  }.bind(this));
  reply(null, servers);
};


if (require.main === module) {
  var argv = require('optimist').demand(['port']).argv
    , m = new Master(argv.port)
    ;

  m.start();
}