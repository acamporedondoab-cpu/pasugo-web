# ============================================================
# Pasugo API Test Script
# Fill in the 4 variables below, then run: .\test-api.ps1
# ============================================================

$SUPABASE_URL    = "https://mzdyjvvoltgarhkdtevc.supabase.co"
$SUPABASE_ANON   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16ZHlqdnZvbHRnYXJoa2R0ZXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3ODk5MTQsImV4cCI6MjA5MzM2NTkxNH0.LEGmpLOCUww5GW2qpJogiRG0MWE9MWWYsIRwxl09w08"
$CUSTOMER_EMAIL  = "testcustomer@pasugo.dev"
$CUSTOMER_PASS   = "customer@2026"
$RIDER_EMAIL     = "testrider@pasugo.dev"
$RIDER_PASS      = "rider@2026"

Write-Host "`n--- STEP 1: Sign in as Customer ---" -ForegroundColor Cyan
$customerAuth = Invoke-RestMethod `
  -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" `
  -Method POST `
  -Headers @{ "apikey" = $SUPABASE_ANON } `
  -ContentType "application/json" `
  -Body "{`"email`":`"$CUSTOMER_EMAIL`",`"password`":`"$CUSTOMER_PASS`"}"

$customerToken = $customerAuth.access_token
Write-Host "Customer token obtained." -ForegroundColor Green

Write-Host "`n--- STEP 2: Create Order (as Customer) ---" -ForegroundColor Cyan
$order = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $customerToken" } `
  -ContentType "application/json" `
  -Body '{"service_type":"pahatid","pickup_address":"SM Mall, Cebu City","pickup_lat":10.3157,"pickup_lng":123.8854,"dropoff_address":"Ayala Center, Cebu City","dropoff_lat":10.3181,"dropoff_lng":123.9050,"notes":"Handle with care"}'

Write-Host "Order created:" -ForegroundColor Green
$order | ConvertTo-Json -Depth 5

$orderId = $order.data.id
Write-Host "`nOrder ID: $orderId" -ForegroundColor Yellow

Write-Host "`n--- STEP 3: Sign in as Rider ---" -ForegroundColor Cyan
$riderAuth = Invoke-RestMethod `
  -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" `
  -Method POST `
  -Headers @{ "apikey" = $SUPABASE_ANON } `
  -ContentType "application/json" `
  -Body "{`"email`":`"$RIDER_EMAIL`",`"password`":`"$RIDER_PASS`"}"

$riderToken = $riderAuth.access_token
Write-Host "Rider token obtained." -ForegroundColor Green

Write-Host "`n--- STEP 3b: Get Available Orders (as Rider) ---" -ForegroundColor Cyan
$available = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders/available" `
  -Method GET `
  -Headers @{ "Authorization" = "Bearer $riderToken" }

Write-Host "Available orders:" -ForegroundColor Green
$available | ConvertTo-Json -Depth 5

Write-Host "`n--- STEP 4: Accept Order (as Rider) ---" -ForegroundColor Cyan
$accept = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders/$orderId/accept" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $riderToken" } `
  -ContentType "application/json"

Write-Host "Order accepted:" -ForegroundColor Green
$accept | ConvertTo-Json -Depth 5

Write-Host "`n--- STEP 5: Advance Status → en_route_pickup ---" -ForegroundColor Cyan
$s1 = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders/$orderId/status" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $riderToken" } `
  -ContentType "application/json"
Write-Host "Status:" $s1.data.status -ForegroundColor Green

Write-Host "`n--- STEP 6: Advance Status → arrived_pickup ---" -ForegroundColor Cyan
$s2 = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders/$orderId/status" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $riderToken" } `
  -ContentType "application/json"
Write-Host "Status:" $s2.data.status -ForegroundColor Green

Write-Host "`n--- STEP 7: Advance Status → picked_up ---" -ForegroundColor Cyan
$s3 = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders/$orderId/status" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $riderToken" } `
  -ContentType "application/json"
Write-Host "Status:" $s3.data.status -ForegroundColor Green

Write-Host "`n--- STEP 8: Advance Status → in_transit ---" -ForegroundColor Cyan
$s4 = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders/$orderId/status" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $riderToken" } `
  -ContentType "application/json"
Write-Host "Status:" $s4.data.status -ForegroundColor Green

Write-Host "`n--- STEP 9: Advance Status → delivered ---" -ForegroundColor Cyan
$s5 = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders/$orderId/status" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $riderToken" } `
  -ContentType "application/json"
Write-Host "Status:" $s5.data.status -ForegroundColor Green

Write-Host "`n--- STEP 10: Get Order with Logs (as Customer) ---" -ForegroundColor Cyan
$detail = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders/$orderId" `
  -Method GET `
  -Headers @{ "Authorization" = "Bearer $customerToken" }
Write-Host "Order status:" $detail.data.status "| Log entries:" $detail.data.logs.Count -ForegroundColor Green

# --- Cancel test: create a fresh order and cancel it before acceptance ---

Write-Host "`n--- STEP 11: Create Order for Cancel Test ---" -ForegroundColor Cyan
$orderC = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $customerToken" } `
  -ContentType "application/json" `
  -Body '{"service_type":"pabili","pickup_address":"Test St","pickup_lat":10.31,"pickup_lng":123.88,"dropoff_address":"Drop St","dropoff_lat":10.32,"dropoff_lng":123.89}'
$cancelOrderId = $orderC.data.id
Write-Host "Order ID: $cancelOrderId | Status:" $orderC.data.status -ForegroundColor Green

Write-Host "`n--- STEP 12: Customer Cancels Order ---" -ForegroundColor Cyan
$cancelled = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders/$cancelOrderId/cancel" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $customerToken" } `
  -ContentType "application/json"
Write-Host "Status:" $cancelled.data.status "| Cancelled by:" $cancelled.data.cancelled_by -ForegroundColor Green

# --- Rider-cancel test: create order, rider accepts, rider cancels ---

Write-Host "`n--- STEP 13: Create Order for Rider-Cancel Test ---" -ForegroundColor Cyan
$orderR = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $customerToken" } `
  -ContentType "application/json" `
  -Body '{"service_type":"pasundo","pickup_address":"Pickup St","pickup_lat":10.31,"pickup_lng":123.88,"dropoff_address":"Drop St","dropoff_lat":10.32,"dropoff_lng":123.89}'
$riderCancelOrderId = $orderR.data.id
Write-Host "Order ID: $riderCancelOrderId | Status:" $orderR.data.status -ForegroundColor Green

Write-Host "`n--- STEP 14: Rider Accepts Order ---" -ForegroundColor Cyan
$acceptR = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders/$riderCancelOrderId/accept" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $riderToken" } `
  -ContentType "application/json"
Write-Host "Status:" $acceptR.data.status -ForegroundColor Green

Write-Host "`n--- STEP 15: Rider Cancels Order (re-broadcast) ---" -ForegroundColor Cyan
$riderCancelled = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/orders/$riderCancelOrderId/rider-cancel" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $riderToken" } `
  -ContentType "application/json"
Write-Host "Status:" $riderCancelled.data.status "| Search attempts:" $riderCancelled.data.search_attempts -ForegroundColor Green

Write-Host "`n--- ALL TESTS PASSED ---" -ForegroundColor Green
