from datetime import datetime, timedelta, timezone
import uuid

import jwt
from django.conf import settings
from django.core.cache import cache
from rest_framework import authentication, exceptions

from .models import Usuario


JWT_SECRET_KEY = getattr(settings, 'JWT_SECRET_KEY', settings.SECRET_KEY)
JWT_ALGORITHM = getattr(settings, 'JWT_ALGORITHM', 'HS256')
JWT_ACCESS_TOKEN_MINUTES = int(getattr(settings, 'JWT_ACCESS_TOKEN_MINUTES', 15))
JWT_REFRESH_TOKEN_DAYS = int(getattr(settings, 'JWT_REFRESH_TOKEN_DAYS', 7))

BLACKLIST_PREFIX = 'jwt_blacklist:'


def _now_utc():
    return datetime.now(timezone.utc)


def _encode_token(payload):
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_jwt_token(token, verify_exp=True):
    options = {'verify_exp': verify_exp}
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM], options=options)


def is_token_blacklisted(jti):
    return cache.get(f'{BLACKLIST_PREFIX}{jti}') is not None


def blacklist_token(jti, exp_timestamp):
    if not jti:
        return

    now_ts = int(_now_utc().timestamp())
    ttl_seconds = max(exp_timestamp - now_ts, 1)
    cache.set(f'{BLACKLIST_PREFIX}{jti}', True, timeout=ttl_seconds)


def blacklist_token_by_payload(payload):
    jti = payload.get('jti')
    exp = payload.get('exp')
    if not jti or not exp:
        raise exceptions.AuthenticationFailed('Token invalido.')

    blacklist_token(jti=jti, exp_timestamp=int(exp))


def _build_token_payload(usuario, token_type, lifetime):
    now = _now_utc()
    exp = now + lifetime

    return {
        'jti': str(uuid.uuid4()),
        'token_type': token_type,
        'id_usuario': usuario.id_usuario,
        'username': usuario.username,
        'id_rol': usuario.id_rol_id,
        'iat': int(now.timestamp()),
        'exp': int(exp.timestamp()),
    }


def generate_token_pair(usuario):
    access_payload = _build_token_payload(
        usuario=usuario,
        token_type='access',
        lifetime=timedelta(minutes=JWT_ACCESS_TOKEN_MINUTES),
    )
    refresh_payload = _build_token_payload(
        usuario=usuario,
        token_type='refresh',
        lifetime=timedelta(days=JWT_REFRESH_TOKEN_DAYS),
    )

    return {
        'access_token': _encode_token(access_payload),
        'refresh_token': _encode_token(refresh_payload),
    }


class CustomJWTAuthentication(authentication.BaseAuthentication):
    keyword = 'Bearer'

    def authenticate(self, request):
        auth_header = authentication.get_authorization_header(request).split()

        if not auth_header:
            return None

        if auth_header[0].lower() != self.keyword.lower().encode():
            return None

        if len(auth_header) == 1:
            raise exceptions.AuthenticationFailed('Token no proporcionado.')

        if len(auth_header) > 2:
            raise exceptions.AuthenticationFailed('Header Authorization invalido.')

        token = auth_header[1].decode('utf-8')

        try:
            payload = decode_jwt_token(token)
        except jwt.ExpiredSignatureError as exc:
            raise exceptions.AuthenticationFailed('Token expirado.') from exc
        except jwt.InvalidTokenError as exc:
            raise exceptions.AuthenticationFailed('Token invalido.') from exc

        if payload.get('token_type') != 'access':
            raise exceptions.AuthenticationFailed('Se requiere un access token valido.')

        jti = payload.get('jti')
        if jti and is_token_blacklisted(jti):
            raise exceptions.AuthenticationFailed('Token invalidado por cierre de sesion.')

        id_usuario = payload.get('id_usuario')
        if not id_usuario:
            raise exceptions.AuthenticationFailed('Token sin id_usuario.')

        usuario = Usuario.objects.filter(id_usuario=id_usuario).select_related('id_rol').first()
        if usuario is None:
            raise exceptions.AuthenticationFailed('Usuario no encontrado.')

        if (usuario.estado or '').lower() != 'activo':
            raise exceptions.AuthenticationFailed('Usuario inactivo.')

        return (usuario, payload)
