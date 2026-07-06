-- ============================================================
-- 05_migracion_rol_cliente.sql
-- Crea el rol id=6 'Cliente' usado por el registro publico
-- (views_auth.py) y por el frontend (TiendaPublica).
-- Idempotente: se puede correr multiples veces sin error.
-- ============================================================

INSERT INTO roles (id_rol, nombre_rol, descripcion)
VALUES (6, 'Cliente', 'Cliente final que compra en la tienda online.')
ON CONFLICT (id_rol) DO NOTHING;

SELECT setval(
    pg_get_serial_sequence('roles', 'id_rol'),
    GREATEST((SELECT MAX(id_rol) FROM roles), 6)
);
