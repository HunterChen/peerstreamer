'use strict';

/*
  Listens on a chunk store and sends to who wants it
*/

var Reporter = module.exports.Reporter = function (chunkStore, recipient, fromWhom) {
  // chunkStore is a ChunkStore
  // recipient is a Server
  // fromWhome is a Server
  this.chunkStore = chunkStore;
  this.recipient = recipient;
  this.fromWhom = fromWhom;

  this.chunkStore.on('addedData', this.sendReport.bind(this, 'ADDED'));
  this.chunkStore.on('deletedData', this.sendReport.bind(this, 'DELETED'));
};

Reporter.prototype.sendReport = function (action, info) {
  var report = {
    filename: info.filename
  , chunk: info.chunk
  , action: action
  , from: this.fromWhom.name
  };
  this.recipient.getClient().invoke('report', report, function (err, response) {
    // TODO what do I do?
  });
};
