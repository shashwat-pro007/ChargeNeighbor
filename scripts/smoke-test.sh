#!/usr/bin/env bash
# End-to-end API smoke test. Server must be running; BASE defaults to :4100.
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:4100/api/v1}"
H=/tmp/cn-host.txt
D=/tmp/cn-driver.txt
A=/tmp/cn-admin.txt
rm -f "$H" "$D" "$A"

pass=0
fail=0

check() { # label, expected-substring, actual
  if [[ "$3" == *"$2"* ]]; then
    echo "  ok   $1"
    pass=$((pass + 1))
  else
    echo "  FAIL $1"
    echo "       expected to contain: $2"
    echo "       got: ${3:0:220}"
    fail=$((fail + 1))
  fi
}

login() { # phone, jar, intent
  curl -s -X POST "$BASE/auth/otp/request" -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$1\"}" > /dev/null
  curl -s -c "$2" -X POST "$BASE/auth/otp/verify" -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$1\",\"code\":\"123456\",\"name\":\"Test $1\",\"intent\":\"${3:-driver}\"}"
}

echo "== sign in with the fixed test code"
check "host account signs in" '"roles":["driver","host"]' "$(login '+919999000001' "$H" host)"
check "driver account signs in" '"roles":["driver"]' "$(login '+919999000002' "$D" driver)"
check "admin phone gets admin role" '"admin"' "$(login '+919999000003' "$A" host)"
curl -s -X POST "$BASE/auth/otp/request" -H 'Content-Type: application/json' -d '{"phone":"+919999000004"}' > /dev/null
check "wrong code is rejected" 'Incorrect code' "$(curl -s -X POST "$BASE/auth/otp/verify" -H 'Content-Type: application/json' -d '{"phone":"+919999000004","code":"000000"}')"
check "resend is throttled" 'RATE_LIMITED' "$(curl -s -X POST "$BASE/auth/otp/request" -H 'Content-Type: application/json' -d '{"phone":"+919999000004"}')"

echo "== login ID and password"
check "profile save works (PATCH /me)" '"name":"Test Name"' "$(curl -s -b "$D" -X PATCH "$BASE/me" -H 'Content-Type: application/json' -d '{"name":"Test Name"}')"
check "weak password rejected" 'at least 8 characters' "$(curl -s -b "$D" -X POST "$BASE/auth/id/set" -H 'Content-Type: application/json' -d '{"loginId":"test.driver","password":"short"}')"
check "password with no number rejected" 'at least one number' "$(curl -s -b "$D" -X POST "$BASE/auth/id/set" -H 'Content-Type: application/json' -d '{"loginId":"test.driver","password":"onlyletters"}')"
check "login id saved" '"loginId":"test.driver"' "$(curl -s -b "$D" -X POST "$BASE/auth/id/set" -H 'Content-Type: application/json' -d '{"loginId":"Test.Driver","password":"driver2026"}')"
check "duplicate login id rejected" 'already taken' "$(curl -s -b "$H" -X POST "$BASE/auth/id/set" -H 'Content-Type: application/json' -d '{"loginId":"test.driver","password":"host2026x"}')"
check "password sign-in works (case-insensitive ID)" '"loginId":"test.driver"' "$(curl -s -c /tmp/cn-id.txt -X POST "$BASE/auth/id/login" -H 'Content-Type: application/json' -d '{"loginId":"TEST.DRIVER","password":"driver2026"}')"
check "password session loads the account" '"loginId":"test.driver"' "$(curl -s -b /tmp/cn-id.txt "$BASE/auth/me")"
check "wrong password rejected" 'do not match' "$(curl -s -X POST "$BASE/auth/id/login" -H 'Content-Type: application/json' -d '{"loginId":"test.driver","password":"wrong2026"}')"
check "change needs current password" 'current password' "$(curl -s -b "$D" -X POST "$BASE/auth/id/set" -H 'Content-Type: application/json' -d '{"loginId":"test.driver","password":"driver2027","currentPassword":"nope2026"}')"
check "change with current password" 'updated' "$(curl -s -b "$D" -X POST "$BASE/auth/id/set" -H 'Content-Type: application/json' -d '{"loginId":"test.driver","password":"driver2027","currentPassword":"driver2026"}')"
check "new password signs in" '"loginId":"test.driver"' "$(curl -s -X POST "$BASE/auth/id/login" -H 'Content-Type: application/json' -d '{"loginId":"test.driver","password":"driver2027"}')"
check "phone sign-in still works" '"user"' "$(curl -s -b "$D" "$BASE/auth/me")"

# A bare listing is used to prove the submit checklist explains itself.
BARE=$(curl -s -b "$H" -X POST "$BASE/host/listings" -H 'Content-Type: application/json' -d '{
  "title":"Bare draft charger","description":"Too short",
  "addressLine":"9, 1st Cross, Indiranagar","area":"Indiranagar","city":"Bengaluru",
  "lat":12.9716,"lng":77.6412,"connector":"Type 2","powerKw":7.4,"currentType":"AC","pricePerHour":120,
  "minDurationMin":60,"maxDurationMin":240,"accessNotes":"Gate code 1234."
}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{process.stdout.write(JSON.parse(s).listing.id)})")
check "short description reports the character count" 'character minimum' "$(curl -s -b "$H" -X POST "$BASE/host/listings/$BARE/submit")"

# The smoke test relies on a clean database, so remove the throwaway draft.
curl -s -b "$H" -X DELETE "$BASE/host/listings/$BARE" > /dev/null

echo "== host listing lifecycle"
LID=$(curl -s -b "$H" -X POST "$BASE/host/listings" -H 'Content-Type: application/json' -d '{
  "title":"Driveway Type 2 charger",
  "description":"A 7.4 kW Type 2 charger on the left of the driveway with a covered parking bay. Easy access from the main road.",
  "addressLine":"42, 3rd Cross, Indiranagar","area":"Indiranagar","city":"Bengaluru","pincode":"560038",
  "lat":12.9716,"lng":77.6412,"connector":"Type 2","powerKw":7.4,"currentType":"AC","pricePerHour":150,
  "minDurationMin":60,"maxDurationMin":240,
  "houseRules":["Park only in the marked bay","Keep the gate closed"],
  "accessNotes":"Ring the bell at the left gate.","parkingType":"Private driveway","amenities":["Well lit"]
}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(JSON.parse(s).listing.id)}catch{process.stdout.write('ERR')}})")

if [[ "$LID" == "ERR" || -z "$LID" ]]; then
  echo "  FAIL could not create listing"; exit 1
fi
echo "  listing $LID"

WEEK=$(curl -s -b "$H" -X PUT "$BASE/host/listings/$LID/availability" -H 'Content-Type: application/json' -d '{"rules":[{"weekday":0,"startTime":"06:00","endTime":"23:00"},{"weekday":1,"startTime":"06:00","endTime":"23:00"},{"weekday":2,"startTime":"06:00","endTime":"23:00"},{"weekday":3,"startTime":"06:00","endTime":"23:00"},{"weekday":4,"startTime":"06:00","endTime":"23:00"},{"weekday":5,"startTime":"06:00","endTime":"23:00"},{"weekday":6,"startTime":"06:00","endTime":"23:00"}]}')
check "availability saved" '"ok":true' "$WEEK"

printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/charger.png
check "photo upload accepted" '"message":"Photo added."' "$(curl -s -b "$H" -X POST "$BASE/host/listings/$LID/photos" -F 'photo=@/tmp/charger.png;type=image/png')"
check "submit for review" '"status":"pending"' "$(curl -s -b "$H" -X POST "$BASE/host/listings/$LID/submit")"

echo "== privacy before approval"
check "pending listing hidden from search" '"total":0' "$(curl -s "$BASE/listings?q=indiranagar")"
check "pending listing detail is hidden" 'NOT_FOUND' "$(curl -s "$BASE/listings/$LID" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{process.stdout.write(JSON.parse(s).error?.code||'none')})")"

echo "== admin review"
check "non-admin blocked from review" 'Admin access is required' "$(curl -s -b "$D" -X POST "$BASE/admin/listings/$LID/review" -H 'Content-Type: application/json' -d '{"decision":"approve"}')"
check "admin approves listing" '"status":"approved"' "$(curl -s -b "$A" -X POST "$BASE/admin/listings/$LID/review" -H 'Content-Type: application/json' -d '{"decision":"approve"}')"
check "approved listing appears in search" '"total":1' "$(curl -s "$BASE/listings?q=indiranagar")"
check "public detail leaks no address" 'clean' "$(curl -s "$BASE/listings/$LID" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.listing.privateDetails||JSON.stringify(j).includes('3rd Cross')?'leak':'clean')})")"

echo "== booking"
TODAY=$(node -e "console.log(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date(Date.now()+86400000)))")
SLOT=$(curl -s "$BASE/listings/$LID/availability?date=$TODAY&durationMin=120" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.slots?.[0]?.startAt||'NONE')})")
echo "  first slot: $SLOT ($TODAY)"
if [[ "$SLOT" == "NONE" ]]; then echo "  FAIL no slots generated"; fail=$((fail+1)); else
check "booking created" '"status":"CONFIRMED"' "$(curl -s -b "$D" -X POST "$BASE/bookings" -H 'Content-Type: application/json' -d "{\"listingId\":\"$LID\",\"startAt\":\"$SLOT\",\"durationMin\":120}")"
check "double booking blocked" 'CONFLICT' "$(curl -s -b "$A" -X POST "$BASE/bookings" -H 'Content-Type: application/json' -d "{\"listingId\":\"$LID\",\"startAt\":\"$SLOT\",\"durationMin\":120}")"
REF=$(curl -s -b "$D" "$BASE/bookings/me" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.bookings[0].ref)})")
check "driver sees confirmed address" '"addressLine":"42, 3rd Cross, Indiranagar"' "$(curl -s -b "$D" "$BASE/bookings/$REF")"
check "host cannot book own charger" 'cannot book your own charger' "$(curl -s -b "$H" -X POST "$BASE/bookings" -H 'Content-Type: application/json' -d "{\"listingId\":\"$LID\",\"startAt\":\"$SLOT\",\"durationMin\":120}")"
check "anonymous cannot read booking" '"code":"UNAUTHORIZED"' "$(curl -s "$BASE/bookings/$REF")"
check "cancel applies policy refund" '"percent":100' "$(curl -s -b "$D" -X POST "$BASE/bookings/$REF/cancel" -H 'Content-Type: application/json' -d '{"reason":"Testing"}')"
fi

echo "== reports and policies"
check "policies served from config" '"cancellation"' "$(curl -s "$BASE/policies")"
check "report accepted" '"message"' "$(curl -s -b "$D" -X POST "$BASE/reports" -H 'Content-Type: application/json' -d "{\"targetType\":\"listing\",\"targetId\":\"$LID\",\"category\":\"Charger not available\",\"details\":\"The charger had no cable available when I arrived for the session.\"}")"
check "short report rejected with field detail" '"field":"details"' "$(curl -s -b "$D" -X POST "$BASE/reports" -H 'Content-Type: application/json' -d '{"targetType":"listing","category":"Other","details":"too short"}')"
check "admin sees report" '"OPEN"' "$(curl -s -b "$A" "$BASE/admin/reports")"

echo
echo "passed: $pass   failed: $fail"
[[ $fail -eq 0 ]]
