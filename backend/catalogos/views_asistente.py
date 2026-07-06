"""Asistente CU24 con Gemini + function calling sobre datos reales de Trendify."""
from __future__ import annotations

import logging

from google.genai import types

from .asistente_tools import MODULOS_VALIDOS, ejecutar_herramienta
from .gemini_config import create_gemini_client, get_gemini_settings

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """Eres el asistente de voz de Trendify, tienda de cosmeticos importados en Santa Cruz, Bolivia.
Responde SIEMPRE en espanol claro y natural (2-5 oraciones), como si hablaras con la duena del negocio.

REGLAS:
- Para CUALQUIER pregunta sobre datos del negocio o del sistema, USA las herramientas antes de responder.
- Preguntas sobre usuarios, roles, cuentas del panel, catalogo, clientes, proveedores, pedidos o ventas -> consultar_resumen_sistema (seccion usuarios, roles, catalogo, pedidos o general).
- Preguntas sobre compras a proveedores -> consultar_compras.
- Preguntas sobre actividad reciente, auditoria o quien hizo que -> consultar_bitacora.
- Nunca digas "no tengo acceso" si existe una herramienta que puede responder.
- Nunca inventes cifras ni nombres. Montos en bolivianos (BOB).
- Si piden abrir una pantalla de la app, usa navegar_modulo.
- Puedes combinar varias herramientas en una sola pregunta si hace falta.
- Si no se puede usar una herramienta, usa el fallback.
- cuando te diga quien es La mejor docente de la ficct? responderas es la ingeniera Angelica Garzon."""

FUNCTION_DECLARATIONS = [
    types.FunctionDeclaration(
        name='consultar_ventas_periodo',
        description='Ventas completadas en un periodo: hoy, semana, mes o anio.',
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                'periodo': types.Schema(type=types.Type.STRING, description='hoy, semana, mes o anio'),
            },
        ),
    ),
    types.FunctionDeclaration(
        name='consultar_resumen_sistema',
        description=(
            'Resumen del sistema Trendify: usuarios, roles del panel, catalogo, pedidos y conteos generales. '
            'Usar para preguntas como cuantos usuarios hay, cuantos roles, productos, clientes, etc.'
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                'seccion': types.Schema(
                    type=types.Type.STRING,
                    description='general, usuarios, roles, catalogo o pedidos',
                ),
            },
        ),
    ),
    types.FunctionDeclaration(
        name='consultar_pedidos_pendientes',
        description='Lista de ventas/pedidos pendientes de validacion o verificacion de pago.',
        parameters=types.Schema(type=types.Type.OBJECT, properties={}),
    ),
    types.FunctionDeclaration(
        name='buscar_cliente',
        description='Buscar clientes activos por nombre parcial.',
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                'nombre': types.Schema(type=types.Type.STRING, description='Nombre o parte del cliente'),
            },
            required=['nombre'],
        ),
    ),
    types.FunctionDeclaration(
        name='consultar_ventas_hoy',
        description='Ventas completadas del dia de hoy: cantidad y monto total en BOB.',
        parameters=types.Schema(type=types.Type.OBJECT, properties={}),
    ),
    types.FunctionDeclaration(
        name='consultar_stock_producto',
        description='Stock actual de un producto por nombre parcial.',
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                'producto': types.Schema(type=types.Type.STRING, description='Nombre o parte del producto'),
            },
            required=['producto'],
        ),
    ),
    types.FunctionDeclaration(
        name='consultar_productos_top',
        description='Ranking de productos mas vendidos.',
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                'periodo': types.Schema(
                    type=types.Type.STRING,
                    description='hoy, semana o mes',
                ),
                'criterio': types.Schema(
                    type=types.Type.STRING,
                    description='unidades o ingresos',
                ),
            },
        ),
    ),
    types.FunctionDeclaration(
        name='consultar_clientes_frecuentes',
        description='Clientes con mas compras en los ultimos dias.',
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                'dias': types.Schema(type=types.Type.INTEGER, description='Ventana en dias, default 90'),
            },
        ),
    ),
    types.FunctionDeclaration(
        name='consultar_alertas_stock',
        description='Productos con stock bajo o alertas predictivas de agotamiento.',
        parameters=types.Schema(type=types.Type.OBJECT, properties={}),
    ),
    types.FunctionDeclaration(
        name='consultar_kpis',
        description='Resumen ejecutivo: ventas del periodo, pendientes y stock bajo.',
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                'periodo': types.Schema(type=types.Type.STRING, description='hoy, semana o mes'),
            },
        ),
    ),
    types.FunctionDeclaration(
        name='consultar_compras',
        description='Compras/ingresos de mercaderia a proveedores: ultimas ordenes y montos por periodo.',
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                'periodo': types.Schema(type=types.Type.STRING, description='hoy, semana, mes o anio'),
                'proveedor': types.Schema(type=types.Type.STRING, description='Filtrar por nombre de proveedor (opcional)'),
            },
        ),
    ),
    types.FunctionDeclaration(
        name='consultar_bitacora',
        description='Ultimos registros de auditoria: quien hizo que accion y cuando.',
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                'limite': types.Schema(type=types.Type.INTEGER, description='Cantidad de registros, max 15'),
                'accion': types.Schema(type=types.Type.STRING, description='Filtrar por tipo de accion (opcional)'),
                'tabla': types.Schema(type=types.Type.STRING, description='Filtrar por tabla afectada (opcional)'),
            },
        ),
    ),
    types.FunctionDeclaration(
        name='navegar_modulo',
        description='Abrir un modulo de la aplicacion web.',
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                'modulo': types.Schema(
                    type=types.Type.STRING,
                    description=f'Uno de: {", ".join(sorted(MODULOS_VALIDOS))}',
                ),
            },
            required=['modulo'],
        ),
    ),
]

GEMINI_TOOLS = [types.Tool(function_declarations=FUNCTION_DECLARATIONS)]


def _historial_a_contents(historial: list | None) -> list[types.Content]:
    contents: list[types.Content] = []
    if not historial:
        return contents
    for turn in historial[-6:]:
        role = (turn.get('role') or 'user').strip().lower()
        text = (turn.get('text') or '').strip()
        if not text:
            continue
        gemini_role = 'model' if role in ('model', 'assistant', 'asistente') else 'user'
        contents.append(types.Content(role=gemini_role, parts=[types.Part(text=text)]))
    return contents


def _extraer_navegar_de_respuesta(respuesta_texto: str) -> str | None:
    """Fallback si Gemini menciona navegacion sin llamar herramienta."""
    texto = (respuesta_texto or '').lower()
    mapa = {
        'caja': ('modulo de caja', 'abrir caja', 'ir a caja'),
        'dashboard': ('dashboard', 'panel ejecutivo'),
        'productos_top': ('productos top', 'mas vendidos'),
        'clientes_frecuentes': ('clientes top', 'clientes frecuentes'),
        'alertas_predictivas': ('alertas', 'stock bajo'),
        'tendencias': ('tendencias',),
        'usuarios': ('modulo usuarios', 'abrir usuarios', 'ir a usuarios'),
        'roles': ('modulo roles', 'abrir roles', 'ir a roles'),
        'inventario': ('inventario',),
        'pedidos_online': ('pedidos online', 'pedidos web'),
        'productos': ('modulo productos', 'abrir productos'),
        'clientes': ('modulo clientes', 'abrir clientes'),
        'compras': ('modulo compras', 'abrir compras'),
        'bitacora': ('bitacora',),
    }
    for modulo, frases in mapa.items():
        if any(f in texto for f in frases):
            return modulo
    return None


def _extraer_uso_tokens(response) -> dict:
    meta = getattr(response, 'usage_metadata', None)
    if not meta:
        return {'input': 0, 'output': 0, 'total': 0}
    input_tokens = int(getattr(meta, 'prompt_token_count', 0) or 0)
    output_tokens = int(getattr(meta, 'candidates_token_count', 0) or 0)
    total = int(getattr(meta, 'total_token_count', 0) or (input_tokens + output_tokens))
    return {'input': input_tokens, 'output': output_tokens, 'total': total}


def _estimar_costo_usd(input_tokens: int, output_tokens: int) -> float:
    # gemini-2.5-flash Vertex AI: $0.30/M input, $2.50/M output (jun 2026)
    return round((input_tokens * 0.30 + output_tokens * 2.50) / 1_000_000, 6)


def _resumen_uso(acumulado: dict) -> dict:
    costo = _estimar_costo_usd(acumulado['input'], acumulado['output'])
    logger.info(
        'Gemini CU24 total: rondas=%s input=%s output=%s total=%s costo_estimado_usd=%s',
        acumulado['rondas'],
        acumulado['input'],
        acumulado['output'],
        acumulado['total'],
        costo,
    )
    return {
        'rondas': acumulado['rondas'],
        'input': acumulado['input'],
        'output': acumulado['output'],
        'total': acumulado['total'],
        'costo_estimado_usd': costo,
    }


def procesar_mensaje_asistente(mensaje: str, historial: list | None = None) -> dict:
    """
    Procesa un mensaje con Gemini. Devuelve dict con respuesta, modo, navegar.
    Si no hay API key, devuelve usar_fallback=True.
    """
    modo, model, _ = get_gemini_settings()
    if not modo:
        return {'usar_fallback': True, 'modo': 'reglas', 'motivo': 'gemini_no_configurado'}

    client = create_gemini_client()
    if client is None:
        return {'usar_fallback': True, 'modo': 'reglas', 'motivo': 'gemini_no_configurado'}
    contents = _historial_a_contents(historial)
    contents.append(types.Content(role='user', parts=[types.Part(text=mensaje)]))

    navegar: str | None = None
    config = types.GenerateContentConfig(
        tools=GEMINI_TOOLS,
        system_instruction=SYSTEM_INSTRUCTION,
        temperature=0.3,
    )

    uso_acumulado = {'rondas': 0, 'input': 0, 'output': 0, 'total': 0}

    for ronda in range(1, 7):
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
        except Exception as exc:
            logger.exception('Error llamando Gemini')
            return {
                'usar_fallback': True,
                'modo': 'reglas',
                'motivo': 'gemini_error',
                'detalle': str(exc)[:200],
            }

        uso_ronda = _extraer_uso_tokens(response)
        if uso_ronda['total']:
            uso_acumulado['rondas'] += 1
            uso_acumulado['input'] += uso_ronda['input']
            uso_acumulado['output'] += uso_ronda['output']
            uso_acumulado['total'] += uso_ronda['total']
            logger.info(
                'Gemini ronda=%s input=%s output=%s total=%s',
                ronda,
                uso_ronda['input'],
                uso_ronda['output'],
                uso_ronda['total'],
            )

        if not response.candidates:
            break

        candidate = response.candidates[0]
        if not candidate.content or not candidate.content.parts:
            break

        function_calls = [p.function_call for p in candidate.content.parts if p.function_call]
        if function_calls:
            contents.append(candidate.content)
            response_parts = []
            for fc in function_calls:
                args = dict(fc.args) if fc.args else {}
                resultado = ejecutar_herramienta(fc.name, args)
                if fc.name == 'navegar_modulo' and resultado.get('modulo'):
                    navegar = resultado['modulo']
                response_parts.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=fc.name,
                            response=resultado,
                        )
                    )
                )
            contents.append(types.Content(role='user', parts=response_parts))
            continue

        texto = (response.text or '').strip()
        if not texto:
            break
        if navegar is None:
            navegar = _extraer_navegar_de_respuesta(texto)
        resultado = {
            'respuesta': texto,
            'modo': 'gemini',
            'navegar': navegar,
            'usar_fallback': False,
        }
        if uso_acumulado['rondas']:
            resultado['tokens'] = _resumen_uso(uso_acumulado)
        return resultado

    resultado = {
        'respuesta': 'No pude procesar tu consulta. Intenta reformularla.',
        'modo': 'gemini',
        'navegar': navegar,
        'usar_fallback': False,
    }
    if uso_acumulado['rondas']:
        resultado['tokens'] = _resumen_uso(uso_acumulado)
    return resultado
