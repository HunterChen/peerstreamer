### Start some shit
set -e
trap "kill 0" SIGINT SIGTERM EXIT

# start a master on 8000
MASTERPORT=8000
echo "STARTING MASTER ON $MASTERPORT"
node node.js --name master --port $MASTERPORT > test/testoutput/master.log &
sleep 1;

# start a peer, Alice, on 8001
ALICEPORT=8001
BOBPORT=8002
CARLOSPORT=8003

ALICE=tcp://0.0.0.0:$ALICEPORT
BOB=tcp://0.0.0.0:$BOBPORT
CARLOS=tcp://0.0.0.0:$CARLOSPORT

# clear alice bob and carlos cache directories
ALICECHUNKS=test/chunks/alicechunks
BOBCHUNKS=test/chunks/bobchunks
CARLOSCHUNKS=test/chunks/carloschunks

rm -rf $ALICECHUNKS
rm -rf $BOBCHUNKS
rm -rf $CARLOSCHUNKS

mkdir $ALICECHUNKS
mkdir $BOBCHUNKS
mkdir $CARLOSCHUNKS

# startthem
echo "STARTING ALICE ON $ALICEPORT"
node node.js --port $ALICEPORT  --name alice  --masterport $MASTERPORT --chunkdirectory $ALICECHUNKS  > test/testoutput/alice.log &
ALICEPID=$!

echo "STARTING BOB ON $BOBPORT"
node node.js --port $BOBPORT    --name bob    --masterport $MASTERPORT --chunkdirectory $BOBCHUNKS    > test/testoutput/bob.log &
BOBPID=$!

echo "STARTING CARLOS ON $CARLOSPORT"
node node.js --port $CARLOSPORT --name carlos --masterport $MASTERPORT --chunkdirectory $CARLOSCHUNKS > test/testoutput/carlos.log &
CARLOSPID=$!

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


# Let's kill some things
echo "Killing ALICE (off with her head)"
kill $ALICEPID
# sleep until master should notice (based on constants in child_tracker.js)
sleep 6

# Alice had GOT 0 - 20, so let's have Bob ask for game of thrones 0, Server
# Should _not_ send him to alice, but rather to carlos
# But now let's kill Carlos, so Bob cannot get 0 - 5 from carlos (maybe he'll sneak in 1 or 2)
kill $CARLOSPID
echo "Getting gameofthrones, 0 from bob, who should get it from CARLOS because ALICE DEAD"
  OUTPUT=`zerorpc -j -pj $BOB get \"gameofthrones\" 0 true null | tail -n1`;
  SID2=`echo $OUTPUT | jq -r .streamId`;
  echo $OUTPUT;
  echo $SID2;

echo "All done"

# great.
wait;