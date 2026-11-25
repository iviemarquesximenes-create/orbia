-- ORBIA database schema for Supabase PostgreSQL.
-- Apply with `pnpm db:migrate` or in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Usuário ORBIA',
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY,
  manus_open_id text NOT NULL UNIQUE,
  display_name varchar(180) NOT NULL,
  email varchar(254),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.sync_auth_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NULLIF(NEW.raw_user_meta_data->>'name', ''), 'Usuário ORBIA'),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name, email = EXCLUDED.email, updated_at = now();
  INSERT INTO public.users (id, manus_open_id, display_name, email)
  VALUES (
    NEW.id,
    'supabase:' || NEW.id::text,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NULLIF(NEW.raw_user_meta_data->>'name', ''), 'Usuário ORBIA'),
    NEW.email
  )
  ON CONFLICT (manus_open_id) DO UPDATE
    SET display_name = EXCLUDED.display_name, email = EXCLUDED.email, updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_orbia ON auth.users;
CREATE TRIGGER on_auth_user_created_orbia
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_auth_profile();

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 180),
  address text,
  is_demo boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('admin', 'syndic', 'finance', 'council', 'resident', 'employee')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user_status ON public.memberships (user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_status ON public.memberships (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  label text NOT NULL,
  block_name text NOT NULL DEFAULT '',
  unit_type text NOT NULL DEFAULT 'Casa',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, label, block_name)
);
CREATE INDEX IF NOT EXISTS idx_units_tenant_status ON public.units (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.residents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  resident_type text NOT NULL DEFAULT 'owner' CHECK (resident_type IN ('owner', 'tenant', 'temporary', 'other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES public.units(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_residents_unit ON public.residents (tenant_id, unit_id);

CREATE TABLE IF NOT EXISTS public.funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  purpose text,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.contribution_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  unit_id uuid,
  fund_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  due_day smallint NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 31),
  starts_on date NOT NULL,
  ends_on date,
  is_exempt boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, fund_id) REFERENCES public.funds(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, unit_id) REFERENCES public.units(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_contribution_rules_tenant_fund ON public.contribution_rules (tenant_id, fund_id, status);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  unit_id uuid,
  payer_name text,
  received_at timestamptz NOT NULL,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'identified' CHECK (status IN ('received', 'identified', 'posted', 'confirmed', 'reconciled')),
  source text NOT NULL DEFAULT 'manual',
  external_reference text,
  idempotency_key text,
  request_hash char(64),
  note text,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES public.units(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_payment_tenant_date ON public.payment_transactions (tenant_id, received_at);
CREATE INDEX IF NOT EXISTS idx_payment_tenant_status ON public.payment_transactions (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_transaction_id uuid NOT NULL,
  fund_id uuid NOT NULL,
  reference_month date NOT NULL,
  amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, payment_transaction_id) REFERENCES public.payment_transactions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, fund_id) REFERENCES public.funds(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_transaction ON public.payment_allocations (tenant_id, payment_transaction_id);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  company text,
  phone text,
  category text NOT NULL,
  service_description text,
  recommended_by text,
  source_message_id text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_phone ON public.suppliers (tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_supplier_name ON public.suppliers (tenant_id, name);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  fund_id uuid NOT NULL,
  supplier_id uuid,
  amount numeric(14,2) NOT NULL,
  occurred_at timestamptz NOT NULL,
  category text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'reversed')),
  receipt_path text,
  source text NOT NULL DEFAULT 'manual',
  idempotency_key text,
  request_hash char(64),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text,
  correction_of uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, fund_id) REFERENCES public.funds(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES public.suppliers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, correction_of) REFERENCES public.expenses(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON public.expenses (tenant_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_status ON public.expenses (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.fund_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  fund_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('payment_allocation', 'expense', 'adjustment', 'reversal')),
  origin_id uuid NOT NULL,
  description text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fund_id, movement_type, origin_id),
  FOREIGN KEY (tenant_id, fund_id) REFERENCES public.funds(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_fund_movements_tenant_date ON public.fund_movements (tenant_id, fund_id, created_at);

CREATE TABLE IF NOT EXISTS public.maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  scheduled_for date,
  completed_at date,
  amount numeric(14,2),
  fund_id uuid,
  supplier_id uuid,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('necessary', 'requested', 'quoting', 'awaiting_approval', 'scheduled', 'in_progress', 'completed', 'paid', 'cancelled')),
  periodicity text,
  is_estimate boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, fund_id) REFERENCES public.funds(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES public.suppliers(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_maintenance_tenant_date ON public.maintenance_records (tenant_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_maintenance_tenant_status ON public.maintenance_records (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_id uuid,
  maintenance_id uuid,
  service_name text NOT NULL,
  description text,
  amount numeric(14,2),
  received_at date,
  valid_until date,
  conditions text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('to_request', 'requested', 'waiting', 'received', 'reviewing', 'approved', 'rejected', 'contracted', 'completed')),
  attachment_path text,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES public.suppliers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, maintenance_id) REFERENCES public.maintenance_records(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant_status ON public.quotes (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  category text NOT NULL,
  location text,
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'analyzing', 'awaiting_quote', 'awaiting_approval', 'scheduled', 'in_progress', 'resolved', 'closed')),
  related_maintenance_id uuid,
  source_message_id text,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, related_maintenance_id) REFERENCES public.maintenance_records(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_occurrences_tenant_status ON public.occurrences (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'scheduled', 'published', 'archived')),
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_status ON public.announcements (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.ai_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  category text NOT NULL,
  summary text NOT NULL,
  payload_json jsonb NOT NULL,
  confidence numeric(5,4),
  source_channel text NOT NULL DEFAULT 'manual',
  source_message_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'ignored', 'clarification_requested')),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_ai_review_tenant_status ON public.ai_review_queue (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  display_name text NOT NULL,
  instance_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error', 'disabled')),
  last_event_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, provider, instance_name)
);

CREATE TABLE IF NOT EXISTS public.integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  integration_id uuid NOT NULL,
  delivery_id text NOT NULL,
  event_type text NOT NULL,
  message_id text,
  payload_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, integration_id, delivery_id),
  FOREIGN KEY (tenant_id, integration_id) REFERENCES public.integrations(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_integration_events_message ON public.integration_events (tenant_id, integration_id, message_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_status ON public.integration_events (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details_json jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON public.audit_logs (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs (tenant_id, entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.is_tenant_member(target_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.tenant_id = target_tenant AND m.user_id = auth.uid() AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(target_tenant uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.tenant_id = target_tenant
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role = ANY(allowed_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.is_tenant_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_tenant_role(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tenant_role(uuid, text[]) TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_read_self ON public.profiles;
CREATE POLICY profiles_read_self ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS users_read_self ON public.users;
CREATE POLICY users_read_self ON public.users FOR SELECT TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS tenants_read_members ON public.tenants;
CREATE POLICY tenants_read_members ON public.tenants FOR SELECT TO authenticated USING (public.is_tenant_member(id));
DROP POLICY IF EXISTS tenants_create_self ON public.tenants;
CREATE POLICY tenants_create_self ON public.tenants FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS tenants_update_managers ON public.tenants;
CREATE POLICY tenants_update_managers ON public.tenants FOR UPDATE TO authenticated USING (public.has_tenant_role(id, ARRAY['admin', 'syndic'])) WITH CHECK (public.has_tenant_role(id, ARRAY['admin', 'syndic']));

DROP POLICY IF EXISTS memberships_read_self_or_managers ON public.memberships;
CREATE POLICY memberships_read_self_or_managers ON public.memberships FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.has_tenant_role(tenant_id, ARRAY['admin', 'syndic'])
);
DROP POLICY IF EXISTS memberships_create_owner ON public.memberships;
CREATE POLICY memberships_create_owner ON public.memberships FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND role = 'admin'
  AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.created_by = auth.uid())
);
DROP POLICY IF EXISTS memberships_update_managers ON public.memberships;
CREATE POLICY memberships_update_managers ON public.memberships FOR UPDATE TO authenticated
USING (public.has_tenant_role(tenant_id, ARRAY['admin', 'syndic']))
WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['admin', 'syndic']));
DROP POLICY IF EXISTS memberships_delete_managers ON public.memberships;
CREATE POLICY memberships_delete_managers ON public.memberships FOR DELETE TO authenticated
USING (public.has_tenant_role(tenant_id, ARRAY['admin', 'syndic']));

DO $$
DECLARE
  table_name text;
  table_names text[] := ARRAY[
    'units', 'residents', 'funds', 'contribution_rules', 'payment_transactions',
    'payment_allocations', 'suppliers', 'expenses', 'fund_movements',
    'maintenance_records', 'quotes', 'occurrences', 'announcements',
    'ai_review_queue', 'integrations', 'integration_events', 'audit_logs'
  ];
  financial_tables text[] := ARRAY[
    'funds', 'contribution_rules', 'payment_transactions', 'payment_allocations',
    'expenses', 'fund_movements'
  ];
  restricted_read_tables text[] := ARRAY['residents', 'audit_logs', 'integrations', 'integration_events', 'ai_review_queue'];
  write_roles text[];
BEGIN
  FOREACH table_name IN ARRAY table_names LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_read_members ON public.%I', table_name);
    IF table_name = ANY(restricted_read_tables) THEN
      EXECUTE format(
        'CREATE POLICY tenant_read_members ON public.%I FOR SELECT TO authenticated USING (public.has_tenant_role(tenant_id, ARRAY[''admin'', ''syndic'', ''finance'', ''council'']))',
        table_name
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY tenant_read_members ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id))',
        table_name
      );
    END IF;

    write_roles := CASE WHEN table_name = ANY(financial_tables)
      THEN ARRAY['admin', 'syndic', 'finance']
      ELSE ARRAY['admin', 'syndic']
    END;
    EXECUTE format('DROP POLICY IF EXISTS tenant_write_managers ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update_managers ON public.%I', table_name);
    IF table_name <> 'audit_logs' THEN
      EXECUTE format(
        'CREATE POLICY tenant_write_managers ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, %L::text[]))',
        table_name, write_roles
      );
      EXECUTE format(
        'CREATE POLICY tenant_update_managers ON public.%I FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, %L::text[])) WITH CHECK (public.has_tenant_role(tenant_id, %L::text[]))',
        table_name, write_roles, write_roles
      );
    END IF;
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON
  public.units, public.residents, public.funds, public.contribution_rules,
  public.payment_transactions, public.payment_allocations, public.suppliers,
  public.expenses, public.fund_movements, public.maintenance_records,
  public.quotes, public.occurrences, public.announcements,
  public.ai_review_queue, public.integrations, public.integration_events TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

CREATE TABLE IF NOT EXISTS public.orbia_keepalive (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_ping timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.orbia_keepalive FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.keep_orbia_project_active()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.orbia_keepalive (id, last_ping)
  VALUES (true, now())
  ON CONFLICT (id) DO UPDATE
    SET last_ping = EXCLUDED.last_ping
    WHERE public.orbia_keepalive.last_ping < now() - interval '12 hours';
END;
$$;
REVOKE ALL ON FUNCTION public.keep_orbia_project_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.keep_orbia_project_active() TO anon, authenticated;

INSERT INTO public.schema_migrations (name)
VALUES ('001_orbia_schema.sql')
ON CONFLICT (name) DO NOTHING;
