# Despliegue a producción — Trendify

Backend en **Google Cloud Run** + **Cloud SQL Postgres** · Frontend en **Firebase Hosting**.

> **Estado (jun 2026):** Producción activa en GCP/Firebase. Cuenta: `cisnerosderek39@gmail.com`. Proyecto: `sistema-de-informacion-1`. Config gcloud: `proyecto-si1-general`. Frontend: https://sistema-de-informacion-1.web.app · Backend: https://trendify-backend-354954646440.southamerica-east1.run.app · Gemini CU24 vía **Vertex AI** (sin API key en producción).

---

## Variables que vas a usar (anotalas a medida que avanzas)

| Variable | Ejemplo / cómo obtenerla |
|---|---|
| `PROJECT_ID` | `sistema-de-informacion-1` (proyecto GCP + Firebase vinculados) |
| `REGION` | sugerido `southamerica-east1` (São Paulo) |
| `INSTANCE_NAME` | sugerido `trendify-db` |
| `INSTANCE_CONN_NAME` | `PROJECT_ID:REGION:INSTANCE_NAME` |
| `DB_PASSWORD` | password fuerte para usuario `trendify` (vos lo generás) |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `BACKEND_URL` | la imprime `gcloud run deploy`, ej. `https://trendify-backend-xxxx-rj.a.run.app` |
| `FIREBASE_PROJECT_ID` | de https://console.firebase.google.com |
| `FIREBASE_URL` | `https://FIREBASE_PROJECT_ID.web.app` |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` (región Vertex AI para Gemini; Cloud Run sigue en `southamerica-east1`) |
| `GEMINI_MODEL` | `gemini-2.5-flash` (CU24 — asistente de voz) |

---

## Fase 0 — Setup (una sola vez)

### 0.1 Instalar gcloud SDK
Bajar de https://cloud.google.com/sdk/docs/install (Windows installer). Reiniciar PowerShell.

```powershell
gcloud version
gcloud init    # login + crear/elegir proyecto

# Trendify: usar siempre esta config antes de deploy
gcloud config configurations activate proyecto-si1-general
gcloud config get-value account    # cisnerosderek39@gmail.com
gcloud config get-value project    # sistema-de-informacion-1
```

### 0.2 Habilitar billing y APIs
1. Habilitar **billing** en https://console.cloud.google.com/billing (necesita tarjeta — el uso para defensa cabe en free tier).
2. Habilitar APIs:
   ```powershell
   gcloud services enable run.googleapis.com sqladmin.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com generativelanguage.googleapis.com
   ```

### 0.3 Crear proyecto Firebase
- Ir a https://console.firebase.google.com → "Agregar proyecto" → seleccionar el mismo `PROJECT_ID` de GCP (los puede vincular automáticamente). Anotar `FIREBASE_PROJECT_ID`.

---

## Fase 2 — Cloud SQL Postgres

### 2.1 Crear instancia, BD y usuario
```powershell
gcloud sql instances create trendify-db `
    --database-version=POSTGRES_15 `
    --region=southamerica-east1 `
    --tier=db-f1-micro `
    --root-password=<RootPassFuerte>

gcloud sql databases create cosmetica_sistema --instance=trendify-db
gcloud sql users create trendify --instance=trendify-db --password=<DB_PASSWORD>
```

### 2.2 Cargar schema y seed (vía Cloud SQL Auth Proxy)

1. Bajar `cloud-sql-proxy.exe` de https://cloud.google.com/sql/docs/postgres/sql-proxy y ponerlo en `C:\Users\diego\bin\` (o donde prefieras).

2. En una terminal, mantener el proxy corriendo:
   ```powershell
   .\cloud-sql-proxy.exe PROJECT_ID:southamerica-east1:trendify-db
   ```

3. En otra terminal, aplicar schema + migraciones SQL:
   ```powershell
   $env:PGPASSWORD = '<DB_PASSWORD>'
   cd c:\Users\diego\Documents\GitHub\2026\backend\db
   $psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
   & $psql -U trendify -h 127.0.0.1 -d cosmetica_sistema -f 02_schema.sql
   & $psql -U trendify -h 127.0.0.1 -d cosmetica_sistema -f 03_seed.sql
   & $psql -U trendify -h 127.0.0.1 -d cosmetica_sistema -f 04_migracion_pago_cu09.sql
   & $psql -U trendify -h 127.0.0.1 -d cosmetica_sistema -f 05_migracion_rol_cliente.sql
   & $psql -U trendify -h 127.0.0.1 -d cosmetica_sistema -f 07_migracion_descripcion_usuario.sql
   & $psql -U trendify -h 127.0.0.1 -d cosmetica_sistema -f 08_migracion_pedidos_guardados.sql
   & $psql -U trendify -h 127.0.0.1 -d cosmetica_sistema -f 09_migracion_pago_transacciones.sql
   & $psql -U trendify -h 127.0.0.1 -d cosmetica_sistema -f 10_migracion_backfill_clientes_usuario.sql
   ```

4. Resetear passwords del seed apuntando al proxy:
   ```powershell
   $env:DATABASE_URL = "postgres://trendify:$env:PGPASSWORD@127.0.0.1:5432/cosmetica_sistema"
   cd c:\Users\diego\Documents\GitHub\2026\backend
   .\.venv\Scripts\python.exe scripts\reset_passwords_and_list_users.py
   ```

5. Marcar las migraciones de Django como aplicadas (porque las tablas de negocio ya las creó el SQL):
   ```powershell
   .\.venv\Scripts\python.exe manage.py migrate contenttypes auth admin sessions
   .\.venv\Scripts\python.exe manage.py migrate catalogos --fake
   ```

6. Detener el proxy (Ctrl+C en su terminal).

---

## Fase 3 — Deploy del backend en Cloud Run

### 3.1 Crear secrets en Secret Manager

```powershell
# 1) Generar SECRET_KEY (ejecutar y copiar el output)
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(50))"

# 2) Subir secrets (reemplazar placeholders)
"PEGAR_SECRET_KEY" | gcloud secrets create django-secret --data-file=-

"postgres://trendify:<DB_PASSWORD>@/cosmetica_sistema?host=/cloudsql/PROJECT_ID:southamerica-east1:trendify-db" | `
  gcloud secrets create db-url --data-file=-

"https://FIREBASE_PROJECT_ID.web.app,https://FIREBASE_PROJECT_ID.firebaseapp.com" | `
  gcloud secrets create cors-origins --data-file=-

"sk_live_REEMPLAZAR" | gcloud secrets create stripe-secret-key --data-file=-
"whsec_REEMPLAZAR" | gcloud secrets create stripe-webhook-secret --data-file=-
```

### 3.2 Dar al service account de Cloud Run permiso para leer secrets

```powershell
$PROJECT_NUMBER = gcloud projects describe PROJECT_ID --format="value(projectNumber)"
gcloud projects add-iam-policy-binding PROJECT_ID `
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"
```

### 3.3 Deploy

```powershell
cd c:\Users\diego\Documents\GitHub\2026\backend
gcloud run deploy trendify-backend `
    --source . `
    --region=southamerica-east1 `
    --platform=managed `
    --allow-unauthenticated `
    --add-cloudsql-instances=PROJECT_ID:southamerica-east1:trendify-db `
    --set-env-vars="DEBUG=False,ALLOWED_HOSTS=*,STRIPE_CURRENCY=BOB,FRONTEND_PUBLIC_URL=https://FIREBASE_PROJECT_ID.web.app,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=PROJECT_ID,GOOGLE_CLOUD_LOCATION=us-central1,GEMINI_MODEL=gemini-2.5-flash" `
    --set-secrets="SECRET_KEY=django-secret:latest,DATABASE_URL=db-url:latest,CORS_ALLOWED_ORIGINS=cors-origins:latest,CSRF_TRUSTED_ORIGINS=cors-origins:latest,STRIPE_SECRET_KEY=stripe-secret-key:latest,STRIPE_WEBHOOK_SECRET=stripe-webhook-secret:latest"
```

Cloud Build subirá la imagen y al terminar imprime la URL pública:
```
Service URL: https://trendify-backend-xxxxxxxx-rj.a.run.app
```

**Anotar esa URL** — se llama `BACKEND_URL` en el resto de los pasos.

### 3.4 Smoke test del backend

```powershell
curl https://trendify-backend-xxxxxxxx-rj.a.run.app/api/auth/login/ `
  -X POST -H "Content-Type: application/json" `
  -d '{\"username\":\"smartinez\",\"password\":\"123456\"}'
```

Debe devolver `access_token`. Si falla, revisar logs:
```powershell
gcloud run services logs read trendify-backend --region=southamerica-east1 --limit=50
```

### 3.5 Configurar webhook de Stripe (producción)

En Stripe Dashboard (modo live), crear un webhook apuntando a:

`https://trendify-backend-xxxxxxxx-rj.a.run.app/api/public/payments/webhook/stripe/`

Eventos requeridos:
- `checkout.session.completed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.failed`

Copiar el `whsec_...` y actualizar el secret:

```powershell
echo "whsec_NUEVO" | gcloud secrets versions add stripe-webhook-secret --data-file=-
```

### 3.6 Gemini / Vertex AI (CU24 — Asistente de voz)

Trendify usa **Gemini con function calling** sobre datos reales de PostgreSQL (`backend/catalogos/views_asistente.py` + `asistente_tools.py`). En producción se conecta a Google Cloud **sin API key expuesta**, usando la identidad del servicio de Cloud Run (Application Default Credentials).

#### Arquitectura

```
Frontend (Web Speech API)
  → POST /api/reportes/asistente/
  → Django (views_asistente.py)
  → Vertex AI Gemini 2.5 Flash (function calling)
  → asistente_tools.py → Cloud SQL Postgres
```

Las herramientas (`consultar_ventas_hoy`, `consultar_stock_producto`, etc.) reemplazan un motor RAG de GCP: los datos ya viven en la BD y Django los consulta.

#### Setup en GCP (una sola vez)

1. Habilitar APIs (incluido en Fase 0.2):
   ```powershell
   gcloud services enable aiplatform.googleapis.com generativelanguage.googleapis.com
   ```

2. Dar permiso Vertex AI a la cuenta de servicio de Cloud Run:
   ```powershell
   $PROJECT_NUMBER = gcloud projects describe PROJECT_ID --format="value(projectNumber)"
   gcloud projects add-iam-policy-binding PROJECT_ID `
     --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" `
     --role="roles/aiplatform.user"
   ```

3. Variables de entorno en Cloud Run (ya incluidas en el deploy de 3.3):

   | Variable | Valor producción |
   |---|---|
   | `GOOGLE_GENAI_USE_VERTEXAI` | `true` |
   | `GOOGLE_CLOUD_PROJECT` | `sistema-de-informacion-1` |
   | `GOOGLE_CLOUD_LOCATION` | `us-central1` |
   | `GEMINI_MODEL` | `gemini-2.5-flash` |

   Cloud Run corre en `southamerica-east1`; Vertex AI usa `us-central1` porque Gemini 2.5 Flash está disponible ahí. La latencia extra es aceptable para consultas de voz.

#### Desarrollo local (API key)

En local no hay cuenta de servicio de Cloud Run, así que se usa **Gemini Developer API** con clave en `backend/.env.local`:

```env
GEMINI_API_KEY=REEMPLAZAR   # GCP Console → "Crear clave de API de Gemini"
GEMINI_MODEL=gemini-2.5-flash
```

Copiar plantilla: `backend/.env.local.example`. La lógica está en `backend/catalogos/gemini_config.py`:
- **Producción:** `GOOGLE_GENAI_USE_VERTEXAI=true` → `genai.Client(vertexai=True, ...)`
- **Local:** `GEMINI_API_KEY=...` → `genai.Client(api_key=...)`
- **Sin config:** fallback a reglas en el frontend

#### Recomendaciones de la consola GCP vs Trendify

| Recomendación GCP | ¿Usar en Trendify? |
|---|---|
| Crear clave de API de Gemini | Sí, solo para **desarrollo local** |
| Vertex AI / Gemini en Cloud Run (ADC) | Sí, **producción actual** |
| Crear un agente (Agent Platform) | No — CU24 ya implementado en Django |
| Motor RAG personalizado | No — function calling sobre Postgres |
| Model Garden | Opcional futuro (cambiar modelo) |
| BigQuery | Opcional futuro (analítica masiva) |

#### Verificar CU24 en producción

1. Login staff en https://sistema-de-informacion-1.web.app (`smartinez` / `123456`).
2. Abrir el panel del **Asistente de voz**.
3. Preguntar: *"¿Cuánto vendimos hoy?"*
4. En DevTools → respuesta de `/api/reportes/asistente/` debe incluir `"modo": "gemini"` (no `"reglas"`).

Si falla:
```powershell
gcloud run services logs read trendify-backend --region=southamerica-east1 --limit=30
```

Errores comunes:
- `403` / permisos → falta rol `roles/aiplatform.user` en la service account de Cloud Run.
- `"modo": "reglas"` → faltan env vars Vertex o API no habilitada.
- Modelo no disponible → confirmar `GEMINI_MODEL=gemini-2.5-flash` y región `us-central1`.

#### Monitoreo de tokens y costo (CU24)

Cada respuesta del asistente incluye un bloque `tokens` cuando Gemini responde:

```json
"tokens": {
  "rondas": 2,
  "input": 8200,
  "output": 230,
  "total": 8430,
  "costo_estimado_usd": 0.003035
}
```

También se escribe en logs de Cloud Run:

```powershell
gcloud run services logs read trendify-backend --region=southamerica-east1 --limit=20 | Select-String Gemini
```

Precio usado en la estimación: **$0.30/M input**, **$2.50/M output** (`gemini-2.5-flash`).

#### Alerta de presupuesto Vertex AI (USD 5/mes)

Budget creado en la cuenta de facturación del proyecto:

```powershell
gcloud billing budgets list --billing-account=01C151-03F41F-20ACE5
```

- **Nombre:** `Trendify Vertex AI - alerta USD 5`
- **Límite:** USD 5/mes (solo servicio Vertex AI, proyecto `sistema-de-informacion-1`)
- **Alertas:** 50 %, 90 % y 100 % del presupuesto
- **Destinatarios:** administradores de la cuenta de facturación GCP (correo vinculado a `cisnerosderek39@gmail.com`)

Para ver o editar: [GCP Console → Billing → Budgets & alerts](https://console.cloud.google.com/billing/budgets).

---

## Fase 4 — Deploy del frontend en Firebase Hosting

### 4.1 Apuntar el frontend al backend real

Editar `frontend/.env.production` y reemplazar el placeholder:
```
VITE_API_BASE_URL=https://trendify-backend-xxxxxxxx-rj.a.run.app
```

### 4.2 Inicializar Firebase Hosting

```powershell
cd c:\Users\diego\Documents\GitHub\2026\frontend
firebase init hosting
```

Responder al wizard:
- **Project**: `Use an existing project` → seleccionar `FIREBASE_PROJECT_ID`
- **Public directory**: `dist`
- **Configure as single-page app**: `Yes`
- **Set up automatic builds with GitHub**: `No`
- **Overwrite dist/index.html**: `No`

Genera `firebase.json` y `.firebaserc`.

### 4.3 Build + deploy

```powershell
npm run build
firebase deploy --only hosting
```

Imprime: `Hosting URL: https://FIREBASE_PROJECT_ID.web.app`.

---

## Fase 5 — Verificación end-to-end en producción

1. Abrir `https://FIREBASE_PROJECT_ID.web.app` en el navegador.
2. Tienda pública debe cargar con productos (placeholder o imagen si copiaste a `frontend/public/products/` antes del build).
3. Click en "Acceso personal" → login con `smartinez` / `123456`.
4. En DevTools → Network: verificar que las llamadas van a `https://trendify-backend-xxxxxxxx-rj.a.run.app/api/...` y devuelven 200.
5. Probar flujo completo:
   - **CU13**: crear un proveedor.
   - **CU12**: registrar una compra → stock sube.
   - **CU08+CU09**: vender en Caja con efectivo → vuelto correcto.
   - **CU10**: descargar PDF del recibo.
   - **CU11**: ver inventario actualizado.
   - **CU24**: asistente de voz con Gemini (ver Fase 3.6).
6. Si hay error CORS, revisar el secret `cors-origins` y el dominio exacto de Firebase.

---

## Updates posteriores

### Backend (cambio de código)

Repetir el comando completo de Fase 3.3 para conservar secrets y variables Gemini:

```powershell
gcloud config configurations activate proyecto-si1-general
cd c:\Users\diego\Documents\GitHub\2026\backend
gcloud run deploy trendify-backend `
    --source . `
    --region=southamerica-east1 `
    --platform=managed `
    --allow-unauthenticated `
    --add-cloudsql-instances=sistema-de-informacion-1:southamerica-east1:trendify-db `
    --set-env-vars="DEBUG=False,ALLOWED_HOSTS=*,STRIPE_CURRENCY=BOB,FRONTEND_PUBLIC_URL=https://sistema-de-informacion-1.web.app,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=sistema-de-informacion-1,GOOGLE_CLOUD_LOCATION=us-central1,GEMINI_MODEL=gemini-2.5-flash" `
    --set-secrets="SECRET_KEY=django-secret:latest,DATABASE_URL=db-url:latest,CORS_ALLOWED_ORIGINS=cors-origins:latest,CSRF_TRUSTED_ORIGINS=cors-origins:latest,STRIPE_SECRET_KEY=stripe-secret-key:latest,STRIPE_WEBHOOK_SECRET=stripe-webhook-secret:latest"
```

### Frontend (cambio de código o de imágenes en `public/products/`)
```powershell
cd c:\Users\diego\Documents\GitHub\2026\frontend
npm run build
firebase deploy --only hosting
```

### Cambio de schema/seed en BD
1. Levantar Cloud SQL Auth Proxy (Fase 2.2 paso 2).
2. Aplicar el script SQL nuevo con `psql -U trendify -h 127.0.0.1 -d cosmetica_sistema -f <archivo.sql>`.

---

## Estimación de costo (free tier de GCP en 2026)

| Servicio | Free tier | Notas |
|---|---|---|
| Cloud Run | 2 M requests/mes + 360k GB-segundos | Suficiente para defensa académica |
| Cloud SQL `db-f1-micro` | NO está en free tier permanente, pero hay $300 USD de crédito inicial | Costo estimado: ~$8-10 USD/mes si se deja prendida |
| Cloud Build | 120 builds-min/día | Sobra |
| Secret Manager | 6 secrets activos gratis | OK |
| Firebase Hosting | 10 GB transfer/mes + 360 MB storage | OK |
| Vertex AI (Gemini) | Pay-per-use; uso académico bajo | CU24; modelo `gemini-2.5-flash` |

**Tip:** después de la defensa, `gcloud sql instances delete trendify-db` para no seguir pagando.
