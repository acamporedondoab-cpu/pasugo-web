# PROJECT SPECS — Local Delivery App

---

# Project Name
Pasugo App

---

# Project Purpose
Build a modern local motor delivery app that digitizes order intake, rider matching, routing, and delivery tracking to eliminate inefficiencies caused by manual coordination, delayed communication, and fragmented booking processes for services such as pabili, pasundo, and pahatid.

---

# Core Problem Being Solved
Traditional local delivery services suffer from:

- Manual order intake via chat, calls, or informal messages (e.g., Facebook groups)
- Customers often provide incomplete or unclear pickup/drop-off details
- No centralized system for connecting customers and riders
- Multiple back-and-forth communication between customer and rider
- Repetitive relaying of order details
- No optimized rider selection based on proximity
- Lack of real-time tracking for deliveries
- No structured status updates (pickup, in-transit, delivered)

---

# Primary Goal
Reduce delivery time and operational delays by automating the order workflow and enabling direct connection between customers and available riders, ensuring faster, more efficient, and seamless delivery services.

---

# Target Users

## Customer
Individuals who need delivery services such as pabili, pasundo, or pahatid.

## Rider
Motorcycle riders who accept and fulfill delivery requests in real time.

## Operator
System overseer who monitors orders, resolves issues, and ensures smooth operations without directly assigning riders.

## Super Admin
Platform administrator responsible for managing system settings, users, service areas, and overall platform performance.

---

# Supported Service Types (MVP)

## Pabili
Purchase and deliver items on behalf of the customer

## Pahatid
Transport items from one location to another

## Pasundo
Pick up items from a specified location and deliver to the customer

---

# Core User Flow (Customer)

1. User opens app
2. User selects service type:
   - Pabili
   - Pahatid
   - Pasundo
3. User fills required details:
   - Pickup location
   - Drop-off location
   - Item / request details
4. User reviews order summary
5. User taps “Request Delivery”
6. Confirmation step appears (prevent accidental request)
7. User confirms request
8. Order is submitted to the system
9. System broadcasts order to nearby riders
10. Riders receive request in real time
11. A rider accepts the order
12. Order is locked to that rider
13. Customer sees live updates:
   - Looking for rider
   - Rider accepted
   - On the way to pickup
   - Picked up
   - In transit
   - Delivered

---

# Rider Flow

1. Rider goes online
2. Rider receives nearby delivery requests
3. Rider reviews request details
4. Rider accepts request
5. Order is locked to rider
6. Rider proceeds to pickup location
7. Rider updates status:
   - Arrived at pickup
   - Picked up
   - In transit
   - Delivered
8. Rider completes delivery

---

# Order Lifecycle

- Searching (waiting for rider)
- Accepted
- En Route to Pickup
- Picked Up
- In Transit
- Delivered
- Cancelled
- Failed

---

# Order Matching Logic (MVP)

- System broadcasts order to nearby available riders
- Riders receive request simultaneously
- First rider to accept gets the order
- Order is locked to that rider
- Other riders are automatically blocked from accepting

---

# Edge Case Handling

## No Rider Accepts
- Timeout triggers (e.g., 60–120 seconds)
- Notify customer: “No riders available”
- Option to retry

## Multiple Riders Accept
- First acceptance wins
- Others receive “Order already taken”

## Rider Cancels After Accepting
- Order returns to “Searching”
- Re-broadcast to nearby riders

## Customer Cancels
- Allowed before rider pickup
- Status → Cancelled

---

# Order Tracking

Each order must track:

- Order Created Timestamp
- Rider Accepted Timestamp
- Pickup Timestamp
- Delivery Timestamp
- Completion Timestamp

Purpose:
- Analytics
- Performance tracking
- Rider evaluation
- Customer transparency

---

# Customer App Screens

1. Login/Register
2. Home Dashboard
3. Service Selection Screen
4. Order Form Screen
5. Order Confirmation Screen
6. Active Delivery Tracking Screen
7. Order History
8. Profile/Settings

---

# Rider App Screens

1. Login/Register
2. Availability Toggle (Online/Offline)
3. Incoming Requests Screen
4. Active Delivery Screen (Map + Status Updates)
5. Delivery History
6. Earnings (future)

---

# Operator Dashboard (Optional)

- Monitor all orders
- View active deliveries
- Handle failed/cancelled orders
- View rider activity
- Basic analytics

---

# Admin Dashboard Features

- Manage users (customers, riders)
- Manage service areas
- View order logs
- Monitor system performance
- Configure system settings

---

# Security / Abuse Prevention

- OTP Verification (phone-based login)
- Order confirmation step (prevent accidental requests)
- Order logging and audit trail
- Rider activity monitoring
- Customer abuse detection (future)

---

# Tech Stack

## Frontend Mobile
React Native / Expo

## Dashboard / Admin
Next.js

## Backend / Database / Auth
Supabase

## Maps / Routing
Google Maps API

## Notifications
Firebase Cloud Messaging

## SMS Backup (Future)
Twilio / Local SMS Gateway

---

# MVP Definition of Done

The MVP is complete when:

1. Customer can register/login
2. Customer can create delivery request
3. Riders receive real-time requests
4. Rider can accept order
5. Order locks to first accepting rider
6. Rider can update delivery status
7. Customer can track delivery in real time
8. Order logs are saved
9. Basic edge cases handled (no rider, cancel, retry)

---

# Future Features (Post MVP)

- Auto rider matching (smart algorithm)
- Dynamic pricing
- In-app chat
- Wallet / payment integration
- Ratings & reviews
- Multi-stop delivery
- AI-based optimization