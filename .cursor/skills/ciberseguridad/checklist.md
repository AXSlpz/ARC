# Checklist — ciberseguridad

Criterios de evidencia. Estado: **OK** / **PARCIAL** / **RIESGO** / **N/A**.

## 1–20 (títulos fijos)

### 1. Ocultar API Key
- Cliente: solo keys publicables (`NEXT_PUBLIC_*` anon, Stripe pk_, Firebase apiKey).
- Service / secret / webhook signing keys: solo servidor, nunca `NEXT_PUBLIC_` ni repo.
- DevTools no debe mostrar `service_role`, `SECRET`, SMTP pass.

### 2. Purgar secrets de GIT
- `.gitignore` cubre `.env`, `auth/`, `*.pem`, credenciales.
- `git ls-files` sin `.env` reales. Historial: `git log --all -- '*.env'`.
- Ejemplos solo con placeholders. Si el origin es un fork ajeno: no pushear.

### 3. Usar key publica de BD
- Lecturas de usuario con anon / authenticated + políticas.
- `service_role` / connection string de admin solo en workers, webhooks, cron.
- PostgREST / Prisma / ORM no usa superuser desde el browser.

### 4. RLS
- Tablas de dominio: `ENABLE ROW LEVEL SECURITY` + policies por tenant/`auth.uid()`.
- Storage: path acotado (`account-<id>`, `user/<uid>`).
- Anotar si service_role bypasea RLS (esperado en engines; documentar).

### 5. Encriptación
- TLS en el borde (443). Secretos at-rest: AES-GCM o vault, no plaintext de tokens de terceros.
- `ENCRYPTION_KEY` / KMS en env, no en código. Contraseñas: punto 10, no “encriptar” con reversible.

### 6. Forzar autenticación
- Middleware o guard global en páginas y APIs sensibles.
- Excepciones explícitas: webhook, health, peek de invite, assets.
- Cada excepción debe tener **otro** control (firma, secreto, token).

### 7. Restringir acceso a registros
- `account_id` / `user_id` sale de la sesión, no del body.
- Queries filtran por tenant. IDOR: objeto de otro tenant → 404/403.

### 8. Manipulacion de campos
- Rol, `account_id`, `is_admin`, precios: no mass-assignment desde el cliente.
- Enums de rol validados; `owner` no se autoasigna.
- PATCH con allowlist de campos.

### 9. Cookies de sesion
- `HttpOnly` + `Secure` (HTTPS) + `SameSite=Lax` o `Strict`.
- No JWT de sesión en `localStorage` si se puede evitar.
- Refresh no se pierde en redirects (Set-Cookie copiado).

### 10. Hasheo contraseñas
- Delegar a IdP (GoTrue, Auth.js, Django, Laravel). Nada de MD5/SHA1 propio.
- Mínimo de longitud configurado en el IdP.

### 11. Limitar acceso login
- Rate limit en `/login`, `/signup`, `/recover`, `/token` (borde y/o IdP).
- Preferible lockout o backoff por cuenta, no solo por IP.
- In-memory por proceso = PARCIAL.

### 12. AntiBot
- Captcha (hCaptcha/Turnstile) o equivalente en signup/login públicos.
- Sin nada + rate limit solo = RIESGO si el alta es público.

### 13. Parametrización
- ORM / queries parametrizadas. Cero SQL concatenado con input.
- RPCs con `$1…$n`. Shell/OS commands: no interpolar input.

### 14. Validar Inputs
- Schema (Zod, Pydantic, FormRequest) en POST/PATCH.
- Validación ad-hoc suelta = PARCIAL. Sin bounds (size, enum, tipo) = RIESGO.

### 15. Escapar contenido us
- Templates escapan por defecto (React/Vue/Django).
- `dangerouslySetInnerHTML` / `|safe` / `v-html` solo con dato controlado o sanitizer.
- Markdown de usuario: sanitizar.

### 16. Restringir subida
- Tope de tamaño (app + nginx/proxy). Allow-list MIME real (no solo `file.type` del browser).
- Path impredecible / por tenant. Ejecutables y SVG peligrosos: bloquear o sanitizar.

### 17. Recortar resp api
- Nada de `select('*')` hacia el cliente si hay tokens, hashes, secretos.
- Allowlist de columnas. Errores 500 sin stack al cliente.

### 18. Headers de seguridad
Una vez cada uno (duplicados = PARCIAL):
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (o CSP `frame-ancestors`)
- `Referrer-Policy`
- `Permissions-Policy`
- `Content-Security-Policy` **enforced** (no Report-Only)
- Sin `X-Powered-By` / `Server` verboso

### 19. HTTPS
- HTTP→HTTPS 301. Cert válido / renovación. App interna solo en loopback.
- HSTS coherente con 18.

### 20. Escaneo dependencias
- `npm audit` / `pip-audit` / `cargo audit` / `govulncheck` en el lockfile.
- HIGH/CRITICAL de **runtime** = RIESGO. Solo build-time = PARCIAL.
- Lockfile commiteado.

## 21–26 (extras)

### 21. Webhooks y cron
- Firma HMAC o secreto con comparación constante (`timingSafeEqual`).
- Sin secreto / secreto vacío = rechazo, no “open”.
- Idempotencia ante redelivery.

### 22. CORS y orígenes
- Allow-origin explícito. No `*` con credenciales.
- `ALLOWED_INVITE_HOSTS` / `SITE_URL` fijos si se generan links.

### 23. Logs sin secretos
- No loguear Authorization, cookies, SMTP, tokens, cuerpos de login.
- Mensajes de error al cliente genéricos.

### 24. Backup y rotación
- Backup de BD con acceso restringido. Procedimiento para rotar SMTP/JWT/`ENCRYPTION_KEY` (rotar key huérfana tokens).
- Secretos pegados en chat = pedir rotación.

### 25. Superficie debug
- Sin source maps públicos en prod si exponen secretos/lógica.
- Sin `/debug`, `/phpinfo`, Django `DEBUG=True`, stack traces.
- Healthcheck sin filtrar versiones internas de más.

### 26. Calidad CSP
- Presencia = punto 18. Aquí: `'unsafe-inline'` / `'unsafe-eval'` en `script-src`.
- Con ambos: PARCIAL (mejor que nada; Next suele exigir inline o nonces).
- Meta: nonces por request. No bajar a Report-Only para “subir nota”.
