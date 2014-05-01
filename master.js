'use strict';
var zerorpc = require('zerorpc')
  , ChildTracker = require('./child_tracker').ChildTracker
  , Server = require('./server').Server
  ;

var Master = module.exports.Master = function (port) {
  this.port = port;
  this._setupRpcServer();
  this.childTracker = new ChildTracker();

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

Master.prototype.handleGet = function (filename, chunknumber, reply) {
  var data = filename + ':' + chunknumber;
  reply(null, data);
};

Master.prototype.handleReport = function (filename, chunknumber, update, reply) {
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
  reply(null, 'ok');
};


if (require.main === module) {
  var argv = require('optimist').demand(['port']).argv
    , m = new Master(argv.port)
    ;

  m.start();
}