# Security

## Architecture

SPERT Scheduler is a **client-side only** application. All computation runs in the browser.

- **No backend server** — no API calls, no network requests
- **No analytics or telemetry** — your data stays in your browser
- **localStorage persistence** — all project data is stored locally in the browser

## Data Storage

All data is stored in browser `localStorage`:

- `spert:project:{id}` — Individual project data
- `spert:project-index` — List of project IDs
- `spert:user-preferences` — User settings

**Note:** localStorage is accessible to any JavaScript running on the same origin. This application does not execute untrusted scripts.

## Recommended Deployment Headers

When deploying SPERT Scheduler, configure your web server with these security headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

### Header Explanations

- **Content-Security-Policy**: Restricts script sources to same-origin only. `'unsafe-inline'` for styles is required by Tailwind CSS. `worker-src` allows Web Workers.
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
- Dates: validated against ISO 8601 format

## Defensive Measures

- **No `eval()` or `Function()`** — no dynamic code execution
- **No `dangerouslySetInnerHTML`** — all content rendered as text
- **No inline scripts** — all JavaScript loaded via ES modules
- **Error boundaries** — graceful recovery from unexpected errors
- **Iteration guards** — calendar calculations have iteration limits
- **Worker validation** — simulation inputs validated before processing

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it by opening an issue at:
https://github.com/famousdavis/spert-scheduler/issues

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
