-- ============================================================
-- 10_migracion_backfill_clientes_usuario.sql
-- Backfill: garantiza que todo usuario con rol Cliente (id_rol=6)
-- tenga una fila asociada en clientes (id_usuario_fk).
-- ============================================================

INSERT INTO clientes (
    nombre_completo,
    telefono,
    ciudad,
    direccion,
    id_usuario_fk,
    es_top,
    estado,
    creado_en
)
SELECT
    u.nombre_completo,
    '',
    '',
    '',
    u.id_usuario,
    FALSE,
    COALESCE(NULLIF(u.estado, ''), 'activo'),
    NOW()
FROM usuarios u
LEFT JOIN clientes c
    ON c.id_usuario_fk = u.id_usuario
WHERE u.id_rol = 6
  AND c.id_cliente IS NULL;
