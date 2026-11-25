-- Global account type controls who may create a condominium.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS account_type text;
UPDATE public.users SET account_type = 'resident' WHERE account_type IS NULL;
ALTER TABLE public.users ALTER COLUMN account_type SET DEFAULT 'resident';
ALTER TABLE public.users ALTER COLUMN account_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_account_type_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_account_type_check CHECK (account_type IN ('resident', 'sindico'));
  END IF;
END;
$$;

-- Account type is managed by a trusted database operator, never by the client.
REVOKE UPDATE ON public.users FROM anon, authenticated;

DROP POLICY IF EXISTS tenants_create_self ON public.tenants;
CREATE POLICY tenants_create_self ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.account_type = 'sindico'
    )
  );

DROP POLICY IF EXISTS memberships_create_owner ON public.memberships;
CREATE POLICY memberships_create_owner ON public.memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'syndic'
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = tenant_id AND t.created_by = auth.uid()
    )
  );

INSERT INTO public.schema_migrations (name)
VALUES ('002_syndic_account_type.sql')
ON CONFLICT (name) DO NOTHING;
