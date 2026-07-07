# Sistema Trendify - Ciclo 5 Favoritos

Proyecto por capas:

- **backend:** Django + Django REST Framework + PostgreSQL
- **frontend:** React + Vite + TailwindCSS
- **produccion:** Google Cloud Run + Cloud SQL PostgreSQL + Secret Manager

Esta copia corresponde al proyecto **Sistema-Trendify-Favoritos**. Es una version
independiente del sistema Trendify original para trabajar el ciclo 5 sin tocar la rama
principal del proyecto base.

## Ciclo 5: Modulo Favoritos

El sistema base ya tenia catalogo publico, productos, categorias, marcas, clientes,
usuarios, carrito, pedidos, ventas, inventario y pagos. En este ciclo se agrego el
modulo **Favoritos**, orientado a mejorar la experiencia del cliente dentro de la tienda
publica.

### Funcionalidades agregadas

- Marcar productos como favoritos desde el catalogo publico.
- Mostrar estrella vacia o rellena segun el estado del producto.
- Evitar favoritos duplicados por cliente y producto.
- Mostrar contador de favoritos en el header.
- Mostrar seccion **Mis Favoritos** en la pagina principal.
- Quitar productos desde **Mis Favoritos** o desde la estrella del catalogo.
- Agregar un producto favorito al carrito usando el boton **Comprar**.
- Mostrar **Productos mas vendidos**, alimentado por productos con mas favoritos.

> Nota: en este ciclo, "Productos mas vendidos" funciona como ranking de popularidad
> basado en favoritos. No usa ventas reales como fuente del ranking.

## Donde esta cada cosa

| Capa | Archivo | Responsabilidad |
|------|---------|-----------------|
| Base de datos | [backend/db/11_migracion_favoritos.sql](backend/db/11_migracion_favoritos.sql) | Crea tabla `favoritos`, llaves foraneas y restriccion unica. |
| Modelo | [backend/catalogos/models.py](backend/catalogos/models.py) | Define `Favorito` y su relacion con `Usuario` y `Producto`. |
| Serializers | [backend/catalogos/serializers.py](backend/catalogos/serializers.py) | Define `FavoritoDetalleSerializer` y `ProductoPopularSerializer`. |
| Vistas/API | [backend/catalogos/views.py](backend/catalogos/views.py) | Define `MisFavoritosView` y `ProductoPopularViewSet`. |
| Rutas | [backend/catalogos/urls.py](backend/catalogos/urls.py) | Registra `/api/mis-favoritos/` y `/api/public/productos-populares/`. |
| Frontend | [frontend/src/components/TiendaPublica.jsx](frontend/src/components/TiendaPublica.jsx) | Maneja estado, carga, estrella, contador y seccion de favoritos. |
| Iconos | [frontend/package.json](frontend/package.json) | Incluye `lucide-react` para el icono `Star`. |

## Endpoints del modulo

| Metodo | Endpoint | Body | Uso | Acceso |
|--------|----------|------|-----|--------|
| `GET` | `/api/mis-favoritos/` | No aplica | Lista los favoritos del cliente autenticado. | Cliente autenticado |
| `POST` | `/api/mis-favoritos/` | `{ "id_producto": 1 }` | Agrega un producto a favoritos. | Cliente autenticado |
| `DELETE` | `/api/mis-favoritos/` | `{ "id_producto": 1 }` | Elimina un producto de favoritos. | Cliente autenticado |
| `GET` | `/api/public/productos-populares/` | No aplica | Devuelve Top 10 productos con mas favoritos. | Publico |

## Flujo de Favoritos

1. El cliente ingresa a la tienda publica.
2. El frontend carga productos, categorias y marcas.
3. Si el usuario esta autenticado como cliente, el frontend consulta `/api/mis-favoritos/`.
4. `TiendaPublica.jsx` guarda los IDs favoritos en `favoritoIds`, usando un `Set`.
5. Cada tarjeta de producto muestra una estrella con `lucide-react`.
6. Al presionar la estrella, `toggleFavorito(producto)` decide si hace `POST` o `DELETE`.
7. El backend valida autenticacion, rol cliente, existencia del producto y duplicados.
8. La tabla `favoritos` guarda la relacion entre `id_usuario` e `id_producto`.
9. El frontend actualiza estrella, contador y seccion **Mis Favoritos**.
10. Desde **Mis Favoritos**, el cliente puede quitar el producto o agregarlo al carrito.

## Como trabaja el codigo

### Backend

`MisFavoritosView` esta en [backend/catalogos/views.py](backend/catalogos/views.py). Usa
`CustomJWTAuthentication` e `IsClienteRole`, por lo que solo un cliente autenticado puede
listar, agregar o eliminar favoritos.

- `GET`: filtra `Favorito` por `id_usuario=request.user`.
- `POST`: recibe `id_producto`, valida que exista y este activo, y usa `get_or_create`.
- `DELETE`: elimina el favorito del usuario autenticado para el producto enviado.

El modelo `Favorito` esta en [backend/catalogos/models.py](backend/catalogos/models.py) y
usa `unique_together = ('id_usuario', 'id_producto')`. La base de datos tambien refuerza
esa regla con `UNIQUE(id_usuario, id_producto)`.

`ProductoPopularViewSet` calcula el ranking publico de populares. Cuenta la relacion
inversa `favoritos`, filtra productos activos con stock y ordena por `favoritos_count`
descendente.

### Frontend

La tienda publica vive en [frontend/src/components/TiendaPublica.jsx](frontend/src/components/TiendaPublica.jsx).
Los puntos principales son:

- `favoritoIds`: `Set` con los productos favoritos del cliente.
- `cargarFavoritos()`: consulta `/api/mis-favoritos/`.
- `toggleFavorito(producto)`: hace `POST` si no es favorito y `DELETE` si ya lo es.
- `productosFavoritos`: lista derivada del catalogo filtrando por `favoritoIds`.
- `scrollToFavoritos()`: lleva al usuario a la seccion **Mis Favoritos**.
- `PUBLIC_PRODUCTOS_POPULARES_URL`: carga `/api/public/productos-populares/`.

La carga de favoritos esta separada de la carga publica del catalogo. Asi, si un usuario
no esta logueado, el catalogo sigue cargando normalmente y solo se bloquea la accion de
guardar favoritos.

## Requisitos

Elige una forma de correr el proyecto:

| Modo | Necesitas |
|------|-----------|
| Docker recomendado | Docker Desktop en ejecucion |
| Manual en Windows | PostgreSQL 15+, Python 3.11+, Node.js 20+ |

Credenciales locales por defecto:

- Base: `cosmetica_sistema`
- Usuario PostgreSQL: `postgres`
- Password local historico: `diego`
- Usuarios seed: password `123456`

## Opcion A: Docker recomendado

Desde la raiz del repo:

```powershell
docker compose -p trendify-favoritos up --build
```

URLs locales:

| Servicio | URL |
|----------|-----|
| Frontend | http://127.0.0.1:5175 |
| API directa | http://127.0.0.1:8001/api/ |
| PostgreSQL host | `127.0.0.1:5433` |

Comandos utiles:

| Situacion | Comando |
|-----------|---------|
| Levantar normal | `docker compose -p trendify-favoritos up` |
| Reconstruir imagenes | `docker compose -p trendify-favoritos up --build` |
| Segundo plano | `docker compose -p trendify-favoritos up --build -d` |
| Ver logs | `docker compose -p trendify-favoritos logs -f` |
| Parar | `docker compose -p trendify-favoritos down` |
| Reiniciar base local desde cero | `docker compose -p trendify-favoritos down -v` y luego `docker compose -p trendify-favoritos up --build` |

`docker compose down -v` borra el volumen de PostgreSQL local.

## Opcion B: Setup manual en Windows

Todos los comandos asumen que estas en la raiz del repo.

### Backend

```powershell
py -3 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

### Base de datos

Ejecutar el script principal desde `backend\db`:

```powershell
$env:PGPASSWORD = 'diego'
Set-Location backend\db
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h 127.0.0.1 -d postgres -f 00_run_all.psql
Set-Location ..\..
```

El flujo SQL incluye, entre otros:

- `09_migracion_pago_transacciones.sql`
- `10_migracion_backfill_clientes_usuario.sql`
- `11_migracion_favoritos.sql`

### Migraciones internas de Django

```powershell
backend\.venv\Scripts\python.exe backend\manage.py migrate contenttypes
backend\.venv\Scripts\python.exe backend\manage.py migrate auth
backend\.venv\Scripts\python.exe backend\manage.py migrate admin
backend\.venv\Scripts\python.exe backend\manage.py migrate sessions
backend\.venv\Scripts\python.exe backend\manage.py migrate catalogos --fake
```

### Passwords seed

```powershell
backend\.venv\Scripts\python.exe backend\scripts\reset_passwords_and_list_users.py
```

### Frontend

```powershell
Set-Location frontend
npm.cmd install
npm.cmd run dev
```

Backend manual:

```powershell
backend\.venv\Scripts\python.exe backend\manage.py runserver 127.0.0.1:8000
```

URLs manuales:

| Servicio | URL |
|----------|-----|
| Frontend | http://127.0.0.1:5173 |
| API | http://127.0.0.1:8000/api/ |

## Stripe en modo prueba

Variables backend requeridas:

```env
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_CURRENCY=bob
FRONTEND_PUBLIC_URL=http://127.0.0.1:5175
```

Endpoints relacionados:

- Checkout publico: `POST /api/public/checkout/` con `metodo_pago: "stripe_card"`
- Webhook Stripe: `POST /api/public/payments/webhook/stripe/`

Eventos recomendados del webhook:

- `checkout.session.completed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.failed`

Prueba local con Stripe CLI:

```powershell
stripe login
stripe listen --forward-to http://127.0.0.1:8000/api/public/payments/webhook/stripe/
```

El comando devuelve un `whsec_...`; ese valor se usa en `STRIPE_WEBHOOK_SECRET`.

## Produccion actual

Proyecto GCP:

```text
project-cd88757d-ed1e-4c87-a75
```

Servicios:

| Componente | Servicio |
|------------|----------|
| Frontend | Google Cloud Run |
| Backend | Google Cloud Run |
| Base de datos | Cloud SQL PostgreSQL |
| Secrets | Secret Manager |

URLs:

- Frontend: https://trendify-favoritos-frontend-498827330256.southamerica-east1.run.app/
- Backend: https://trendify-favoritos-backend-498827330256.southamerica-east1.run.app/api/

Para detalles de despliegue ver [DEPLOY.md](DEPLOY.md).

## Verificacion rapida

Backend:

```powershell
docker compose -p trendify-favoritos exec backend python manage.py check
```

Frontend:

```powershell
docker compose -p trendify-favoritos exec frontend npm run build
```

API publica:

```powershell
curl http://127.0.0.1:8001/api/public/productos/
curl http://127.0.0.1:8001/api/public/productos-populares/
```

## Archivos que no deben subirse

- `backup_trendify.dump`
- `tools/cloud-sql-proxy.exe`
- archivos `.env` con secretos reales
