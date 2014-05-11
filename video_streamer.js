'use strict';

/* This is how data gets out of the system */

var childProcess = require('child_process')
  , zerorpc = require('zerorpc')
  ;

// Open up a child processs (vlc) and start streaming to its stdout

var VideoStreamer = function (getInterval, source, filename) {
  this.getInterval = parseInt(getInterval, 10);
  this.source = source;
  this.filename = filename;

  this.chunk = 0;
  this.streamId = null;

  //console.log(source);
  this.rpcClient = new zerorpc.Client();
  this.rpcClient.connect(source);
};

VideoStreamer.prototype.start = function () {
  this._spawnVlc();
  this._writeOne();
};

VideoStreamer.prototype._spawnVlc = function (ready) {
  // Hard code this jank
  var vlcPath = process.platform === 'darwin' ? '/Applications/VLC.app/Contents/MacOS/VLC' : 'vlc';
  //vlcPath = 'cat';
  this.vlc = childProcess.spawn(vlcPath, ['-'], {
    stdio: ['pipe', 1, 2]
  });
  process.on('SIGINT', this._shutdown.bind(this));
};

VideoStreamer.prototype._shutdown = function () {
  this.vlc.kill('SIGKILL');
  process.exit(0);
};

VideoStreamer.prototype._writeOne = function () {
  this.rpcClient.invoke('get', this.filename, this.chunk, true, this.streamId, function (err, data) {
    if (err) {
      throw new Error(err);
    }
    if (data.data === false) {
      // EOF.
      //this.vlc.wait();
    } else {
      console.log('Got chunk', this.chunk, data.data.substring(0,100));
      this.vlc.stdin.write(new Buffer(data.data, 'base64'));
      this.streamId = data.streamId;
      this.chunk++;
      setTimeout(this._writeOne.bind(this), this.getInterval);
    }
  }.bind(this));
};

if (require.main === module) {
  var argv = require('optimist').demand(['interval', 'source', 'filename']).argv
    , vs = new VideoStreamer(argv.interval, argv.source, argv.filename)
    ;
  vs.start();
}