CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  manus_open_id VARCHAR(191) NOT NULL,
  display_name VARCHAR(180) NOT NULL,
  email VARCHAR(254) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_open_id (manus_open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenants (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  address VARCHAR(500) NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tenants_id (id),
  CONSTRAINT fk_tenants_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS memberships (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role ENUM('admin','syndic','finance','council','resident','employee') NOT NULL,
  status ENUM('active','invited','suspended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_membership_tenant_user (tenant_id, user_id),
  KEY idx_membership_user (user_id, status),
  CONSTRAINT fk_membership_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS units (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  label VARCHAR(100) NOT NULL,
  block_name VARCHAR(100) NOT NULL DEFAULT '',
  unit_type VARCHAR(80) NOT NULL DEFAULT 'Casa',
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_units_tenant_id (tenant_id, id),
  UNIQUE KEY uq_units_tenant_label (tenant_id, label, block_name),
  KEY idx_units_tenant_status (tenant_id, status),
  CONSTRAINT fk_units_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS residents (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  unit_id CHAR(36) NOT NULL,
  full_name VARCHAR(180) NOT NULL,
  email VARCHAR(254) NULL,
  phone VARCHAR(40) NULL,
  resident_type ENUM('owner','tenant','temporary','other') NOT NULL DEFAULT 'owner',
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_residents_tenant_id (tenant_id, id),
  KEY idx_residents_unit (tenant_id, unit_id),
  CONSTRAINT fk_residents_unit FOREIGN KEY (tenant_id, unit_id) REFERENCES units(tenant_id, id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS funds (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(100) NOT NULL,
  purpose VARCHAR(500) NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'BRL',
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_funds_tenant_id (tenant_id, id),
  UNIQUE KEY uq_funds_tenant_code (tenant_id, code),
  CONSTRAINT fk_funds_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contribution_rules (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  unit_id CHAR(36) NULL,
  fund_id CHAR(36) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  due_day TINYINT UNSIGNED NOT NULL DEFAULT 10,
  starts_on DATE NOT NULL,
  ends_on DATE NULL,
  is_exempt BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contribution_rules_tenant_id (tenant_id, id),
  KEY idx_contribution_rules_tenant_fund (tenant_id, fund_id, status),
  CONSTRAINT fk_contribution_rule_fund FOREIGN KEY (tenant_id, fund_id) REFERENCES funds(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_contribution_rule_unit FOREIGN KEY (tenant_id, unit_id) REFERENCES units(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_contribution_rule_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  unit_id CHAR(36) NULL,
  payer_name VARCHAR(180) NULL,
  received_at DATETIME NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  status ENUM('received','identified','posted','confirmed','reconciled') NOT NULL DEFAULT 'identified',
  source VARCHAR(60) NOT NULL DEFAULT 'manual',
  external_reference VARCHAR(191) NULL,
  idempotency_key VARCHAR(191) NULL,
  note VARCHAR(1000) NULL,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payment_tenant_id (tenant_id, id),
  UNIQUE KEY uq_payment_idempotency (tenant_id, idempotency_key),
  KEY idx_payment_tenant_date (tenant_id, received_at),
  KEY idx_payment_tenant_status (tenant_id, status),
  CONSTRAINT fk_payment_unit FOREIGN KEY (tenant_id, unit_id) REFERENCES units(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  payment_transaction_id CHAR(36) NOT NULL,
  fund_id CHAR(36) NOT NULL,
  reference_month DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payment_allocations_tenant_id (tenant_id, id),
  KEY idx_payment_allocations_transaction (tenant_id, payment_transaction_id),
  CONSTRAINT fk_payment_allocation_transaction FOREIGN KEY (tenant_id, payment_transaction_id) REFERENCES payment_transactions(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_allocation_fund FOREIGN KEY (tenant_id, fund_id) REFERENCES funds(tenant_id, id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS suppliers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL,
  company VARCHAR(180) NULL,
  phone VARCHAR(40) NULL,
  category VARCHAR(100) NOT NULL,
  service_description VARCHAR(1000) NULL,
  recommended_by VARCHAR(180) NULL,
  source_message_id VARCHAR(191) NULL,
  notes TEXT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_suppliers_tenant_id (tenant_id, id),
  KEY idx_supplier_phone (tenant_id, phone),
  KEY idx_supplier_name (tenant_id, name),
  CONSTRAINT fk_suppliers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expenses (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  fund_id CHAR(36) NOT NULL,
  supplier_id CHAR(36) NULL,
  amount DECIMAL(14,2) NOT NULL,
  occurred_at DATETIME NOT NULL,
  category VARCHAR(100) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  status ENUM('pending_review','approved','rejected','reversed') NOT NULL DEFAULT 'pending_review',
  receipt_path VARCHAR(500) NULL,
  source VARCHAR(60) NOT NULL DEFAULT 'manual',
  created_by CHAR(36) NOT NULL,
  reviewed_by CHAR(36) NULL,
  reviewed_at DATETIME NULL,
  review_note VARCHAR(1000) NULL,
  correction_of CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_expenses_tenant_id (tenant_id, id),
  KEY idx_expenses_tenant_date (tenant_id, occurred_at),
  KEY idx_expenses_tenant_status (tenant_id, status),
  CONSTRAINT fk_expenses_fund FOREIGN KEY (tenant_id, fund_id) REFERENCES funds(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_supplier FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_correction FOREIGN KEY (tenant_id, correction_of) REFERENCES expenses(tenant_id, id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fund_movements (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  fund_id CHAR(36) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  movement_type ENUM('payment_allocation','expense','adjustment','reversal') NOT NULL,
  origin_id CHAR(36) NOT NULL,
  description VARCHAR(500) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fund_movement_origin (tenant_id, fund_id, movement_type, origin_id),
  KEY idx_fund_movements_tenant_date (tenant_id, fund_id, created_at),
  CONSTRAINT fk_fund_movements_fund FOREIGN KEY (tenant_id, fund_id) REFERENCES funds(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_fund_movements_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maintenance_records (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT NULL,
  scheduled_for DATE NULL,
  completed_at DATE NULL,
  amount DECIMAL(14,2) NULL,
  fund_id CHAR(36) NULL,
  supplier_id CHAR(36) NULL,
  status ENUM('necessary','requested','quoting','awaiting_approval','scheduled','in_progress','completed','paid','cancelled') NOT NULL DEFAULT 'requested',
  periodicity VARCHAR(100) NULL,
  is_estimate BOOLEAN NOT NULL DEFAULT FALSE,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_maintenance_tenant_id (tenant_id, id),
  KEY idx_maintenance_tenant_date (tenant_id, scheduled_for),
  KEY idx_maintenance_tenant_status (tenant_id, status),
  CONSTRAINT fk_maintenance_fund FOREIGN KEY (tenant_id, fund_id) REFERENCES funds(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_maintenance_supplier FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_maintenance_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  supplier_id CHAR(36) NULL,
  maintenance_id CHAR(36) NULL,
  service_name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  amount DECIMAL(14,2) NULL,
  received_at DATE NULL,
  valid_until DATE NULL,
  conditions VARCHAR(1000) NULL,
  status ENUM('to_request','requested','waiting','received','reviewing','approved','rejected','contracted','completed') NOT NULL DEFAULT 'received',
  attachment_path VARCHAR(500) NULL,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_quotes_tenant_id (tenant_id, id),
  KEY idx_quotes_tenant_status (tenant_id, status),
  CONSTRAINT fk_quotes_supplier FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_quotes_maintenance FOREIGN KEY (tenant_id, maintenance_id) REFERENCES maintenance_records(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_quotes_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS occurrences (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  category VARCHAR(100) NOT NULL,
  location VARCHAR(180) NULL,
  urgency ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  status ENUM('open','analyzing','awaiting_quote','awaiting_approval','scheduled','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  related_maintenance_id CHAR(36) NULL,
  source_message_id VARCHAR(191) NULL,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_occurrences_tenant_id (tenant_id, id),
  KEY idx_occurrences_tenant_status (tenant_id, status),
  CONSTRAINT fk_occurrence_maintenance FOREIGN KEY (tenant_id, related_maintenance_id) REFERENCES maintenance_records(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_occurrence_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcements (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  status ENUM('draft','pending_approval','scheduled','published','archived') NOT NULL DEFAULT 'draft',
  scheduled_at DATETIME NULL,
  published_at DATETIME NULL,
  created_by CHAR(36) NOT NULL,
  approved_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_announcements_tenant_id (tenant_id, id),
  KEY idx_announcements_tenant_status (tenant_id, status),
  CONSTRAINT fk_announcement_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_announcement_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_announcement_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_review_queue (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  category VARCHAR(100) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  payload_json JSON NOT NULL,
  confidence DECIMAL(5,4) NULL,
  source_channel VARCHAR(80) NOT NULL DEFAULT 'manual',
  source_message_id VARCHAR(191) NULL,
  status ENUM('pending','approved','rejected','ignored','clarification_requested') NOT NULL DEFAULT 'pending',
  reviewed_by CHAR(36) NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ai_review_tenant_id (tenant_id, id),
  KEY idx_ai_review_tenant_status (tenant_id, status),
  CONSTRAINT fk_ai_review_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ai_review_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integrations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  provider VARCHAR(80) NOT NULL,
  display_name VARCHAR(180) NOT NULL,
  instance_name VARCHAR(180) NULL,
  status ENUM('pending','active','error','disabled') NOT NULL DEFAULT 'pending',
  last_event_at DATETIME NULL,
  last_error_code VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_integrations_tenant_id (tenant_id, id),
  UNIQUE KEY uq_integrations_tenant_provider_instance (tenant_id, provider, instance_name),
  CONSTRAINT fk_integrations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id CHAR(36) NULL,
  details_json JSON NULL,
  request_id VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_tenant_time (tenant_id, created_at),
  KEY idx_audit_entity (tenant_id, entity_type, entity_id),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
