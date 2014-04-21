'use strict';
var zerorpc = require('zerorpc');

var Master = module.exports.Master = function (port) {
  this.port = port;
  this._setupRpcServer();
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