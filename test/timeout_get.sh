### Start some shit
set -e
trap "kill 0" SIGINT SIGTERM EXIT

# start a master on 8000
MASTERPORT=8000
MASTER=tcp://0.0.0.0:$MASTERPORT
echo "STARTING MASTER ON $MASTERPORT"
node node.js --name master --port $MASTERPORT > test/testoutput/master.log &
MASTERPID=$!
sleep 1;


SUPERMASTERPORT=8002
SUPERMASTER=tcp://0.0.0.0:$SUPERMASTERPORT
echo "STARTING SUPERMASTER ON $SUPERMASTERPORT"
node node.js --name supermaster --port $SUPERMASTERPORT > test/testoutput/supermaster.log &
sleep 1;

# start a peer, Alice, on 8001
ALICEPORT=8001
ALICECHUNKS=test/chunks/alicechunks

rm -rf $ALICECHUNKS
mkdir $ALICECHUNKS

ALICE=tcp://0.0.0.0:$ALICEPORT


# startthem
echo "STARTING ALICE ON $ALICEPORT"
node node.js --port $ALICEPORT  --name alice  --master $MASTER --supermaster $SUPERMASTER --chunkdirectory $ALICECHUNKS > test/testoutput/alice.log &
ALICEPID=$!

sleep 1;

# HOKAY.
echo "Getting gameofthrones, 0 from alice"
  OUTPUT=`zerorpc -j -pj $ALICE get \"gameofthrones\" 0 true null | tail -n1`;
  SID1=`echo $OUTPUT | jq -r .streamId`;
  echo $OUTPUT;
  echo $SID1;

sleep 1;
kill $MASTERPID

echo "Geting gameofthrones 15..20 from alice"
for i in {1..20}
do
  echo `zerorpc -j -pj $ALICE get \"gameofthrones\" $i true \"$SID1\" | tail -n1`;
done


sleep 3;

# start a master on 8000
MASTERPORT=8000
echo "RESTARTING MASTER ON $MASTERPORT"
node node.js --name master --port $MASTERPORT > test/testoutput/master.log &
MASTERPID=$!
sleep 1;


echo "Getting gameofthrones, 50 from alice"
  OUTPUT=`zerorpc -j -pj $ALICE get \"gameofthrones\" 50 true null | tail -n1`;
  SID1=`echo $OUTPUT | jq -r .streamId`;
  echo $OUTPUT;
  echo $SID1;


echo 'ALL DONE'
wait;