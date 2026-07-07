# Despliegue - Trendify Favoritos

Este documento corresponde al proyecto **Sistema-Trendify-Favoritos** del ciclo 5.
El despliegue actual usa Google Cloud para frontend, backend, base de datos y secretos.

## Produccion actual

| Elemento | Valor |
|----------|-------|
| Proyecto GCP | `project-cd88757d-ed1e-4c87-a75` |
| Region Cloud Run | `southamerica-east1` |
| Frontend | `trendify-favoritos-frontend` |
| Backend | `trendify-favoritos-backend` |
| Base de datos | Cloud SQL PostgreSQL `trendify-db` |
| Nombre BD | `cosmetica_sistema` |
| Usuario BD | `trendify` |

URLs:

- Frontend: https://trendify-favoritos-frontend-498827330256.southamerica-east1.run.app/
- Backend API: https://trendify-favoritos-backend-498827330256.southamerica-east1.run.app/api/

## Arquitectura de despliegue

```text
Cliente navegador
  -> Google Cloud Run frontend (React + Vite + Nginx)
  -> Google Cloud Run backend (Django REST Framework)
  -> Cloud SQL PostgreSQL
  -> Secret Manager
```

El frontend consume la API del backend mediante `VITE_API_BASE_URL`, configurado en:

```text
frontend/.env.production
```

## Modulo Favoritos en produccion

El ciclo 5 agrego:

- Tabla `favoritos` en PostgreSQL.
- Modelo `Favorito` en Django.
- Serializer `FavoritoDetalleSerializer`.
- Vista `MisFavoritosView`.
- Ruta `/api/mis-favoritos/`.
- Ranking publico `/api/public/productos-populares/`.
- Interfaz en `TiendaPublica.jsx` con estrella, contador y seccion **Mis Favoritos**.

### Endpoints

| Metodo | Endpoint | Funcion |
|--------|----------|---------|
| `GET` | `/api/mis-favoritos/` | Lista favoritos del cliente autenticado. |
| `POST` | `/api/mis-favoritos/` | Agrega favorito con `{ "id_producto": 1 }`. |
| `DELETE` | `/api/mis-favoritos/` | Quita favorito con `{ "id_producto": 1 }`. |
| `GET` | `/api/public/productos-populares/` | Lista Top 10 por cantidad de favoritos. |

## Variables y secrets

Secrets usados por backend en Cloud Run:

| Secret Manager | Variable en backend | Uso |
|----------------|---------------------|-----|
| `django-secret` | `SECRET_KEY` | Clave interna Django. |
| `db-url` | `DATABASE_URL` | Conexion a Cloud SQL. |
| `cors-origins` | `CORS_ALLOWED_ORIGINS` | Origen permitido del frontend. |
| `cors-origins` | `CSRF_TRUSTED_ORIGINS` | Origen confiable CSRF. |
| `stripe-secret-key` | `STRIPE_SECRET_KEY` | Stripe test secret key. |
| `stripe-webhook-secret` | `STRIPE_WEBHOOK_SECRET` | Firma del webhook Stripe. |

Variables no secret:

```text
DEBUG=False
ALLOWED_HOSTS=*
STRIPE_CURRENCY=BOB
FRONTEND_PUBLIC_URL=https://trendify-favoritos-frontend-498827330256.southamerica-east1.run.app
GOOGLE_CLOUD_PROJECT=project-cd88757d-ed1e-4c87-a75
```

## Desplegar backend

Desde la carpeta `backend`:

```powershell
gcloud config set project project-cd88757d-ed1e-4c87-a75

gcloud run deploy trendify-favoritos-backend `
  --source . `
  --region=southamerica-east1 `
  --platform=managed `
  --allow-unauthenticated `
  --add-cloudsql-instances=project-cd88757d-ed1e-4c87-a75:southamerica-east1:trendify-db `
  --set-env-vars="DEBUG=False,ALLOWED_HOSTS=*,STRIPE_CURRENCY=BOB,FRONTEND_PUBLIC_URL=https://trendify-favoritos-frontend-498827330256.southamerica-east1.run.app,GOOGLE_CLOUD_PROJECT=project-cd88757d-ed1e-4c87-a75" `
  --set-secrets="SECRET_KEY=django-secret:latest,DATABASE_URL=db-url:latest,CORS_ALLOWED_ORIGINS=cors-origins:latest,CSRF_TRUSTED_ORIGINS=cors-origins:latest,STRIPE_SECRET_KEY=stripe-secret-key:latest,STRIPE_WEBHOOK_SECRET=stripe-webhook-secret:latest"
```

## Desplegar frontend

Verificar primero:

```text
frontend/.env.production
```

Debe contener:

```env
VITE_API_BASE_URL=https://trendify-favoritos-backend-498827330256.southamerica-east1.run.app
```

Desde la carpeta `frontend`:

```powershell
gcloud config set project project-cd88757d-ed1e-4c87-a75

gcloud run deploy trendify-favoritos-frontend `
  --source . `
  --region=southamerica-east1 `
  --platform=managed `
  --allow-unauthenticated
```

## Aplicar cambios de base de datos

Si el cambio requiere SQL nuevo, usar Cloud SQL Auth Proxy y ejecutar el archivo contra
`cosmetica_sistema`.

Para el modulo Favoritos, el archivo importante es:

```text
backend/db/11_migracion_favoritos.sql
```

Ese script crea:

```sql
favoritos(
  id_favorito,
  id_usuario,
  id_producto
)
```

con:

- PK: `id_favorito`
- FK: `id_usuario -> usuarios(id_usuario)`
- FK: `id_producto -> productos(id_producto)`
- UNIQUE: `(id_usuario, id_producto)`

## Verificacion despues del deploy

Frontend:

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://trendify-favoritos-frontend-498827330256.southamerica-east1.run.app/
```

Backend productos:

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://trendify-favoritos-backend-498827330256.southamerica-east1.run.app/api/public/productos/
```

Backend populares:

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://trendify-favoritos-backend-498827330256.southamerica-east1.run.app/api/public/productos-populares/
```

Los tres deben responder `200`.

Webhook Stripe:

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://trendify-favoritos-backend-498827330256.southamerica-east1.run.app/api/public/payments/webhook/stripe/
```

Un `GET` normalmente responde `405`, porque Stripe envia `POST`. Eso confirma que la
ruta existe.

## Stripe

Webhook configurado en Stripe Dashboard:

```text
https://trendify-favoritos-backend-498827330256.southamerica-east1.run.app/api/public/payments/webhook/stripe/
```

Eventos recomendados:

- `checkout.session.completed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.failed`

El signing secret debe empezar con `whsec_` y se guarda en:

```text
stripe-webhook-secret
```

## Flujo para publicar cambios

1. Cambiar codigo local.
2. Probar localmente.
3. Si cambia backend, desplegar `trendify-favoritos-backend`.
4. Si cambia frontend, desplegar `trendify-favoritos-frontend`.
5. Verificar endpoints con `curl`.
6. Abrir frontend y hacer recarga fuerte con `Ctrl + F5`.

## Checks locales antes de desplegar

Django:

```powershell
docker compose -p trendify-favoritos exec -T backend python manage.py check
```

Frontend:

```powershell
docker compose -p trendify-favoritos exec -T frontend npm run build
```

## Costos

Cloud SQL puede generar costo mientras este encendido. Antes de crear, modificar o dejar
recursos corriendo por mucho tiempo, revisar billing en Google Cloud.

Servicios usados:

- Cloud Run
- Cloud Build
- Cloud SQL PostgreSQL
- Secret Manager
