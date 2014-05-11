'use strict';

/*
  Listens on a chunk store and sends to who wants it
*/

var Reporter = module.exports.Reporter = function (node, chunkStore, recipient, fromWhom) {
  // chunkStore is a ChunkStore
  // recipient is a Server
  // fromWhome is a Server
  this.chunkStore = chunkStore;
  this.recipient = recipient;
  this.fromWhom = fromWhom;
  this.node = node;
  this.chunkStore.on('addedData', this.sendReport.bind(this, 'ADDED'));
  this.chunkStore.on('deletedData', this.sendReport.bind(this, 'DELETED'));
};

Reporter.prototype.sendReport = function (action, info) {
  if (! this.node.isOnSuper) {
    var report = {
      filename: info.filename
    , chunk: info.chunk
    , action: action
    , from: this.fromWhom.name
    };
    var client = this.recipient.getClient();
    client.invoke('report', report, function (err, response) {
      client.close();
    });
  }
};
