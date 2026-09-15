---
name: ciberseguridad
description: >-
  Audita una app web contra la plantilla ciberseguridad (20 puntos + extras):
  API keys, git secrets, RLS, auth, cookies, rate limit, antibot, XSS,
  uploads, headers, HTTPS, dependencias, webhooks, CORS, logs, CSP.
  Usar cuando el usuario diga "ciberseguridad", "auditoría de seguridad",
  "checklist de ciber", "20 puntos de seguridad", o pida endurecer un VPS/app.
---

# Ciberseguridad

Auditoría **con evidencia**. No inventar. No pegar secretos en el informe, el chat ni el handoff.

## Cuándo activar

El usuario nombra `ciberseguridad`, pide auditar seguridad, o pega la lista de 20 puntos.

**Modo delta (proyectos con regla `ciberseguridad.mdc`):** al terminar un pedido que cambió código, auditar solo lo tocado. Informe corto (3–8 líneas). Audit completo de 26 puntos solo si lo piden o el cambio es auth/secrets/headers/uploads.

## Cómo auditar

1. Detectar stack (Next, Django, Laravel, Go, nginx, Docker, Supabase/GoTrue, etc.).
2. Recoger evidencia local: código, `.env.example`, nginx, compose, migraciones, `git ls-files`, `npm audit` / equivalente.
3. Si hay URL/VPS en alcance: `curl -sI` de headers; **no** hacer fuerza bruta ni exploits.
4. Puntuar **cada** ítem de [checklist.md](checklist.md): `OK` | `PARCIAL` | `RIESGO` | `N/A`.
5. Citar ruta + hallazgo en una línea. Distinguir “público a propósito” (anon key) de filtración real (`service_role`, SMTP, JWT).
6. Entregar el informe en el formato de abajo + top 5 acciones.
7. Actualizar `.cursor/session-handoff.md` si existe (sin secretos).

## Lista canónica (no reordenar)

Los 20 títulos son fijos. Los extras (21–26) van siempre al final.

1. Ocultar API Key
2. Purgar secrets de GIT
3. Usar key publica de BD
4. RLS
5. Encriptación
6. Forzar autenticación
7. Restringir acceso a registros
8. Manipulacion de campos
9. Cookies de sesion
10. Hasheo contraseñas
11. Limitar acceso login
12. AntiBot
13. Parametrización
14. Validar Inputs
15. Escapar contenido us
16. Restringir subida
17. Recortar resp api
18. Headers de seguridad
19. HTTPS
20. Escaneo dependencias
21. Webhooks y cron
22. CORS y orígenes
23. Logs sin secretos
24. Backup y rotación
25. Superficie debug
26. Calidad CSP

Qué buscar en cada punto: [checklist.md](checklist.md).

## Informe (obligatorio)

Responder en el idioma del usuario. Tabla + top 5. Sin dumps de `.env`.

```markdown
# Ciberseguridad — <proyecto> — <fecha ISO>

Alcance: <repo / URL / VPS>
Stack: <...>

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| 1 | Ocultar API Key | OK/PARCIAL/RIESGO/N/A | `ruta`: hallazgo |

## Top 5
1. ...
```

## Reglas

- Anon / publishable key en el cliente = OK si RLS (o equivalente) aguanta. Service role / master key en bundle = RIESGO.
- Headers: una sola capa (nginx **o** app). CSP Report-Only ≠ CSP enforced. `'unsafe-inline'` / `'unsafe-eval'` en `script-src` se anotan en el punto 26, no como “falta CSP”.
- Rate limit in-memory no cuenta como OK en multi-instancia (PARCIAL).
- No reescribir historial git ni rotar secretos sin pedirlo. Sí **avisar** si un secreto está en chat, repo o logs.
- No escribir exploits ni PoCs ofensivos. Solo diagnóstico y endurecimiento (headers, env, policies, validación).

## Copias de esta plantilla

- Local (cualquier proyecto Cursor): `~/.cursor/skills/ciberseguridad/`
- VPS canónico: `/opt/shared/ciberseguridad/`
