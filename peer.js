'use strict';

var zerorpc = require('zerorpc');

var Peer = module.exports.Peer = function (name, port, masterport) {
  this.name = name;
  this.port = port;
  this.masterport = masterport;

  this._setupRpcServer();
};

Peer.prototype.start = function () {
  this._server.bind('tcp://0.0.0.0:' + this.port);
  console.log('Peer ' + this.name + ' started on ' + this.port);

  this.master = new zerorpc.Client();
  this.master.connect('tcp://0.0.0.0:' + this.masterport);
};

Peer.prototype.handleStream = function (filename, startingat, reply) {
  startingat = parseInt(startingat, 10);
  var current = startingat;
  var _getOne = function () {
    this.master.invoke('get', filename, current, function (err, res, more){
      reply(null, res, true);
      current++;
      _getOne();
    });
  }.bind(this);
  _getOne();
};

Peer.prototype._setupRpcServer = function () {
  this._server = new zerorpc.Server({
    stream: this.handleStream.bind(this)
  });
};


if (require.main === module) {
  var argv = require('optimist').demand(['port', 'name', 'masterport']).argv
    , p = new Peer(argv.name, argv.port, argv.masterport)
    ;

  p.start();
}