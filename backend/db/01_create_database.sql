-- ============================================================
-- 01_create_database.sql
-- Crea la base de datos si no existe (ejecutar en psql conectado a postgres)
-- ============================================================

-- Este script usa \gexec (comando de psql), por eso debe ejecutarse con psql.
SELECT 'CREATE DATABASE cosmetica_sistema'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'cosmetica_sistema'
)\gexec
