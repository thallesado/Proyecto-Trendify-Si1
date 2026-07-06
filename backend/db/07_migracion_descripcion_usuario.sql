-- ============================================================
-- 07_migracion_descripcion_usuario.sql
-- Agrega la columna `descripcion` a la tabla `usuarios`.
-- Texto opcional para notas, biografia o cargo del usuario.
-- Idempotente: se puede correr multiples veces sin error.
-- ============================================================

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS descripcion TEXT;
