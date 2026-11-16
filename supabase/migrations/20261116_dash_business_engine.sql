-- Dash Hyper-Local Quick Commerce (South Africa)
-- Core FinTech Split-Ledger & Business Engine Schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. USERS
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'merchant', 'rider', 'admin')),
  dash_plus_active BOOLEAN NOT NULL DEFAULT FALSE,
  dash_plus_monthly_fee_zar NUMERIC(10, 2) NOT NULL DEFAULT 49.00,
  dash_plus_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. MERCHANTS (STORE OWNERS)
CREATE TABLE IF NOT EXISTS public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  store_type TEXT NOT NULL CHECK (store_type IN ('food', 'grocery')),
  onboarding_fee_zar NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (onboarding_fee_zar = 0.00),
  in_store_price_promise_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  in_store_price_promise_accepted_at TIMESTAMPTZ,
  sponsored_top3_active BOOLEAN NOT NULL DEFAULT FALSE,
  sponsored_top3_monthly_fee_zar NUMERIC(10, 2) NOT NULL DEFAULT 850.00,
  sponsored_top3_expires_at TIMESTAMPTZ,
  bank_name TEXT,
  bank_account_holder TEXT,
  bank_account_last4 TEXT,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  rider_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  store_type TEXT NOT NULL CHECK (store_type IN ('food', 'grocery')),
  road_distance_km NUMERIC(6, 2) NOT NULL CHECK (road_distance_km >= 0 AND road_distance_km <= 10.00),
  basket_subtotal_zar NUMERIC(10, 2) NOT NULL CHECK (basket_subtotal_zar > 0),
  delivery_fee_zar NUMERIC(10, 2) NOT NULL CHECK (delivery_fee_zar >= 0),
  small_order_fee_zar NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (small_order_fee_zar IN (0.00, 10.00)),
  service_fee_zar NUMERIC(10, 2) NOT NULL DEFAULT 4.99 CHECK (service_fee_zar = 4.99),
  tip_zar NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (tip_zar >= 0),
  total_charged_zar NUMERIC(10, 2) NOT NULL CHECK (total_charged_zar > 0),
  dash_plus_applied BOOLEAN NOT NULL DEFAULT FALSE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('ozow', 'capitec_pay', 'card')),
  delivery_otp CHAR(4) NOT NULL CHECK (delivery_otp ~ '^[0-9]{4}$'),
  pickup_pin CHAR(4) NOT NULL CHECK (pickup_pin ~ '^[0-9]{4}$'),
  batch_dispatch BOOLEAN NOT NULL DEFAULT FALSE,
  prep_started_at TIMESTAMPTZ,
  pickup_verified_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TRANSACTIONS (THE SPLIT-LEDGER)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  rider_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('ozow', 'capitec_pay', 'card')),
  gross_order_value_zar NUMERIC(10, 2) NOT NULL CHECK (gross_order_value_zar > 0),
  commission_rate NUMERIC(5, 4) NOT NULL CHECK (commission_rate IN (0.1500, 0.1000)),
  dash_commission_zar NUMERIC(10, 2) NOT NULL CHECK (dash_commission_zar >= 0),
  merchant_net_payout_zar NUMERIC(10, 2) NOT NULL CHECK (merchant_net_payout_zar >= 0),
  rider_delivery_fee_zar NUMERIC(10, 2) NOT NULL CHECK (rider_delivery_fee_zar >= 0),
  rider_tip_zar NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (rider_tip_zar >= 0),
  gateway_fee_zar NUMERIC(10, 2) NOT NULL CHECK (gateway_fee_zar >= 0),
  payout_status TEXT NOT NULL DEFAULT 'scheduled_next_morning' CHECK (payout_status IN ('pending', 'scheduled_next_morning', 'paid')),
  payout_due_at TIMESTAMPTZ NOT NULL,
  paid_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_owner ON public.merchants(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON public.orders(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON public.transactions(merchant_id, payout_due_at DESC);
