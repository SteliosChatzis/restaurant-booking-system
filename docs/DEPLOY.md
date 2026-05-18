# Deploy Notes

## Backend on Render

Use the repository root as a Node web service.

Recommended Render settings:

- Runtime: `Node`
- Root directory: leave empty / repository root
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- Environment variable: `ALLOWED_ORIGINS=*`
- Environment variable: `ADMIN_PASSWORD=<a long private password>`

Turso database environment variables:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

The backend creates the `reservations` table automatically on startup.

Admin security:

- Set `ADMIN_PASSWORD` in Render before using `/admin`.
- Use a long password, ideally 20+ characters with mixed words, numbers, and symbols.
- Admin reservation list, status changes, and deletes require a backend session cookie after login.
- If `ADMIN_PASSWORD` is missing, admin login returns an error and the reservation management API stays locked.

Email confirmation environment variables for Resend:

- `RESEND_API_KEY`
- `MAIL_FROM`

Example:

```txt
RESEND_API_KEY=re_xxxxxxxxx
MAIL_FROM="Χαρούμενες Σαρδέλες <noreply@xaroumenessardeles.com>"
```

The backend sends a confirmation email through Resend when an admin changes a reservation status to `confirmed`.

The repository also includes `render.yaml`, so you can deploy it as a Render Blueprint from the repo root.

Current Render backend URL:

```txt
https://sardeles-backend.onrender.com
```

This URL is already wired in `wrangler.toml`, `frontend/_redirects`, and `frontend/app.js`.

## Frontend on Cloudflare Pages

The frontend publish directory is:

```txt
frontend
```

Recommended Cloudflare Pages settings:

- Framework preset: `None`
- Build command: leave empty
- Build output directory: `frontend`
- Root directory: repository root

If deploying with Wrangler CLI:

```sh
npx wrangler pages deploy frontend
```

If deploying through the Cloudflare dashboard, connect the GitHub repository to Cloudflare Pages and use `frontend` as the output directory.

## Local Development

Frontend:

```sh
cd frontend
python3 -m http.server 4173 --bind 127.0.0.1
```

Public site:

```txt
http://127.0.0.1:4173
```

Admin panel:

```txt
http://127.0.0.1:4173/index.html?admin
```

On Cloudflare Pages, the admin panel is available at `/admin`.

Backend:

```sh
npm start
```

The frontend automatically uses `http://127.0.0.1:8787` for API calls when running locally.
