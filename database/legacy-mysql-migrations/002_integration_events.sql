CREATE TABLE IF NOT EXISTS integration_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  integration_id CHAR(36) NOT NULL,
  delivery_id VARCHAR(191) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  message_id VARCHAR(191) NULL,
  payload_json JSON NOT NULL,
  status ENUM('received','processed','failed') NOT NULL DEFAULT 'received',
  processed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_integration_delivery (tenant_id, integration_id, delivery_id),
  KEY idx_integration_events_message (tenant_id, integration_id, message_id),
  KEY idx_integration_events_status (tenant_id, status, created_at),
  CONSTRAINT fk_integration_events_integration FOREIGN KEY (tenant_id, integration_id) REFERENCES integrations(tenant_id, id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
