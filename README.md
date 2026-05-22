# The Harbour — Restaurant Booking System 🐟

A full-stack web application for a mock restaurant in Thessaloniki,
featuring online table reservations and a password-protected admin
dashboard for managing bookings in real time.

## 🌐 Live Demo

https://restaurant-booking-system.pages.dev

## Features

### Public Site
- Hero section with background video
- Animated scrolling ticker
- Interactive menu grid
- Online reservation form with:
  - Real-time time slot availability
  - Offline fallback (localStorage) if backend is unavailable
  - Loading state & user feedback
- Fully responsive design (mobile + desktop)
- Installable as PWA (Progressive Web App)

### Admin Dashboard (`/sardeles-admin`)
- Password-protected session login
- Sidebar with live reservation stats
- View, create, update, and delete reservations
- Filter by status (pending / confirmed / cancelled)
- Search by name, phone, email, or date
- Sort by date or creation time
- Bulk select & delete reservations
- Manual reservation creation
- Block / unblock time slots per date
- Auto-refresh every 30 seconds with progress bar
- Email notifications via Brevo

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla HTML/CSS/JS (zero dependencies) |
| Backend | Node.js (ES Modules) |
| Database | Turso (LibSQL) |
| Email | Brevo API |
| Hosting — Frontend | Cloudflare Pages |
| Hosting — Backend | Render |
| Proxy | Cloudflare Worker |

## Architecture

Browser → Cloudflare Pages (static frontend)
↓  /api/* requests
Cloudflare Worker (_worker.js)
↓  proxies to
Render (Node.js backend)
↓
Turso (LibSQL cloud database)

## Local Development

### Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in your keys
npm start
```

### Environment Variables

TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
ADMIN_PASSWORD
BREVO_API_KEY
MAIL_FROM
ALLOWED_ORIGINS
PUBLIC_SITE_URL

### Frontend
Open `index.html` directly in a browser, or use any static file server.

## Context

Personal project — full-stack demo restaurant web app (2026)
