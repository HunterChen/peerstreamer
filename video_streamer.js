'use strict';

/* This is how data gets out of the system */

var child_process = require('child_process')
  , zerorpc = require('zerorpc')
  ;

// Open up a child processs (vlc) and start streaming to its stdout

var VideoStreamer = function (getInterval, source, filename) {
  this.getInterval = getInterval;
  this.source = source;
  this.filename = filename;

  this.chunk = 0;
  this.streamId = null;

  this.rpcClient = new zerorpc.Client(source);
};

VideoStreamer.prototype.start = function () {
  this._spawnVlc(this._writeOne.bind(this));
};

VideoStreamer.prototype._spawnVlc = function (ready) {
  // Hard code this jank
  var vlcPath = process.platform === 'darwin' ? '/Applications/VLC.app/Contents/MacOS/VLC' : 'vlc';
  this.vlc = child_process.spawn(vlcPath, ['-']);
  process.on('SIGINT', this._killVlc.bind(this));
};

VideoStreamer.prototype._killVlc = function () {
  this.vlc.kill('SIGKILL');
};

VideoStreamer.prototype._writeOne = function () {
  this.rpcClient.invoke('get', this.filename, this.chunk, true, this.streamId, function (err, data) {
    if (err) {
      throw new Error(err);
    }
    if (data === false) {
      // EOF.
      this._killVlc();
    } else {
      this.stdout.write(data.data);
      this.streamId = data.streamId;
      this.chunk++;
      setTimeout(this._writeOne.bind(this), 1);
    }
  });
};

if (require.main === module) {
  var argv = require('optimist').demand(['interval', 'source', 'filename']).argv
    , vs = new VideoStreamer(argv.directory)
    ;
  vs.start();
};