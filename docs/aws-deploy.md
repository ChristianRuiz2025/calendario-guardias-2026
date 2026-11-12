# Despliegue en AWS (stage)

La app corre en la cuenta **976610556545** (us-east-1) en un solo stack de SAM, `calendario-guardias-stage`.

**URL:** https://d2eo019m8n7r8o.cloudfront.net

## Arquitectura

```
Usuario ─► CloudFront (d2eo019m8n7r8o.cloudfront.net)
             ├─ default  ─► S3 privado (OAC)              index.html + /assets
             └─ /api/*   ─► API Gateway HTTP API ─► Lambda Node 22 (VPC privada, SG compartido)
                                                     ├─► RDS db-sicliksuscribe-staging (BD guardias, TLS)
                                                     ├─► Secrets Manager (vía NAT)
                                                     └─► SMTP office365 / MS Graph (vía NAT)
```

| Recurso | Nombre | Notas |
|---|---|---|
| Lambda | `calendario-guardias-api-stage` | Node 22, 512 MB, 20 s. Un solo handler (`api/lambda.js`) enruta a los 4 de `api/`. Corre en las subredes `Lambdas-Private-Stage1/2` con el SG `sg-08c7bbe741366e52d` (ya tiene acceso al 3306 de la RDS). |
| Rol de la Lambda | generado por SAM | `AWSLambdaVPCAccessExecutionRole` + `secretsmanager:GetSecretValue` solo sobre el secreto de la app. |
| Logs | `/aws/lambda/calendario-guardias-api-stage` | Retención de 30 días. |
| HTTP API | `calendario-guardias-stage` | Ruta `ANY /api/{proxy+}`, throttling de 10 req/s (ráfagas de 20). Solo acepta peticiones que traen el header `x-origin-verify` de CloudFront; las demás reciben 403. |
| Bucket | `calendario-guardias-front-stage-976610556545` | Privado, SSE-S3, solo HTTPS, solo lo lee CloudFront. `DeletionPolicy: Retain`. |
| CloudFront | `E4BSN27UE585I` | `/api/*` sin caché; el resto con `CachingOptimized`. Headers de seguridad propios (`SecurityHeadersPolicy`, ver abajo). |
| Secreto | `calendario-guardias/stage/app` | JSON con las variables de `.env.example` más `ORIGIN_VERIFY`. |
| Usuario de BD | `guardias_app` | `SELECT, INSERT, UPDATE, DELETE` sobre `guardias.*`, `REQUIRE SSL`. Script: `mysql/05_usuario_app.sql`. |

Fuera del stack, y sin tocarse: la RDS, la VPC, las subredes, los grupos de seguridad y Route 53.

## Requisitos

- Node 22 y `npm install` en la raíz (instala `esbuild`, que usa `sam build`).
- AWS CLI v2 y SAM CLI.
- Perfil `mfa-suscribe-stage` con sesión MFA activa. Además de los permisos de grupo (CloudFormation, Lambda, API Gateway, CloudFront, S3, IAM), el usuario necesita la política `CalendarioGuardiasDeployStage` (`infra/iam/deploy-policy.json`), que da escritura en el secreto y en el log group, y nada más.

Los artefactos de SAM se suben al bucket existente `cf-templates-1ox3hx3s0hofb-us-east-1`, prefijo `calendario-guardias/`. Toda la configuración está en `infra/samconfig.toml`.

## Primera vez (ya hecho en stage)

1. Crear el usuario de BD con `mysql/05_usuario_app.sql`. Lo corre un admin de la RDS; la contraseña es la de `MYSQL_PASSWORD` del secreto. **Nunca** se guarda el archivo con la contraseña en el repo.
2. Crear el secreto `calendario-guardias/stage/app` con las llaves de `.env.example`, más `MYSQL_SSL=rds` y `ORIGIN_VERIFY` (texto aleatorio, por ejemplo `openssl rand -hex 32`).
3. Desplegar la API y luego el front (ver abajo).

## Desplegar

**API e infraestructura** (cambios en `api/`, en `src/` que importa `enviar-mes`, o en `infra/`):

```bash
npm run deploy:api
```

Construye con esbuild, crea el change set y **pide confirmación** antes de aplicarlo. Para solo revisar el change set sin aplicarlo:

```bash
cd infra && sam build && sam deploy --no-execute-changeset
```

**Front** (cambios en `src/`):

```bash
npm run deploy:front
```

Hace `vite build`, sube `dist/` al bucket (`assets/` con caché de 1 año e `index.html` sin caché) e invalida `index.html` en CloudFront. Lee el bucket y la distribución de los outputs del stack.

## Despliegue automático (GitHub Actions)

`.github/workflows/deploy-stage.yml` redespliega en cada push (merge) a `master` según los archivos que cambiaron:

| Job | Se ejecuta si cambia | Qué hace |
|---|---|---|
| `api` | `api/**`, `src/**/*.js` (la API importa módulos de `src/`), `infra/template.yaml`, `infra/samconfig.toml`, `package*.json` | `sam build` + `sam deploy --config-env ci` (sin confirmación) y verifica que `/api/auth` responda 401. |
| `front` | `src/**`, `index.html`, `public/**`, `vite.config.js`, `package*.json`, `scripts/deploy-front.mjs` | `vite build` + `scripts/deploy-front.mjs`. Si también cambió la API, corre después y solo si la API se desplegó bien. |

También se puede lanzar a mano desde *Actions → Deploy stage → Run workflow* eligiendo `ambos`, `api` o `front`. Los despliegues no se empalman (`concurrency`): si llegan dos merges seguidos, el segundo espera.

Las credenciales se obtienen por OIDC; no hay llaves de AWS guardadas en GitHub. Configuración (una sola vez):

1. **Rol en AWS** `calendario-guardias-github-deploy-stage`, que confía en el proveedor OIDC `token.actions.githubusercontent.com` (ya existe en la cuenta) y solo para la rama `master` de este repo (`repo:ChristianRuiz2025@234678067/calendario-guardias-2026@1331263033:ref:refs/heads/master`):

   ```bash
   aws iam create-role --role-name calendario-guardias-github-deploy-stage --assume-role-policy-document file://infra/iam/github-actions-trust-policy.json --max-session-duration 3600 --profile mfa-suscribe-stage
   # Si el rol ya existe, para actualizar solo la confianza:
   aws iam update-assume-role-policy --role-name calendario-guardias-github-deploy-stage --policy-document file://infra/iam/github-actions-trust-policy.json --profile mfa-suscribe-stage
   aws iam put-role-policy --role-name calendario-guardias-github-deploy-stage --policy-name deploy-stage --policy-document file://infra/iam/github-actions-deploy-policy.json --profile mfa-suscribe-stage
   ```

   El repo usa *subject* inmutable en los tokens OIDC: el `sub` lleva los IDs numéricos del dueño (`@234678067`) y del repo (`@1331263033`), no solo los nombres. Si la trust policy no coincide, el workflow falla con `Not authorized to perform sts:AssumeRoleWithWebIdentity`; el `sub` que llegó se ve en CloudTrail (evento `AssumeRoleWithWebIdentity`, campo `userIdentity.principalId`).

   La política (`infra/iam/github-actions-deploy-policy.json`) está acotada a los recursos del stack (Lambda, HTTP API `g1khie5r4g`, distribución `E4BSN27UE585I`, bucket del front, log group, rol de la Lambda y el secreto para `ORIGIN_VERIFY`). Si se recrea alguno de esos recursos con otro ID, hay que actualizarla.

2. **Variables en GitHub** (*Settings → Secrets and variables → Actions → Variables → New repository variable*; son variables, no *Secrets*). Basta con permiso de push en el repo:

   | Variable | Valor |
   |---|---|
   | `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::976610556545:role/calendario-guardias-github-deploy-stage` |
   | `AWS_REGION` | `us-east-1` (opcional; es el valor por defecto) |

3. **Sin environment**: los jobs no declaran `environment`, así que no hay aprobación manual; cada merge a `master` se despliega solo. La protección está en la trust policy del rol, que solo acepta tokens de la rama `master` (también los de *Run workflow* lanzado sobre `master`). Un workflow corrido desde otra rama no puede asumir el rol.

No se necesitan secretos en GitHub: los de la app viven en Secrets Manager y el front no usa variables `VITE_`.

Si un despliegue falla con `AccessDenied`, el mensaje del paso (o los eventos del stack en CloudFormation) dice qué acción falta; se agrega a la política y se vuelve a lanzar el workflow.

## Headers de seguridad

CloudFront agrega a todas las respuestas (página y `/api/*`) los headers de `SecurityHeadersPolicy` en `infra/template.yaml`: los de la política administrada de AWS (HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `X-XSS-Protection`) más:

- **`Content-Security-Policy`**: solo permite recursos del mismo dominio. Excepciones: `style-src 'unsafe-inline'` (estilos en línea de React y de la foto del calendario) e `img-src data: blob:` (la foto del calendario del correo y las descargas ICS).
- **`Permissions-Policy`**: apaga cámara, micrófono, ubicación, pagos, USB y sensores, que la app no usa.

Si se agrega algo que cargue recursos de otro dominio (fuentes, scripts, analítica, imágenes externas), hay que agregar ese dominio a la directiva correspondiente del `Content-Security-Policy`, o el navegador lo bloqueará. Los bloqueos se ven en la consola del navegador como `Refused to load ...`.

Para revisar la calificación: https://securityheaders.com/?q=https://d2eo019m8n7r8o.cloudfront.net&followRedirects=on

## Firewall (AWS WAF)

La distribución de CloudFront tiene un web ACL de AWS WAF (`calendario-guardias-stage-waf`, recurso `WebAcl` en `infra/template.yaml`) con tres reglas:

| Prioridad | Regla | Qué hace |
|---|---|---|
| 0 | `BloquearTransferEncoding` | Bloquea las peticiones que traen el header `Transfer-Encoding`. La app nunca lo manda (todas sus peticiones llevan `Content-Length`); cerrarlo evita *HTTP request smuggling* entre CloudFront y API Gateway (hallazgo CWE-444 del escaneo de seguridad de TI). |
| 1 | `AWSManagedRulesCommonRuleSet` | Reglas administradas de AWS contra ataques comunes (XSS, LFI, etc.). `SizeRestrictions_BODY` está en modo *Count*: bloquearía cuerpos de más de 8 KB y `/api/enviar-mes` manda la foto del calendario (~250 KB). |
| 2 | `AWSManagedRulesKnownBadInputsRuleSet` | Entradas maliciosas conocidas (Log4j, etc.). |

- Las peticiones bloqueadas reciben **403** de CloudFront. Las métricas y muestras de peticiones se ven en la consola de WAF (región *Global (CloudFront)*).
- Si una regla administrada bloquea algo legítimo de la app, se pasa a *Count* con `RuleActionOverrides` (como `SizeRestrictions_BODY`), en lugar de quitar el grupo completo.
- Costo aproximado: 5 USD/mes por el web ACL, 1 USD/mes por regla y 0.60 USD por millón de peticiones.
- El rol de GitHub Actions necesita los permisos `wafv2` de `infra/iam/github-actions-deploy-policy.json`. Al cambiar esa política hay que aplicarla al rol:

  ```bash
  aws iam put-role-policy --role-name calendario-guardias-github-deploy-stage --policy-name deploy-stage --policy-document file://infra/iam/github-actions-deploy-policy.json --profile mfa-suscribe-stage
  ```

## Cambiar valores del secreto

```bash
aws secretsmanager put-secret-value --secret-id calendario-guardias/stage/app --secret-string file://secreto.json --profile mfa-suscribe-stage
```

- La Lambda lee el secreto una vez por contenedor, así que los contenedores que ya están corriendo siguen con el valor viejo hasta que AWS los recicla. Para aplicarlo de inmediato, fuerza contenedores nuevos (el próximo `deploy:api` restablece la descripción):

  ```bash
  aws lambda update-function-configuration --function-name calendario-guardias-api-stage --description "recarga de secreto" --profile mfa-suscribe-stage
  ```

- **`ORIGIN_VERIFY`** también lo usa CloudFront, que lo resuelve solo cuando se actualiza el stack. Si se cambia, hay que cambiar algo en la distribución del template y desplegar, o la API responderá 403 a todo. Lo más sencillo es no rotarlo salvo que se haya filtrado.
- **`SESSION_SECRET`**: al cambiarlo se cierran todas las sesiones.

## Verificar

```bash
curl -i https://d2eo019m8n7r8o.cloudfront.net/api/auth                        # 401 {"error":"Sin sesion"}
curl -i -H "Authorization: Bearer <KEY>" "https://d2eo019m8n7r8o.cloudfront.net/api/auditorias?semanas=2"   # 200
curl -i https://<api-id>.execute-api.us-east-1.amazonaws.com/api/auth         # 403 (solo por CloudFront)
```

Logs: CloudWatch, log group `/aws/lambda/calendario-guardias-api-stage`. Los errores de BD aparecen como `ER_ACCESS_DENIED_ERROR` (usuario o contraseña) o `ETIMEDOUT` (red o SG).

## Rollback

- **Despliegue fallido:** CloudFormation revierte el stack solo.
- **Código con errores:** regresa al commit anterior y vuelve a desplegar.

  ```bash
  git checkout <commit-anterior> -- api src
  npm run deploy:api && npm run deploy:front
  ```

- **Quitar todo:**

  ```bash
  cd infra && sam delete --stack-name calendario-guardias-stage --profile mfa-suscribe-stage
  ```

  El bucket se conserva (`Retain`): vacíalo y bórralo a mano si ya no se necesita. El secreto y el usuario de BD tampoco son parte del stack.

## Corte desde Vercel

- Quienes consumen `/api/auditorias` deben cambiar a `https://d2eo019m8n7r8o.cloudfront.net/api/auditorias`, con la misma API key.
- Las sesiones de Vercel no sirven en AWS (otro dominio y otro `SESSION_SECRET`): cada usuario inicia sesión una vez.
- Dar de baja el proyecto de Vercel después de validar la app en AWS.

## Pendientes conocidos

- La API HTTP no tiene access logs: requieren permisos `logs:*LogDelivery` sobre `*`, que rompen el mínimo privilegio. Los logs de la Lambda sí registran cada error.
- Los datos de Supabase no se migraron a la RDS. Si se necesitan, están los scripts `mysql/02_*` y `04_*`.
- `YEAR = 2026` está fijo en `api/enviar-mes.js`.
- Costo: Lambda, API Gateway y CloudFront quedan prácticamente en la capa gratuita con este uso; el NAT y la RDS ya existían.
