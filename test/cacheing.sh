### Start some shit
set -e
trap "kill 0" SIGINT SIGTERM EXIT

# start a master on 8000
MASTERPORT=8000
MASTER=tcp://0.0.0.0:$MASTERPORT
echo "STARTING MASTER ON $MASTERPORT"
node node.js --name master --port $MASTERPORT > test/testoutput/master.log &
sleep 1;

# start a peer, Alice, on 8001
ALICEPORT=8001
BOBPORT=8002
ALICE=tcp://0.0.0.0:$ALICEPORT
BOB=tcp://0.0.0.0:$BOBPORT

ALICECHUNKS=test/chunks/alicechunks
BOBCHUNKS=test/chunks/bobchunks

rm -rf $ALICECHUNKS
rm -rf $BOBCHUNKS

mkdir $ALICECHUNKS
mkdir $BOBCHUNKS

# startthem
echo "STARTING ALICE ON $ALICEPORT"
node node.js --port $ALICEPORT  --name alice  --master $MASTER --chunkdirectory $ALICECHUNKS > test/testoutput/alice.log &
ALICEPID=$!

echo "STARTING BOB ON $BOBPORT"
node node.js --port $BOBPORT  --name bob  --master $MASTER --chunkdirectory $BOBCHUNKS > test/testoutput/bob.log &
BOBPID=$!

sleep 1;

# HOKAY.
echo "Getting gameofthrones, 0 from alice"
  OUTPUT=`zerorpc -j -pj $ALICE get \"gameofthrones\" 0 true null | tail -n1`;
  SID1=`echo $OUTPUT | jq -r .streamId`;
  echo $OUTPUT;
  echo $SID1;

echo "Geting gameofthrones 1..50 from alice (to pop the cache)"
for i in {1..50}
do
  echo `zerorpc -j -pj $ALICE get \"gameofthrones\" $i true \"$SID1\" | tail -n1`;
done

# HOKAY.
echo "Getting gameofthrones, 0 from bob. SHOULD come from the master, because alice doesn't have it"
  OUTPUT=`zerorpc -j -pj $BOB get \"gameofthrones\" 0 true null | tail -n1`;
  SID1=`echo $OUTPUT | jq -r .streamId`;
  echo $OUTPUT;

echo "Great."

echo "Killing Alice"
kill $ALICEPID
sleep 1

echo "bringing alice back up, she should remember what she had in her cache"
node node.js --port $ALICEPORT  --name alice  --master $MASTER --chunkdirectory $ALICECHUNKS > test/testoutput/alice.log &
ALICEPID=$!

echo "Getting gameofthrones, 25 from alice. SHOULD come from ALICE, because SHE HAS IT IN CACHE"
  OUTPUT=`zerorpc -j -pj $ALICE get \"gameofthrones\" 25 true null | tail -n1`;
  echo $OUTPUT;


echo "All done"

# great.
wait;