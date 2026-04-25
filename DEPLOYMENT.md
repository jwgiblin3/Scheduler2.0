# ProSchedule IIS Deployment Guide

Deploys the Angular UI and the .NET 9 API as two separate IIS sites on a
single Windows machine.

| Component | Physical path                     | IIS site name | Hostname        | Port |
|-----------|-----------------------------------|---------------|-----------------|------|
| Angular UI | `C:\Apps\Scheduler\ScheduleUI`    | `ScheduleUI`  | `localhost`     | 80   |
| .NET API   | `C:\Apps\Scheduler\ScheduleAPI`   | `ScheduleAPI` | `api.localhost` | 80   |

Both sites share port 80 — IIS distinguishes them by the host header on the
incoming request. Modern browsers (Chrome / Edge / Firefox) treat anything
matching `*.localhost` as 127.0.0.1 per RFC 6761, so `http://api.localhost`
"just works" without any `hosts` file edit.

> **Heads up:** `setup-iis.ps1` will stop the IIS-default "Default Web Site"
> on first run because it ships pre-bound to `*:80` with no host header — a
> wildcard that would otherwise steal traffic for every hostname on 80.
> Pass `-DisableDefaultWebSite $false` to skip that.

For a fresh machine, run the two scripts in order from an **elevated**
PowerShell prompt:

```powershell
.\setup-iis.ps1     # one-time: creates folders, app pools, sites, auth
.\deploy.ps1        # builds API + UI and copies them into the folders
```

After that, every subsequent deploy is just `.\deploy.ps1`.

---

## 1. One-time prerequisites on the Windows host

Install these **once** per machine, in order:

1. **IIS + Web Server features.** Server Manager → Roles → Web Server (IIS).
   Minimum features: Default Document, Directory Browsing, HTTP Errors,
   Static Content, HTTP Logging, Request Filtering, Windows Authentication
   (optional — see §5), URL Authorization. Also enable .NET Extensibility 4.8.
2. **URL Rewrite Module 2.x** — https://www.iis.net/downloads/microsoft/url-rewrite.
   Required for the Angular SPA fallback and for the API's generated web.config.
3. **ASP.NET Core 9 Hosting Bundle** — https://dotnet.microsoft.com/en-us/download/dotnet/9.0.
   Scroll to "Hosting Bundle". Installs the ANCM (AspNetCoreModuleV2) native
   module IIS needs to host .NET apps. Restart IIS afterward: `iisreset`.
4. **Node.js LTS** (only on the build machine — not needed on the IIS host
   if you build elsewhere and copy artifacts).
5. **SQL Server** — LocalDB won't run under IIS as a system service; use
   SQL Express or full SQL Server. Create a database named `Scheduler`
   (or whatever you set in `DefaultConnection`) and give the IIS app pool
   identity a SQL login with db_owner on it.

Confirm the hosting bundle installed correctly:
```powershell
dir "C:\Program Files\IIS\Asp.Net Core Module\V2\aspnetcorev2.dll"
```

---

## 2. Build and deploy

From a developer machine with the repo checked out:

```powershell
# First time — run from an elevated PowerShell because it touches IIS
Set-ExecutionPolicy -Scope Process Bypass
.\deploy.ps1
```

Options:
```powershell
.\deploy.ps1 -Target api        # backend only
.\deploy.ps1 -Target ui         # frontend only
.\deploy.ps1 -NoBuild           # skip the build step, just redeploy the
                                # artifacts that are already in .\artifacts
```

What it does:
1. `dotnet publish -c Release` the API into `artifacts\api`.
2. `npm run build -- --configuration production` the UI into `pryschedule-ui\dist`.
3. Stops the matching IIS app pool (so the API EXE unlocks).
4. `robocopy /MIR` the output to `C:\Apps\Scheduler\ScheduleAPI` / `C:\Apps\Scheduler\ScheduleUI`.
5. Restarts the pool.

---

## 3. Create the two IIS sites

Open **IIS Manager**. You only need to do this once; subsequent deploys just
overwrite files.

### 3a. API site (`ScheduleAPI`)

1. Right-click **Application Pools** → Add Application Pool.
   - Name: `ScheduleAPI`
   - .NET CLR version: **No Managed Code** (important — AspNetCoreModule
     takes over hosting, IIS must not try to load .NET Framework.)
   - Managed pipeline mode: Integrated
2. Advanced Settings on the new pool:
   - **Identity**: `ApplicationPoolIdentity` is fine for local-only deployments.
     If the API needs Windows Authentication to SQL Server, switch to a
     domain service account and grant it SQL access.
   - **Load User Profile**: True (required for DataProtection keys and
     user secrets to resolve under IIS).
3. Right-click **Sites** → Add Website.
   - Site name: `ScheduleAPI`
   - Physical path: `C:\Apps\Scheduler\ScheduleAPI`
   - Application pool: `ScheduleAPI`
   - Binding: choose one:
     - Local only → HTTP, port `5000`.
     - External → HTTPS, port `443`, host name `api.yourdomain.com`, bind
       a cert (self-signed for dev, Let's Encrypt for prod).
4. **Grant IIS the ability to read files**: give `IIS AppPool\ScheduleAPI`
   read access on `C:\Apps\Scheduler\ScheduleAPI`.
   ```powershell
   icacls "C:\Apps\Scheduler\ScheduleAPI" /grant "IIS AppPool\ScheduleAPI:(OI)(CI)RX"
   ```

### 3b. UI site (`ScheduleUI`)

1. New App Pool: `ScheduleUI`, **No Managed Code** (it's pure static files;
   no .NET runtime needed).
2. New Website: `ScheduleUI`, path `C:\Apps\Scheduler\ScheduleUI`, pool `ScheduleUI`,
   binding on a separate hostname / port from the API (e.g. `scheduler.yourdomain.com`
   on 443, or `localhost:8080` for local).
3. Grant read access:
   ```powershell
   icacls "C:\Apps\Scheduler\ScheduleUI" /grant "IIS AppPool\ScheduleUI:(OI)(CI)RX"
   ```

---

## 4. Config — put secrets on the server, not in git

The API pulls config from (in order of precedence): command-line → environment
variables → `appsettings.{Environment}.json` → `appsettings.json`.

On the IIS host, create `C:\Apps\Scheduler\ScheduleAPI\appsettings.Production.json`
with your real secrets. This file is **not** in git, and the deploy
script's `robocopy /MIR` will delete anything in the destination that's
not in the source — so also either:

- Put it inside the repo's `publish-overrides\` folder and have the deploy
  script copy it after the main sync, **or**
- Stash it somewhere else (e.g. `C:\AppConfig\ScheduleAPI\`) and reference
  it via `ASPNETCORE_ENVIRONMENT=Production` + a post-publish copy step.

Minimum production overrides:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=.;Database=Scheduler;Trusted_Connection=True;TrustServerCertificate=True;"
  },
  "Jwt": {
    "Key":      "REPLACE-WITH-A-64+-CHAR-RANDOM-SECRET",
    "Issuer":   "ProScheduleAPI",
    "Audience": "ProScheduleApp"
  },
  "Cors": {
    "AllowedOrigins": [ "https://scheduler.yourdomain.com" ]
  },
  "Email": {
    "Provider": "SendGrid",
    "FromEmail": "noreply@yourdomain.com",
    "FromName":  "Your Practice",
    "SendGrid": { "ApiKey": "SG.xxxxxxxxxxxxxxxxxxxx" }
  },
  "Twilio": {
    "AccountSid": "ACxxxxxxxxxxxxxxxx",
    "AuthToken":  "xxxxxxxxxxxxxxxx",
    "FromPhone":  "+15551234567"
  }
}
```

Tell IIS to run as Production — in IIS Manager, select the API site →
Configuration Editor → `system.webServer/aspNetCore` → environmentVariables,
add `ASPNETCORE_ENVIRONMENT=Production`. Recycle the pool.

### Frontend environment

The UI's API base URL is baked into the bundle at build time from
`src/environments/environment.ts`. Before running `deploy.ps1`, edit that
file so `apiUrl` points at the deployed API:

```ts
export const environment = {
  production: true,
  apiUrl: 'https://api.yourdomain.com/api'
};
```

If UI and API live on the same hostname, use a relative path: `apiUrl: '/api'`.

---

## 5. Authentication — **the short answer: Anonymous only**

ProSchedule authenticates at the application layer using **JWT bearer
tokens**, not at the IIS layer. Both sites should have **Anonymous
Authentication enabled and all other IIS auth modes disabled**.

Why:

- The UI has public pages (`/login`, `/register`, `/book/:slug`, the embed
  widget at `/widget/*`) that external visitors must reach without any
  prompt.
- The API validates JWTs in `Program.cs` via `AddJwtBearer(...)` — IIS
  doesn't need to know about users at all.
- Anonymous *does not* mean insecure. It means "IIS doesn't challenge the
  request; it lets the app decide." The app rejects anything without a valid
  JWT on `[Authorize]` routes.

**How to set it (per site):**

IIS Manager → site → **Authentication**:
- Anonymous Authentication → **Enabled**
- Basic, Digest, Forms, Windows, ASP.NET Impersonation → **Disabled**

Command-line alternative:
```powershell
Import-Module WebAdministration
# API site
Set-WebConfigurationProperty `
  -PSPath 'MACHINE/WEBROOT/APPHOST' -Location 'ScheduleAPI' `
  -Filter 'system.webServer/security/authentication/anonymousAuthentication' -Name enabled -Value True
Set-WebConfigurationProperty `
  -PSPath 'MACHINE/WEBROOT/APPHOST' -Location 'ScheduleAPI' `
  -Filter 'system.webServer/security/authentication/windowsAuthentication' -Name enabled -Value False

# UI site — same idea
Set-WebConfigurationProperty `
  -PSPath 'MACHINE/WEBROOT/APPHOST' -Location 'ScheduleUI' `
  -Filter 'system.webServer/security/authentication/anonymousAuthentication' -Name enabled -Value True
```

### When **would** you want Windows Authentication?

Only if the app were an internal-only intranet tool where every user has a
domain account, and you wanted single-sign-on without passwords. That isn't
ProSchedule — public clients book through the site — so don't enable it.
Mixing Windows auth with JWT tends to produce confusing double-challenges.

### When to use **Basic** auth?

Never, for a public-facing site. It sends credentials in plaintext on every
request and provides a worse user experience than the JWT login page you
already have.

---

## 6. CORS and HTTPS

If the UI and API live on different hostnames (recommended — `scheduler.yourdomain.com`
vs `api.yourdomain.com`):

- Make sure the UI's hostname is in the API's `Cors:AllowedOrigins` list.
- Both sites must use **HTTPS** in production. `Secure`-flagged cookies and
  modern browser policies will otherwise block the JWT exchange.
- Redirect HTTP → HTTPS via a URL Rewrite rule at the site level, or a
  machine-wide "Require SSL" setting.

If UI and API live under the **same** hostname, split them by path:
- `/api/*` → ScheduleAPI (use IIS as a reverse proxy with Application
  Request Routing, or mount ScheduleAPI as a sub-application under
  `/api/`). Set `environment.apiUrl = '/api'` in that case.

---

## 7. First-run checklist

After deploying:

1. **Apply EF migrations** against the production DB. From the host:
   ```powershell
   cd C:\Apps\Scheduler\ScheduleAPI
   # The API auto-applies at startup only if you've enabled that; otherwise:
   dotnet ef database update --connection "Server=.;Database=Scheduler;..." --project ... --startup-project ...
   ```
   Or use the `dotnet ef bundle` tool to ship a self-contained migrator.
2. **Hit the health check**: `https://api.yourdomain.com/swagger` (Swagger
   is auto-registered) → you should see the API docs. A 500 here means
   check `C:\Apps\Scheduler\ScheduleAPI\logs\*.log` (ANCM stdout logs) and the
   Windows Event Viewer → Application.
3. **Load the UI**: `https://scheduler.yourdomain.com/home` → should hit
   login or land on the admin shell.
4. **Log in with an existing account** → confirm the JWT flow works through
   IIS. Open DevTools → Network → should see `Authorization: Bearer …`
   on `/api/*` requests.

---

## 8. Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| **HTTP 500.19** on API start | ANCM not installed | Install the .NET 9 Hosting Bundle, `iisreset`. |
| **HTTP 502.5** on API | App pool is set to v4.0 managed code instead of "No Managed Code" | Change pool → No Managed Code. |
| **Angular deep link 404s** | URL Rewrite module missing or `web.config` not deployed | Install URL Rewrite 2.x; verify `C:\Apps\Scheduler\ScheduleUI\web.config` exists. |
| **CORS errors from UI** | API's `Cors:AllowedOrigins` doesn't list the UI origin | Update `appsettings.Production.json`, recycle pool. |
| **SPA loads but "Unauthorized" on every call** | JWT validation failing; check `Jwt:Key` is ≥ 32 chars and matches the key tokens were issued with | If you rotated the key, every user must re-login. |
| **SQL connect error under IIS** | App pool identity has no DB access | Grant `IIS AppPool\ScheduleAPI` a SQL login with db_owner on `Scheduler`. |
| **Emails / SMS silent** | `Email:Provider` or Twilio creds missing | See `EmailService` notes; unconfigured senders log warnings instead of throwing. |

---

## 9. File structure after deploy

```
C:\Apps\Scheduler\ScheduleAPI\
├── ProScheduleAPI.dll
├── ProScheduleAPI.exe
├── appsettings.json
├── appsettings.Production.json      ← your secrets (not from git)
├── web.config                       ← auto-generated by `dotnet publish`
├── wwwroot\                         ← any static API assets
└── logs\                            ← stdout if you enabled it in web.config

C:\Apps\Scheduler\ScheduleUI\
├── index.html
├── main-<hash>.js
├── styles-<hash>.css
├── assets\
└── web.config                       ← SPA fallback rules
```
