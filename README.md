# Agente WhatsApp Local

Bot de WhatsApp con IA que se conecta a un numero real via Baileys (sin Meta API, sin Twilio).
Incluye un dashboard web para ver conversaciones, responder manualmente y togglear entre modo IA y modo Humano.

## Requisitos

- Node.js 20.9+ (recomendado: 22)
- Un numero de WhatsApp personal para vincular

## Instalacion

```bash
cd agente-whatsapp
npm install
```

## Configuracion

Copia `.env.example` a `.env.local` y agrega tu API key de OpenRouter:

```bash
cp .env.example .env.local
```

Edita `.env.local`:

```
OPENROUTER_API_KEY=sk-or-TU-KEY-AQUI
OPENROUTER_MODEL=openai/gpt-4o-mini
```

### Sobre el modelo de IA

Se recomienda `openai/gpt-4o-mini` (~$0.15 por millon de tokens). Los modelos
`:free` de OpenRouter tienen un limite de 50 requests/dia sin creditos cargados
y van a fallar con error 429 en uso real.

## Uso en desarrollo

Levanta ambos procesos (bot + dashboard):

```bash
npm run start:all
```

O por separado en terminales distintas:

```bash
# Terminal 1: Bot de WhatsApp
npm run start:bot

# Terminal 2: Dashboard web
npm run dev
```

1. Abre http://localhost:3000
2. Escanea el QR con tu telefono (WhatsApp > Dispositivos vinculados > Vincular dispositivo)
3. Una vez conectado, el dashboard muestra las conversaciones entrantes

## Funcionamiento

### Modos por conversacion

- **IA**: El bot responde automaticamente usando el LLM configurado
- **HUMAN**: Solo guarda mensajes, no responde. El operador puede enviar mensajes desde el dashboard

El toggle esta en la cabecera del panel de conversacion.

### Personalizar el prompt del bot

Edita `src/lib/system-prompt.ts` con las instrucciones de tu negocio.

### Reglamentos del condominio (respuestas limitadas)

El bot responde **solo** con información extraída de los PDFs del reglamento y avisos en imágenes (`.jpeg`, `.jpg`, `.png`).
Coloca los archivos en la carpeta indicada por `REGLAMENTOS_DIR` (por defecto `../Reglamentos`).

Indexar o re-indexar después de cambiar PDFs o imágenes:

```bash
npm run index:reglamentos
```

Las imágenes se procesan con un modelo de visión (`OPENROUTER_VISION_MODEL`) para extraer texto con mayor precisión. Si falla, se usa OCR local como respaldo.

Al arrancar el bot (`npm run start:bot`), carga el índice desde `data/reglamentos-index.json`.
Si agregas archivos nuevos, detecta el cambio y re-indexa automáticamente.

Si el usuario pregunta algo que no está en los reglamentos, el bot responde que no encuentra
esa información y ofrece derivar con un asesor humano.

### Arquitectura de procesos

```
┌──────────────┐         ┌──────────────┐
│  start:bot   │◄───────►│   SQLite     │◄───────►│  Next.js     │
│  (Baileys)   │  r/w    │  messages.db │  r/w    │  (Dashboard) │
└──────────────┘         └──────────────┘         └──────────────┘
```

- El bot y Next.js son procesos independientes que comparten datos via SQLite (WAL mode)
- Los mensajes humanos del dashboard se encolan en la tabla `outbox` y el bot los envia cada 2s
- El estado de conexion se comparte via la tabla `wa_lines` (1 linea: `auth/line-1/`)
- Desconectar una linea escribe `data/.restart-{lineId}` para que el bot reinicie solo esa sesion

## Deploy en produccion (VPS / nginx)

Producción futura: `arc.axsolutions.tech` (nginx TLS → Next `127.0.0.1:3000` + WS `/ws` → `127.0.0.1:3001`). Aún no desplegado; se opera en local.

1. Volúmenes persistentes: `data/` y `auth/` (nunca en git)
2. Env: ver `.env.example` — en prod exige `NEXT_PUBLIC_APP_URL=https://…`, `WS_SECRET` (≥32), `WS_HOST=127.0.0.1`, `NEXT_PUBLIC_WS_SAME_ORIGIN=true`
3. Arranque: `npm run start:all:prod` (vía pm2 / `/opt/arc/deploy.sh`)
4. Auth: login + **TOTP 2FA obligatorio**; cookies HttpOnly/SameSite/Secure
5. Checklist: `npx tsx scripts/security-check.ts`

### Seguridad

- Dashboard con autenticación (roles admin/atención), rate-limit de login, 2FA TOTP
- WebSocket solo con ticket de corta vida; `/broadcast` exige `WS_SECRET`
- Next/WS escuchan en localhost detrás de nginx; UFW 22/80/443
- SSH: llave recomendada; password root la gestiona el operador (rotar si se expuso)

## Troubleshooting

### Code 440 en loop al conectar

- Verifica que no tengas dispositivos vinculados viejos (WhatsApp > Configuracion > Dispositivos vinculados)
- Desvincula sesiones anteriores de pruebas
- Si persiste, espera 15 minutos y reintenta

### Error 429 del LLM

El modelo gratuito agoto su cuota diaria. Cambia a `openai/gpt-4o-mini` en `.env.local`
y agrega creditos en OpenRouter.

### QR no aparece en el dashboard

Verifica que el proceso bot esta corriendo (`npm run start:bot`).
El QR tambien se imprime en la terminal del bot como fallback.

### El bot no responde pero si recibe mensajes

- Verifica que la conversacion este en modo "IA" (no "HUMANO")
- Verifica que `OPENROUTER_API_KEY` tenga creditos disponibles
- Revisa los logs del bot en la terminal

## Mejoras pendientes (v2)

- Soporte de imagenes salientes (enviar PNG de productos)
- Function calling con `tools` de OpenRouter
- Auto-toggle a HUMAN cuando el bot detecta frase de derivacion
- WebSocket en lugar de polling (eliminar delay de 2s)
- Soporte de mensajes de audio (transcripcion con Whisper)
- Backup offsite automatizado (además del cron local cifrado)
