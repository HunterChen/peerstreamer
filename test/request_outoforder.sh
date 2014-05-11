### Start some shit
trap "kill 0" SIGINT SIGTERM EXIT

# start a master on 8000
MASTERPORT=8000
MASTER=tcp://0.0.0.0:$MASTERPORT
echo "STARTING MASTER ON $MASTERPORT"
node master.js --port $MASTERPORT > testoutput/master.log &
sleep 1;

# start a peer, Alice, on 8001
ALICEPORT=8001

ALICE=tcp://0.0.0.0:$ALICEPORT


# startthem
echo "STARTING ALICE ON $ALICEPORT"
node peer.js --port $ALICEPORT  --name alice  --master $MASTER > testoutput/alice.log &
ALICEPID=$!

sleep 1;

# HOKAY.
echo "Getting gameofthrones, 0 from alice"
  OUTPUT=`zerorpc -j -pj $ALICE get \"gameofthrones\" 0 true null | tail -n1`;
  SID1=`echo $OUTPUT | jq -r .streamId`;
  echo $OUTPUT;
  echo $SID1;

echo "Geting gameofthrones 3 from alice"
#This should return an error (?) rather than timing out.
ERR=`zerorpc -j -pj $ALICE get \"gameofthrones\" 3 true \"$SID1\"`;

echo $ERR


wait;