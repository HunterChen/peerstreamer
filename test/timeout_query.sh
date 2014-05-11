### Start some shit
set -e
trap "kill 0" SIGINT SIGTERM EXIT

# start a master on 8000
MASTERPORT=8000
MASTER=tcp://0.0.0.0:$MASTERPORT
echo "STARTING MASTER ON $MASTERPORT"
node node.js --name master --port $MASTERPORT > test/testoutput/master.log &
MASTERPID=$!

SUPERMASTERPORT=8003
SUPERMASTER=tcp://0.0.0.0:$SUPERMASTERPORT
node node.js --name supermaster --port $SUPERMASTERPORT > test/testoutput/supermaster.log &
SUPERMASTERPID=$!

sleep 1;

# start a peer, Alice, on 8001
ALICEPORT=8001
ALICE=tcp://0.0.0.0:$ALICEPORT

ALICECHUNKS=test/chunks/alicechunks

rm -rf $ALICECHUNKS
mkdir $ALICECHUNKS

# startthem
echo "STARTING ALICE ON $ALICEPORT"
node node.js --port $ALICEPORT  --name alice  --supermaster $SUPERMASTER --master $MASTER --chunkdirectory $ALICECHUNKS > test/testoutput/alice.log &
ALICEPID=$!
sleep 1;


# Let's kill master
echo "Killing MASTER"
kill $MASTERPID
# sleep until master should notice (based on constants in child_tracker.js)
sleep 1



# HOKAY.
echo "Getting gameofthrones, 0 from alice"
  OUTPUT=`zerorpc -j -pj $ALICE get \"gameofthrones\" 0 true null | tail -n1`;
  SID1=`echo $OUTPUT | jq -r .streamId`;
  echo $OUTPUT;
  echo $SID1;

echo "All done"

# great.
wait;