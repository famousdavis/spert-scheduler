# Security

## Architecture

SPERT Scheduler is a **client-side** application. All computation runs in the browser.

- **No backend server** — scheduling math runs entirely in-browser
- **No analytics or telemetry** — your data stays in your browser
- **Local-first persistence** — all project data is stored in browser localStorage by default
- **Optional cloud sync** — opt-in Firebase/Firestore persistence on the shared `spert-suite` Firebase project

## Data Storage

### Local Mode (default)

All data is stored in browser `localStorage`:

- `spert:project:{id}` — Individual project data
- `spert:project-index` — List of project IDs
- `spert:user-preferences` — User settings
- `spert:storage-mode` — Current storage mode (local/cloud)
- `spert_firstRun_seen` — First-run banner dismissal
- `spert_tos_accepted_version` — Cached ToS acceptance version
- `spert_tos_write_pending` — Pending Firestore acceptance write flag

**Note:** localStorage is accessible to any JavaScript running on the same origin. This application does not execute untrusted scripts.

### Cloud Mode (opt-in)

Before signing in, users must accept the Statistical PERT® Terms of Service and Privacy Policy via a clickwrap consent modal. Acceptance is recorded in Firestore at `users/{uid}` and cached locally. Returning users are verified against the current ToS version on app load.

When the user signs in and switches to cloud mode, data is stored in Firestore:

- `spertscheduler_projects/{projectId}` — Project data with `owner` and `members` fields
- `spertscheduler_profiles/{uid}` — User display name and email (for sharing lookup)
- `spertscheduler_settings/{uid}` — User preferences

**Security rules** (`firestore.rules`) enforce role-based access:
- Only project members can read projects
- Only owners and editors can write
- Editors cannot modify `owner` or `members` fields (privilege escalation prevention)
- Profiles are readable by all authenticated users (for email-based member lookup)
- Settings are private (owner-only read/write)

**Simulation results are stripped** before cloud saves to stay within the Firestore 1 MB document limit and reduce data exposure.

## Recommended Deployment Headers

When deploying SPERT Scheduler, configure your web server with these security headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://apis.google.com https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.googleusercontent.com; font-src 'self'; worker-src 'self' blob:; frame-src https://*.firebaseapp.com https://accounts.google.com https://login.microsoftonline.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://login.microsoftonline.com; object-src 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

### Header Explanations

- **Content-Security-Policy**: Restricts script sources to same-origin plus Google APIs (for Firebase Auth). `'unsafe-inline'` for styles is required by Tailwind CSS. `img-src blob: data:` allows chart copy-to-clipboard and inline images. `font-src 'self'` restricts fonts to same-origin. `worker-src` allows Web Workers. `frame-src` allows Firebase Auth popups. `connect-src` allows Firestore and auth API calls. `object-src 'none'` blocks plugins. `base-uri 'self'` prevents base tag hijacking. `form-action 'self'` restricts form submissions to same-origin.
- **X-Content-Type-Options**: Prevents MIME-type sniffing attacks.
- **X-Frame-Options**: Prevents clickjacking by disallowing iframe embedding.
- **Referrer-Policy**: Limits referrer information sent to external sites.

## Import/Export Security

When importing project data:

- Only import `.json` files from **trusted sources**
- All imported data is validated against the schema before use
- Invalid or malformed data is rejected with an error message

The application never executes code from imported files.

## Input Validation

All user inputs are validated using [Zod](https://zod.dev/) schemas:

- Activity estimates: `min ≤ mostLikely ≤ max`
- Trial count: bounded to 1,000 – 500,000
- Probability targets: bounded to 0.01 – 0.99
- Dates: validated against ISO 8601 format with calendar date verification (rejects invalid dates like Feb 30)

## Defensive Measures

- **No `eval()` or `Function()`** — no dynamic code execution
- **No `dangerouslySetInnerHTML`** — all content rendered as text
- **No inline scripts** — all JavaScript loaded via ES modules
- **Error boundaries** — graceful recovery from unexpected errors
- **Iteration guards** — calendar calculations have iteration limits
- **Worker validation** — simulation inputs validated before processing

## Known Limitations

- **Firestore field validation:** Firestore security rules validate document-level access control (ownership, membership, roles) but do not replicate the full Zod schema validation performed client-side. Field-level validation (e.g., string length limits, numeric ranges) is enforced only by the client. This is a pragmatic tradeoff — duplicating the complete Zod schema in Firestore rules is impractical for marginal security gain, since a malicious client could only corrupt their own project data.
- **Email enumeration:** The sharing UI reveals whether an email is registered when attempting to share a project. This is mitigated by requiring authentication and using a uniform error message that does not distinguish between "user not found" and other failure modes.

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it by opening an issue at:
https://github.com/famousdavis/spert-scheduler/issues

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
