# Sitio publico de rifas y retail

Primera version del sitio publico conectado al backend por slug.

## Como funciona

- Rifas: `/agropecuario`
- Retail: `/negocio/mi-tienda`
- El frontend consulta `GET /public-site/:slug` para rifas
- El frontend consulta `GET /public-retail/:slug` para retail
- El backend es la fuente de verdad del contenido
- El panel administrativo define los datos que se muestran

## Variables de entorno

- `PORT`: puerto del web service
- `API_BASE_URL`: URL publica del backend, por ejemplo `https://tu-backend.onrender.com`
- `NEXT_PUBLIC_API_URL`: alternativa soportada para Render, apuntando al backend

## Desarrollo local

```bash
npm start
```

Luego abre:

- `http://localhost:3000/agropecuario`
- o `http://localhost:3000/?slug=agropecuario`
- retail: `http://localhost:3000/negocio/mi-tienda`

## Produccion: Render Static Site

Este repositorio es un **Static Site**; el backend se publica por separado como Web Service.

En Render usa el archivo `render.yaml` o configura:

- Build command: `npm run build`
- Publish directory: `public`
- Regla SPA: `/*` → `/index.html` (rewrite)

Así funcionan rutas públicas sin barra final, por ejemplo
`https://hidrago.onrender.com/elagropecuario`.

## Estado actual

- Hero dinamico para rifas
- Sorteos visibles
- Metodos de pago
- Videos de ganadores
- FAQ
- Legal
- Vitrina retail separada para catalogo y ventas
