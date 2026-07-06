from rest_framework.permissions import BasePermission, SAFE_METHODS


ROLE_ADMIN = 1
ROLE_VENDEDOR = 2
ROLE_BODEGUERO = 3
ROLE_COMPRAS = 4
ROLE_AUDITOR = 5
ROLE_CLIENTE = 6


def extract_user_role_id(user):
    if user is None:
        return None

    if not getattr(user, 'is_authenticated', False):
        return None

    candidates = [
        getattr(user, 'id_rol_id', None),
        getattr(getattr(user, 'id_rol', None), 'id_rol', None),
        getattr(user, 'id_rol', None),
        getattr(user, 'role_id', None),
        getattr(getattr(user, 'role', None), 'id_rol', None),
        getattr(user, 'role', None),
    ]

    for value in candidates:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            continue

        if parsed > 0:
            return parsed

    return None


class RoleBasedPermission(BasePermission):
    allowed_roles = tuple()
    message = 'No tienes permisos para acceder a este recurso.'

    def has_permission(self, request, view):
        role_id = extract_user_role_id(getattr(request, 'user', None))
        return role_id in self.allowed_roles


class RoleReadWritePermission(BasePermission):
    """Permite roles distintos para lectura (GET/HEAD/OPTIONS) y escritura."""
    read_roles = tuple()
    write_roles = tuple()
    message = 'No tienes permisos para acceder a este recurso.'

    def has_permission(self, request, view):
        role_id = extract_user_role_id(getattr(request, 'user', None))
        if role_id is None:
            return False
        if request.method in SAFE_METHODS:
            return role_id in self.read_roles
        return role_id in self.write_roles


class IsAdminRole(RoleBasedPermission):
    allowed_roles = (ROLE_ADMIN,)


class IsAdminOrVendedorRole(RoleBasedPermission):
    allowed_roles = (ROLE_ADMIN, ROLE_VENDEDOR)


class IsAdminOrBodegueroRole(RoleBasedPermission):
    allowed_roles = (ROLE_ADMIN, ROLE_BODEGUERO)


class IsAdminOrComprasRole(RoleBasedPermission):
    allowed_roles = (ROLE_ADMIN, ROLE_COMPRAS)


class IsAdminOrAuditorRole(RoleBasedPermission):
    allowed_roles = (ROLE_ADMIN, ROLE_AUDITOR)


class IsClienteRole(RoleBasedPermission):
    allowed_roles = (ROLE_CLIENTE,)


class IsCatalogoReadRole(RoleReadWritePermission):
    """Categorias, Marcas, Productos: todos los roles internos pueden ver.
    Solo Administrador y Vendedor pueden modificar."""
    read_roles = (ROLE_ADMIN, ROLE_VENDEDOR, ROLE_BODEGUERO, ROLE_COMPRAS)
    write_roles = (ROLE_ADMIN, ROLE_VENDEDOR)


class IsInventarioRole(RoleReadWritePermission):
    """Inventario y movimientos: lectura para todos los internos,
    escritura para Administrador y Bodeguero."""
    read_roles = (ROLE_ADMIN, ROLE_VENDEDOR, ROLE_BODEGUERO, ROLE_COMPRAS)
    write_roles = (ROLE_ADMIN, ROLE_BODEGUERO)
