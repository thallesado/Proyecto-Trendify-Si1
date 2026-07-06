-- ============================================================
-- 04_migracion_pago_cu09.sql
-- Migracion idempotente: agrega columnas de CU09 (Registrar Pago)
-- a la tabla ventas en bases ya existentes.
-- Se puede ejecutar varias veces sin error.
-- ============================================================

ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS monto_recibido NUMERIC(12,2);

ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS vuelto NUMERIC(12,2);

ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS numero_comprobante VARCHAR(100);

ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS imagen_qr_url VARCHAR(255);
