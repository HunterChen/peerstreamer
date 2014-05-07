# have a server try to get a chunk from another after that other dies
### Start some shit
set -e
trap "kill 0" SIGINT SIGTERM EXIT

# start a master on 8000
MASTERPORT=8000
echo "STARTING MASTER ON $MASTERPORT"
node master.js --port $MASTERPORT > test/testoutput/master.log &
sleep 1;

# start a peer, Alice, on 8001
ALICEPORT=8001
BOBPORT=8002

ALICE=tcp://0.0.0.0:$ALICEPORT
BOB=tcp://0.0.0.0:$BOBPORT

# startthem
echo "STARTING ALICE ON $ALICEPORT"
node peer.js --port $ALICEPORT  --name alice  --masterport $MASTERPORT > test/testoutput/alice.log &
ALICEPID=$!

echo "STARTING BOB ON $BOBPORT"
node peer.js --port $BOBPORT    --name bob    --masterport $MASTERPORT > test/testoutput/bob.log &
BOBPID=$!

sleep 1;

# HOKAY.
echo "Getting gameofthrones, 0 from alice"
  OUTPUT=`zerorpc -j -pj $ALICE get \"gameofthrones\" 0 true null | tail -n1`;
  echo $OUTPUT;

# Now kill her an d
kill $ALICEPID
echo "Getting gameofthrones, 0 from bob, who should get it from ALICE, but ALICE is dead."
  OUTPUT=`zerorpc -j -pj $BOB get \"gameofthrones\" 0 true null | tail -n1`;
  echo $OUTPUT

wait;