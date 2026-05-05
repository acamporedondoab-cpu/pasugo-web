# Project Overview
Build a lightweight local motor delivery application (Pasugo App) where customers can request deliveries and riders can accept them in real time.

The system follows a **marketplace model (no dispatching)**:
- Customers create delivery requests
- System broadcasts requests to nearby riders
- Riders accept orders
- First to accept gets the job

Each feature should be simple, focused, and easy to understand.

---

# Development Rules

## Rule 1: Always read first
Before taking any action, always read:
- `CLAUDE.md`
- `project_specs.md`

If either file doesn't exist, create it before doing anything else.

---

## Rule 2: Define before you build

Before writing any code:
1. Create or update `project_specs.md` and define:
   - What the app does and who uses it
   - Tech stack
   - Pages and user flows
   - Data models
   - Third-party services
   - What "done" means

2. Show the file  
3. Wait for approval  

---

## Rule 3: Look before you create
Always review existing files before creating new ones.

---

## Rule 4: Test before responding
- Run `npm run build`
- Run `npm run dev`
- Check for errors
- Test manually

Never say "done" if untested.

---

## Core Rule
Do exactly what is asked. Nothing more, nothing less.  
If unclear, ask first.

---

# How to Respond
Explain like the user is a beginner.

Include:
- What I just did
- What you need to do
- Why
- Next step
- Errors (if any)

---

# Tech Stack

- Language: TypeScript
- Framework: Next.js 14 (App Router)
- Backend: Supabase (Auth, DB, Storage, RLS)
- Deployment: Vercel
- Styling: Tailwind CSS

---

# Delivery System Architecture

## Core Flow

1. Customer creates order
2. Order stored in database
3. System broadcasts order to nearby riders
4. Riders receive request in real time
5. First rider accepts
6. Order is locked to rider
7. Rider completes delivery
8. Status updates sent to customer

---

## Key Principle
- No dispatcher
- No manual assignment
- System facilitates connection
- Riders self-accept orders

---

# Core Data Models

## users
- id
- role (customer, rider, admin)
- phone
- name

## orders
- id
- customer_id
- rider_id (nullable until accepted)
- service_type (pabili, pahatid, pasundo)
- status
- pickup_location
- dropoff_location
- notes

## order_status_logs
- id
- order_id
- status
- timestamp

---

# Order Lifecycle

- searching
- accepted
- en_route_pickup
- picked_up
- in_transit
- delivered
- cancelled
- failed

---

# Real-Time Requirement

- Orders must be pushed instantly to riders
- Use Supabase Realtime
- First rider to accept locks the order
- Prevent double acceptance

---

# File Structure

- `/app` → all pages
- `/app/api/` → backend logic
- `/app/(customer)/` → customer UI
- `/app/(rider)/` → rider UI
- `/app/(admin)/` → admin dashboard
- `/components/` → reusable UI
- `/lib/` → helpers
- `/lib/supabase/` → database connection
- `/supabase/` → SQL setup
- `/public/` → static assets
- `.env.local` → secrets
- `project_specs.md` → blueprint

---

# How the App Works

1. User interacts with UI
2. API route receives request
3. Service processes logic
4. Supabase stores/retrieves data
5. Response returned to user

---

# Coding Rules

- Keep code simple and readable
- One responsibility per function
- Do not over-engineer
- Do not modify unrelated code
- Add logs in API routes

---

# Supabase Rules

- Always use RLS
- Never expose service_role key
- Use server-side client for sensitive operations
- Use API routes for protected data

---

# Security

- No secrets in frontend
- Use environment variables
- Protect all endpoints

---

# Testing

Before marking done:
- Build passes
- No console errors
- Feature works end-to-end
- Auth works correctly
- RLS is enforced

---

# Scope

Only build what is defined in `project_specs.md`.

If unclear, ask first.