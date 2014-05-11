### Start some shit
set -e
trap "kill 0" SIGINT SIGTERM EXIT

# start a master on 8000
MASTERPORT=8000
echo "STARTING MASTER ON $MASTERPORT"
node node.js --name master --port $MASTERPORT > test/testoutput/master.log &
MASTERPID=$!
sleep 1;


# start a peer, Alice, on 8001
ALICEPORT=8001
ALICE=tcp://0.0.0.0:$ALICEPORT

ALICECHUNKS=test/chunks/alicechunks


# startthem
echo "STARTING ALICE ON $ALICEPORT"
node node.js --port $ALICEPORT  --name alice  --masterport $MASTERPORT --chunkdirectory $ALICECHUNKS  > test/testoutput/alice.log &
ALICEPID=$!

sleep 1;

# HOKAY.
echo "Getting gameofthrones, 1000 from alice"
  OUTPUT=`zerorpc -j -pj $ALICE get \"gameofthrones\" 1000 true null | tail -n1`;
  SID1=`echo $OUTPUT | jq -r .streamId`;
  echo $OUTPUT;
  echo $SID1;

sleep 1;

echo "Geting gameofthrones 981..1020 from alice"
for i in {981..1000}
do
  echo `zerorpc -j -pj $ALICE get \"gameofthrones\" $i true \"$SID1\" | tail -n1`;
done


echo 'ALL DONE'
wait;