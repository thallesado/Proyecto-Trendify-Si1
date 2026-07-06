import jwt
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import (
    CustomJWTAuthentication,
    blacklist_token_by_payload,
    decode_jwt_token,
    generate_token_pair,
)
from .models import Bitacora, Cliente, Rol, Usuario


# Bloqueo de cuenta por intentos fallidos.
LOGIN_FAIL_KEY = 'login_fails:{username}'
LOGIN_LOCK_KEY = 'login_lock:{username}'
MAX_LOGIN_FAILS = 5
LOGIN_FAIL_WINDOW_SECONDS = 15 * 60
LOGIN_LOCK_SECONDS = 15 * 60


def _client_ip(request):
    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _usuario_sistema():
    """Usuario fallback para registrar eventos sin un usuario real (ej. logins
    fallidos de un username inexistente). Por convencion id_usuario=1."""
    return (
        Usuario.objects.filter(id_usuario=1).first()
        or Usuario.objects.order_by('id_usuario').first()
    )


def registrar_bitacora_auth(request, *, accion, detalle, usuario=None, registro_id=None):
    """Inserta un evento de autenticacion en la bitacora.

    Si no se pasa usuario (login fallido sin match), se loggea contra el
    usuario sistema para no perder rastro.
    """
    usuario_log = usuario if usuario is not None else _usuario_sistema()
    if usuario_log is None:
        return  # base de datos vacia, no podemos cumplir la FK NOT NULL

    Bitacora.objects.create(
        id_usuario=usuario_log,
        accion=accion,
        tabla_afectada='usuarios',
        registro_afectado_id=registro_id if registro_id is not None else getattr(usuario_log, 'id_usuario', None),
        detalle=detalle,
        fecha_hora=timezone.now(),
        direccion_ip=_client_ip(request),
    )


def _key_fails(username):
    return LOGIN_FAIL_KEY.format(username=username.lower())


def _key_lock(username):
    return LOGIN_LOCK_KEY.format(username=username.lower())


def _registrar_intento_fallido(username):
    fails = cache.get(_key_fails(username), 0) + 1
    cache.set(_key_fails(username), fails, LOGIN_FAIL_WINDOW_SECONDS)
    bloqueada = False
    if fails >= MAX_LOGIN_FAILS:
        cache.set(_key_lock(username), True, LOGIN_LOCK_SECONDS)
        bloqueada = True
    return fails, bloqueada


def _limpiar_intentos(username):
    cache.delete(_key_fails(username))
    cache.delete(_key_lock(username))


def _esta_bloqueada(username):
    return cache.get(_key_lock(username)) is not None


class RegistroClienteSerializer(serializers.Serializer):
    username = serializers.EmailField(max_length=60)
    password = serializers.CharField(write_only=True, min_length=6)
    password_confirm = serializers.CharField(write_only=True, min_length=6)
    nombre_completo = serializers.CharField(max_length=150)
    telefono = serializers.CharField(max_length=25)
    ciudad = serializers.CharField(max_length=100)
    direccion = serializers.CharField()

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Las contrasenas no coinciden.'})
        return attrs


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=60)
    password = serializers.CharField(write_only=True)


class LogoutSerializer(serializers.Serializer):
    refresh_token = serializers.CharField()


class CambiarPasswordSerializer(serializers.Serializer):
    password_actual = serializers.CharField(write_only=True)
    password_nuevo = serializers.CharField(write_only=True, min_length=8)


class RegistroClienteView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegistroClienteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        username = serializer.validated_data['username'].strip()
        password = serializer.validated_data['password']
        nombre_completo = serializer.validated_data['nombre_completo'].strip()
        telefono = serializer.validated_data.get('telefono', '').strip()
        ciudad = serializer.validated_data.get('ciudad', '').strip()
        direccion = serializer.validated_data.get('direccion', '').strip()

        if Usuario.objects.filter(username=username).exists():
            return Response({'detail': 'El nombre de usuario (email) ya esta en uso.'}, status=status.HTTP_400_BAD_REQUEST)

        if telefono and Cliente.objects.filter(telefono=telefono).exists():
            return Response(
                {'detail': 'El telefono ya esta registrado. Inicia sesion o usa otro numero.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Buscar el Rol de Cliente (id_rol = 6)
        rol_cliente = Rol.objects.filter(id_rol=6).first()
        if not rol_cliente:
            rol_cliente = Rol.objects.create(id_rol=6, nombre_rol='Cliente', descripcion='Cliente final que compra en la tienda online.')

        from django.db import transaction
        with transaction.atomic():
            usuario = Usuario.objects.create(
                id_rol=rol_cliente,
                nombre_completo=nombre_completo,
                username=username,
                password_hash=make_password(password),
                estado='activo'
            )

            cliente = Cliente.objects.create(
                nombre_completo=nombre_completo,
                telefono=telefono,
                ciudad=ciudad,
                direccion=direccion,
                id_usuario_fk=usuario,
                es_top=False,
                estado='activo'
            )

        registrar_bitacora_auth(
            request,
            usuario=usuario,
            accion='REGISTRO_CLIENTE',
            detalle=f'Registro publico de cliente {usuario.username} (id={usuario.id_usuario}).',
        )

        tokens = generate_token_pair(usuario)
        return Response(
            {
                'message': 'Registro exitoso.',
                'access_token': tokens['access_token'],
                'refresh_token': tokens['refresh_token'],
                'id_usuario': usuario.id_usuario,
                'username': usuario.username,
                'id_rol': usuario.id_rol_id,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        username = serializer.validated_data['username'].strip()
        password = serializer.validated_data['password']

        # 1) Bloqueo activo: respondemos 423 antes de chequear nada mas.
        if _esta_bloqueada(username):
            usuario_existente = Usuario.objects.filter(username=username).first()
            registrar_bitacora_auth(
                request,
                usuario=usuario_existente,
                accion='LOGIN_BLOQUEADO',
                detalle=f'Intento de login con cuenta bloqueada (username={username}).',
            )
            return Response(
                {'detail': 'Cuenta bloqueada temporalmente por demasiados intentos. Intenta en 15 minutos.'},
                status=status.HTTP_423_LOCKED,
            )

        usuario = Usuario.objects.filter(username=username).select_related('id_rol').first()

        # 2) Username inexistente: registramos contra usuario sistema, no enumeramos.
        if usuario is None:
            fails, bloqueada = _registrar_intento_fallido(username)
            registrar_bitacora_auth(
                request,
                usuario=None,
                accion='LOGIN_FAIL',
                detalle=(
                    f'Intento de login con username inexistente: {username}. '
                    f'Intento {fails}/{MAX_LOGIN_FAILS}.'
                ),
            )
            if bloqueada:
                return Response(
                    {'detail': 'Cuenta bloqueada temporalmente por demasiados intentos.'},
                    status=status.HTTP_423_LOCKED,
                )
            return Response({'detail': 'Credenciales invalidas.'}, status=status.HTTP_401_UNAUTHORIZED)

        # 3) Usuario inactivo: no contamos como fallo de password, pero auditamos.
        if (usuario.estado or '').lower() != 'activo':
            registrar_bitacora_auth(
                request,
                usuario=usuario,
                accion='LOGIN_FAIL',
                detalle=f'Intento de login con cuenta inactiva (username={username}).',
            )
            return Response({'detail': 'Usuario inactivo.'}, status=status.HTTP_403_FORBIDDEN)

        # 4) Password incorrecta.
        if not check_password(password, usuario.password_hash):
            fails, bloqueada = _registrar_intento_fallido(username)
            registrar_bitacora_auth(
                request,
                usuario=usuario,
                accion='LOGIN_FAIL',
                detalle=(
                    f'Password incorrecta para username={username}. '
                    f'Intento {fails}/{MAX_LOGIN_FAILS}.'
                ),
            )
            if bloqueada:
                return Response(
                    {'detail': 'Cuenta bloqueada temporalmente por demasiados intentos.'},
                    status=status.HTTP_423_LOCKED,
                )
            return Response({'detail': 'Credenciales invalidas.'}, status=status.HTTP_401_UNAUTHORIZED)

        # 5) Login exitoso: limpiar contador y emitir tokens.
        _limpiar_intentos(username)
        registrar_bitacora_auth(
            request,
            usuario=usuario,
            accion='LOGIN_OK',
            detalle=f'Inicio de sesion exitoso (username={username}).',
        )

        tokens = generate_token_pair(usuario)
        return Response(
            {
                'access_token': tokens['access_token'],
                'refresh_token': tokens['refresh_token'],
                'id_usuario': usuario.id_usuario,
                'username': usuario.username,
                'id_rol': usuario.id_rol_id,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        refresh_token = serializer.validated_data['refresh_token']

        try:
            payload = decode_jwt_token(refresh_token, verify_exp=False)
        except jwt.InvalidTokenError:
            return Response({'detail': 'Refresh token invalido.'}, status=status.HTTP_400_BAD_REQUEST)

        if payload.get('token_type') != 'refresh':
            return Response({'detail': 'Se esperaba un refresh token.'}, status=status.HTTP_400_BAD_REQUEST)

        blacklist_token_by_payload(payload)

        id_usuario = payload.get('id_usuario')
        usuario = Usuario.objects.filter(id_usuario=id_usuario).first() if id_usuario else None
        registrar_bitacora_auth(
            request,
            usuario=usuario,
            accion='LOGOUT',
            detalle=f'Cierre de sesion (username={payload.get("username", "?")}).',
        )

        return Response({'detail': 'Sesion cerrada correctamente.'}, status=status.HTTP_200_OK)


class CambiarPasswordView(APIView):
    authentication_classes = [CustomJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CambiarPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        usuario = request.user
        password_actual = serializer.validated_data['password_actual']
        password_nuevo = serializer.validated_data['password_nuevo']

        if not isinstance(usuario, Usuario):
            return Response({'detail': 'Usuario autenticado invalido.'}, status=status.HTTP_401_UNAUTHORIZED)

        if not check_password(password_actual, usuario.password_hash):
            registrar_bitacora_auth(
                request,
                usuario=usuario,
                accion='CAMBIO_PASSWORD_FALLIDO',
                detalle=f'Cambio de contrasena fallido (password actual incorrecta) para username={usuario.username}.',
            )
            return Response({'detail': 'La password_actual es incorrecta.'}, status=status.HTTP_400_BAD_REQUEST)

        if password_actual == password_nuevo:
            return Response(
                {'detail': 'La nueva contrasena no puede ser igual a la actual.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        usuario.password_hash = make_password(password_nuevo)
        usuario.save(update_fields=['password_hash'])

        registrar_bitacora_auth(
            request,
            usuario=usuario,
            accion='CAMBIO_PASSWORD',
            detalle=f'Cambio exitoso de contrasena para username={usuario.username}.',
        )

        return Response({'detail': 'Contrasena actualizada correctamente.'}, status=status.HTTP_200_OK)
