"""Configuracion Gemini: API key local o Vertex AI en Cloud Run (ADC)."""
from __future__ import annotations

import os

from google import genai

_ENV_FILENAMES = ('.env.local', '.env')


def _read_env_files(key: str) -> str:
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    for filename in _ENV_FILENAMES:
        env_path = os.path.join(base, filename)
        if not os.path.exists(env_path):
            continue
        try:
            with open(env_path, 'r', encoding='utf-8') as handle:
                for raw_line in handle:
                    line = raw_line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    k, v = line.split('=', 1)
                    if k.strip() == key:
                        return v.strip().strip('"').strip("'")
        except OSError:
            continue
    return ''


def _env_bool(key: str, default: bool = False) -> bool:
    raw = (os.environ.get(key) or _read_env_files(key)).strip().lower()
    if not raw:
        return default
    return raw in ('1', 'true', 'yes', 'on')


def get_gemini_settings() -> tuple[str, str, str]:
    """
    Devuelve (modo, model, detalle).
    modo: 'vertex' | 'api_key' | ''
    """
    model = (
        os.environ.get('GEMINI_MODEL')
        or _read_env_files('GEMINI_MODEL')
        or 'gemini-2.5-flash'
    ).strip()

    if _env_bool('GOOGLE_GENAI_USE_VERTEXAI'):
        project = (
            os.environ.get('GOOGLE_CLOUD_PROJECT')
            or os.environ.get('GCP_PROJECT')
            or _read_env_files('GOOGLE_CLOUD_PROJECT')
            or ''
        ).strip()
        location = (
            os.environ.get('GOOGLE_CLOUD_LOCATION')
            or _read_env_files('GOOGLE_CLOUD_LOCATION')
            or 'us-central1'
        ).strip()
        return 'vertex', model, f'{project}:{location}'

    api_key = (os.environ.get('GEMINI_API_KEY') or _read_env_files('GEMINI_API_KEY')).strip()
    if api_key:
        return 'api_key', model, 'api_key'

    return '', model, ''


def create_gemini_client() -> genai.Client | None:
    modo, _, detalle = get_gemini_settings()
    if modo == 'vertex':
        project, _, location = detalle.partition(':')
        if not project:
            return None
        return genai.Client(vertexai=True, project=project, location=location or 'us-central1')
    if modo == 'api_key':
        api_key = (os.environ.get('GEMINI_API_KEY') or _read_env_files('GEMINI_API_KEY')).strip()
        if api_key:
            return genai.Client(api_key=api_key)
    return None
