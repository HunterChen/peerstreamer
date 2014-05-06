### Start some shit
set -e
trap "kill 0" SIGINT SIGTERM EXIT

# start a master on 8000
MASTERPORT=8000
echo "STARTING MASTER ON $MASTERPORT"
node master.js --port $MASTERPORT > testoutput/master.log &
sleep 1;

# start a peer, Alice, on 8001
ALICEPORT=8001
BOBPORT=8002
CARLOSPORT=8003

ALICE=tcp://0.0.0.0:$ALICEPORT
BOB=tcp://0.0.0.0:$BOBPORT
CARLOS=tcp://0.0.0.0:$CARLOSPORT


# startthem
echo "STARTING ALICE ON $ALICEPORT"
node peer.js --port $ALICEPORT  --name alice  --masterport $MASTERPORT > testoutput/alice.log &

echo "STARTING BOB ON $BOBPORT"
node peer.js --port $BOBPORT    --name bob    --masterport $MASTERPORT > testoutput/bob.log &

echo "STARTING CARLOS ON $CARLOSPORT"
node peer.js --port $CARLOSPORT --name carlos --masterport $MASTERPORT > testoutput/carlos.log &


sleep 1;

# HOKAY.
echo "Getting gameofthrones, 0 from alice"
  OUTPUT=`zerorpc -j -pj $ALICE get \"gameofthrones\" 0 true null | tail -n1`;
  SID1=`echo $OUTPUT | jq -r .streamId`;
  echo $OUTPUT;
  echo $SID1;

echo "Geting gameofthrones 1..5 from alice"
for i in {1..5}
do
  echo `zerorpc -j -pj $ALICE get \"gameofthrones\" $i true \"$SID1\" | tail -n1`;
done


echo "Getting gameofthrones 10..6 from alice, out of order parallel"
for i in {10..6}
do
  echo `zerorpc -j -pj $ALICE get \"gameofthrones\" $i true \"$SID1\" | tail -n1` &
  OOOGA[$i]=$!;
done

for ooo in "${OOOGA[@]}"
do
  wait $ooo
done

echo "Great."

echo "Getting gameofthrones, 5 from bob, who should get it from ALICE"
  OUTPUT=`zerorpc -j -pj $BOB get \"gameofthrones\" 5 true null | tail -n1`;
  SID2=`echo $OUTPUT | jq -r .streamId`;
  echo $OUTPUT;
  echo $SID2;

echo "Geting gameofthrones 6..25 from bob, he should get some from Alice, then switch to master"
  for i in {6..25}
  do
    echo `zerorpc -j -pj $BOB get \"gameofthrones\" $i true \"$SID2\" | tail -n1`;
  done


echo "Getting gameofthrones, 0 from carlos, who should get it from ALICE"
  OUTPUT=`zerorpc -j -pj $CARLOS get \"gameofthrones\" 0 true null | tail -n1`;
  SID3=`echo $OUTPUT | jq -r .streamId`;
  echo $OUTPUT;
  echo $SID3;

echo "Geting gameofthrones 1..50 from carlos, he should get some from Alice, then switch to bob when alice runs out then switch to the master when bob runs out"
  for i in {1..50}
  do
    echo `zerorpc -j -pj $CARLOS get \"gameofthrones\" $i true \"$SID3\" | tail -n1`;
  done


# great.
wait;