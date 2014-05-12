Peerstreamer
=============

peer to peer fast streaming using node.js

 - you need libzmq
 - python zerorpc

Then, `npm install` will install the dependencies listed in `package.json`


Setting Up
-----------

_this will all be described on one machine, but works equally well on multiple machines_

 1. First, you need a video source

    - create a video database: `mkdir video_data`
    - add a file: `bin/split_video -d video_data -s $MY_AWESOME_MOVIE -c 1m -f myawesomemovie`
    - run the video source: `node node.js --name source --port 7999 --videodatabase video_data --ip 0.0.0.0`

 2. Check that you can stream from this source:
 
    - `node video_streamer.js --source tcp://0.0.0.0:7999 --filename myawesomemovie --interval 100`

 3. Add nodes:
    - ```
      node node.js \
      --name <node name, must be unique for nodes sharing a master> \
      --port <what port should this node listen on> \
      --ip   <what is the ip address of this node> \
      --chunkdirectory <where should this nodes ChunkStore persist?> \
      --master <full address of master> \
      --supermaster <full address of supermaster, if one is setup> \
      ```

Example:
-----------

 - video source: `node node.js --name source --port 7999 --videodatabase video_data --ip 0.0.0.0`
 - make chunk directories: `mkdir chunks/mit chunks/harvard chunks/ben chunks/alyssa chunks/john chunks/lawrence`
 - level 1 node (1): `node node.js --name mit --port 8000 --ip 0.0.0.0 --chunkdirectory chunks/mit --master tcp://0.0.0.0:7999`
 - level 1 node (2): `node node.js --name harvard --port 8001 --ip 0.0.0.0 --chunkdirectory chunks/harvard --master tcp://0.0.0.0:7999`
 - level 2 node (1): `node node.js --name ben --port 8002 --ip 0.0.0.0 --chunkdirectory chunks/ben --master tcp://0.0.0.0:8000 --supermaster tcp://0.0.0.0:7999`
 - level 2 node (2): `node node.js --name alyssa --port 8002 --ip 0.0.0.0 --chunkdirectory chunks/ben --master tcp://0.0.0.0:8000 --supermaster tcp://0.0.0.0:7999`
 - level 2 node (3): `node node.js --name john --port 8002 --ip 0.0.0.0 --chunkdirectory chunks/john --master tcp://0.0.0.0:8001 --supermaster tcp://0.0.0.0:7999`
 - level 2 node (4): `node node.js --name lawrence --port 8002 --ip 0.0.0.0 --chunkdirectory chunks/lawrence --master tcp://0.0.0.0:8001 --supermaster tcp://0.0.0.0:7999`
 
 - Then use `video_streamer.js` to stream from any of them. They will cooperate, sharing among peers when possible.
