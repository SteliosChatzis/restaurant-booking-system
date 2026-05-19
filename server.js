import { createServer } from "node:http";
import crypto from "node:crypto";
import { createClient } from "@libsql/client";

const port = Number(process.env.PORT || 8787);
const database = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const adminPassword = process.env.ADMIN_PASSWORD || "";
const adminSessions = new Map();
const loginAttempts = new Map();
const sessionMaxAgeSeconds = 60 * 60 * 12;
const maxLoginAttempts = 8;
const loginWindowMs = 15 * 60 * 1000;

async function initDatabase() {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      guests INTEGER NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      occasion TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT,
      confirmation_email_sent_at TEXT
    )
  `);
}

const databaseReady = initDatabase();

function rowToReservation(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    guests: Number(row.guests),
    date: row.date,
    time: row.time,
    occasion: row.occasion || "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined,
    confirmationEmailSentAt: row.confirmation_email_sent_at || undefined,
  };
}

async function readReservations() {
  await databaseReady;
  const result = await database.execute(`
    SELECT *
    FROM reservations
    ORDER BY created_at DESC
  `);

  return result.rows.map(rowToReservation);
}

async function getReservation(id) {
  await databaseReady;
  const result = await database.execute({
    sql: "SELECT * FROM reservations WHERE id = ? LIMIT 1",
    args: [id],
  });

  return result.rows[0] ? rowToReservation(result.rows[0]) : null;
}

async function createReservationRecord(reservation) {
  await databaseReady;
  await database.execute({
    sql: `
      INSERT INTO reservations (
        id, name, phone, email, guests, date, time, occasion, status, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      reservation.id,
      reservation.name,
      reservation.phone,
      reservation.email,
      reservation.guests,
      reservation.date,
      reservation.time,
      reservation.occasion,
      reservation.status,
      reservation.createdAt,
    ],
  });
}

async function updateReservationRecord(reservation) {
  await databaseReady;
  await database.execute({
    sql: `
      UPDATE reservations
      SET status = ?,
          updated_at = ?,
          confirmation_email_sent_at = ?
      WHERE id = ?
    `,
    args: [
      reservation.status,
      reservation.updatedAt || null,
      reservation.confirmationEmailSentAt || null,
      reservation.id,
    ],
  });
}

async function deleteReservationRecord(id) {
  await databaseReady;
  const result = await database.execute({
    sql: "DELETE FROM reservations WHERE id = ?",
    args: [id],
  });

  return result.rowsAffected > 0;
}

async function readReservationStats() {
  await databaseReady;
  const result = await database.execute(`
    SELECT COUNT(*) AS total, COALESCE(SUM(guests), 0) AS totalGuests
    FROM reservations
  `);
  const row = result.rows[0] || { total: 0, totalGuests: 0 };

  return {
    total: Number(row.total),
    totalGuests: Number(row.totalGuests),
  };
}

function sendJson(response, status, body, origin) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(origin),
  });
  response.end(JSON.stringify(body));
}

function corsHeaders(origin) {
  const allowOrigin =
    allowedOrigins.includes("*") || !origin || allowedOrigins.includes(origin) ? origin || "*" : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
}

function getCookie(request, name) {
  const cookies = request.headers.cookie || "";
  const match = cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function isSecureRequest(request) {
  return request.headers["x-forwarded-proto"] === "https";
}

function sessionCookie(token, request) {
  const secure = isSecureRequest(request) || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `sardeles_admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${sessionMaxAgeSeconds}${secure}`;
}

function clearSessionCookie(request) {
  const secure = isSecureRequest(request) || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `sardeles_admin_session=; HttpOnly; SameSite=Lax; Path=/api; Max-Age=0${secure}`;
}

function sendJsonWithCookie(response, status, body, origin, cookie) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Set-Cookie": cookie,
    ...corsHeaders(origin),
  });
  response.end(JSON.stringify(body));
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getClientKey(request) {
  return String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function isLoginRateLimited(request) {
  const key = getClientKey(request);
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (!attempt || attempt.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + loginWindowMs });
    return false;
  }

  return attempt.count >= maxLoginAttempts;
}

function recordFailedLogin(request) {
  const key = getClientKey(request);
  const now = Date.now();
  const attempt = loginAttempts.get(key) || { count: 0, resetAt: now + loginWindowMs };
  attempt.count += 1;
  loginAttempts.set(key, attempt);
}

function clearFailedLogins(request) {
  loginAttempts.delete(getClientKey(request));
}

function passwordsMatch(inputPassword) {
  const provided = Buffer.from(String(inputPassword));
  const expected = Buffer.from(adminPassword);

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

function createAdminSession() {
  const token = crypto.randomBytes(32).toString("base64url");
  adminSessions.set(hashToken(token), Date.now() + sessionMaxAgeSeconds * 1000);
  return token;
}

function isAdminAuthenticated(request) {
  const token = getCookie(request, "sardeles_admin_session");
  if (!token) return false;

  const key = hashToken(token);
  const expiresAt = adminSessions.get(key);
  if (!expiresAt) return false;

  if (expiresAt <= Date.now()) {
    adminSessions.delete(key);
    return false;
  }

  adminSessions.set(key, Date.now() + sessionMaxAgeSeconds * 1000);
  return true;
}

function deleteAdminSession(request) {
  const token = getCookie(request, "sardeles_admin_session");
  if (token) {
    adminSessions.delete(hashToken(token));
  }
}

function requireAdmin(request, response, origin) {
  if (isAdminAuthenticated(request)) {
    return true;
  }

  sendJson(response, 401, { error: "admin authentication required" }, origin);
  return false;
}

async function readBody(request) {
  let body = "";
  let size = 0;
  const maxSize = 10 * 1024; // 10kb

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxSize) {
      throw new Error("request body too large");
    }
    body += chunk;
  }

  return body ? JSON.parse(body) : {};
}

function validateReservation(input) {
  const requiredFields = ["name", "phone", "email", "guests", "date", "time"];
  const missingField = requiredFields.find((field) => input[field] === undefined || input[field] === "");

  if (missingField) {
    return `${missingField} is required`;
  }

  if (!String(input.email).includes("@")) {
    return "email is invalid";
  }

  const guests = Number(input.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > 20) {
    return "guests must be between 1 and 20";
  }

  return null;
}

function normalizeReservation(input) {
  return {
    id: crypto.randomUUID(),
    name: String(input.name).trim(),
    phone: String(input.phone).trim(),
    email: String(input.email).trim(),
    guests: Number(input.guests),
    date: String(input.date),
    time: String(input.time),
    occasion: input.occasion ? String(input.occasion) : "",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPublicSiteUrl() {
  return (process.env.PUBLIC_SITE_URL || "https://xaroumenessardeles.pages.dev").replace(/\/+$/, "");
}

function confirmationEmailHtml(reservation) {
  const logoUrl = `${getPublicSiteUrl()}/assets/images/logo.png`;

  return `
    <div style="margin:0;padding:0;background:#f7f4ef;font-family:Arial,sans-serif;color:#181b22">
      <div style="max-width:620px;margin:0 auto;padding:28px 16px">
        <div style="background:#ffffff;border:1px solid #eadfd6;border-top:5px solid #c51f2f;padding:28px">
          <div style="text-align:center;margin-bottom:24px">
            <img src="${escapeHtml(logoUrl)}" alt="Χαρούμενες Σαρδέλες" style="width:190px;max-width:80%;height:auto" />
          </div>
          <p style="margin:0 0 8px;color:#c51f2f;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">
            Μην ψαρώνεις
          </p>
          <h1 style="margin:0 0 16px;color:#181b22;font-size:28px;line-height:1.15">
            Το τραπέζι σας είναι κρατημένο!
          </h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7">
            Γεια σας ${escapeHtml(reservation.name)}, η κράτησή σας στις <strong>Χαρούμενες Σαρδέλες</strong>
            επιβεβαιώθηκε. Σας περιμένουμε στην Ολύμπου για μεζέδες, καλή παρέα και χαλαρή διάθεση.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0;background:#fbfaf8">
            <tr>
              <td style="padding:12px 14px;border-bottom:1px solid #eadfd6;color:#71717a;font-size:13px">Ημερομηνία</td>
              <td style="padding:12px 14px;border-bottom:1px solid #eadfd6;text-align:right"><strong>${escapeHtml(reservation.date)}</strong></td>
            </tr>
            <tr>
              <td style="padding:12px 14px;border-bottom:1px solid #eadfd6;color:#71717a;font-size:13px">Ώρα</td>
              <td style="padding:12px 14px;border-bottom:1px solid #eadfd6;text-align:right"><strong>${escapeHtml(reservation.time)}</strong></td>
            </tr>
            <tr>
              <td style="padding:12px 14px;color:#71717a;font-size:13px">Άτομα</td>
              <td style="padding:12px 14px;text-align:right"><strong>${escapeHtml(reservation.guests)}</strong></td>
            </tr>
          </table>
          <div style="margin:22px 0;padding:16px;background:#fff3f4;border-left:4px solid #c51f2f">
            <p style="margin:0;font-size:15px;line-height:1.6">
              Αν θέλετε αλλαγή ή ακύρωση στην κράτηση, καλέστε μας στο
              <a href="tel:2310553479" style="color:#c51f2f;font-weight:700;text-decoration:none">2310 553 479</a>.
            </p>
          </div>
          <p style="margin:0 0 6px;line-height:1.6">
            <strong>Διεύθυνση:</strong> Ολύμπου 15, Θεσσαλονίκη 546 30
          </p>
          <p style="margin:0;line-height:1.6">
            <strong>Τηλέφωνο:</strong>
            <a href="tel:2310553479" style="color:#c51f2f;text-decoration:none">2310 553 479</a>
          </p>
          <p style="margin:26px 0 0;color:#71717a;font-size:14px;line-height:1.6">
            Σας περιμένουμε με χαρά.<br />
            Η ομάδα από τις Χαρούμενες Σαρδέλες
          </p>
        </div>
      </div>
    </div>
  `;
}

function confirmationEmailText(reservation) {
  return [
    `Γεια σας ${reservation.name},`,
    "",
    "Μην ψαρώνεις, το τραπέζι σας στις Χαρούμενες Σαρδέλες είναι κρατημένο!",
    "Η κράτησή σας επιβεβαιώθηκε και σας περιμένουμε στην Ολύμπου για μεζέδες, καλή παρέα και χαλαρή διάθεση.",
    "",
    `Ημερομηνία: ${reservation.date}`,
    `Ώρα: ${reservation.time}`,
    `Άτομα: ${reservation.guests}`,
    "",
    "Αν θέλετε αλλαγή ή ακύρωση στην κράτηση, καλέστε μας στο 2310 553 479.",
    "",
    "Διεύθυνση: Ολύμπου 15, Θεσσαλονίκη 546 30",
    "Τηλέφωνο: 2310 553 479",
    "",
    "Σας περιμένουμε με χαρά.",
    "Η ομάδα από τις Χαρούμενες Σαρδέλες",
  ].join("\n");
}

async function sendConfirmationEmail(reservation) {
  if (!process.env.BREVO_API_KEY || !process.env.MAIL_FROM) {
    return { configured: false, sent: false };
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM, name: "Χαρούμενες Σαρδέλες" },
      to: [{ email: reservation.email, name: reservation.name }],
      subject: "Μην ψαρώνεις, η κράτησή σας επιβεβαιώθηκε | Χαρούμενες Σαρδέλες",
      textContent: confirmationEmailText(reservation),
      htmlContent: confirmationEmailHtml(reservation),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error: ${response.status} ${errorText}`);
  }

  return { configured: true, sent: true };
}

function parseId(pathname) {
  const match = pathname.match(/^\/api\/reservations\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleRequest(request, response) {
  const origin = request.headers.origin;
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  try {
    if (url.pathname === "/health") {
      await databaseReady;
      sendJson(response, 200, { ok: true }, origin);
      return;
    }

    if (url.pathname === "/api/reservations" && request.method === "GET") {
      if (!requireAdmin(request, response, origin)) return;

      const reservations = await readReservations();
      sendJson(response, 200, reservations, origin);
      return;
    }

    if (url.pathname === "/api/reservations/stats" && request.method === "GET") {
      const stats = await readReservationStats();
      sendJson(response, 200, stats, origin);
      return;
    }

    if (url.pathname === "/api/reservations" && request.method === "POST") {
      const body = await readBody(request);
      const validationError = validateReservation(body);

      if (validationError) {
        sendJson(response, 400, { error: validationError }, origin);
        return;
      }

      const reservation = normalizeReservation(body);
      await createReservationRecord(reservation);
      sendJson(response, 201, reservation, origin);
      return;
    }

    if (url.pathname === "/api/admin/session" && request.method === "GET") {
      sendJson(response, 200, { authenticated: isAdminAuthenticated(request) }, origin);
      return;
    }

    if (url.pathname === "/api/admin/login" && request.method === "POST") {
      if (!adminPassword) {
        sendJson(response, 503, { error: "admin password is not configured" }, origin);
        return;
      }

      if (isLoginRateLimited(request)) {
        sendJson(response, 429, { error: "too many login attempts" }, origin);
        return;
      }

      const body = await readBody(request);

      if (!passwordsMatch(body.password || "")) {
        recordFailedLogin(request);
        sendJson(response, 401, { error: "password is invalid" }, origin);
        return;
      }

      clearFailedLogins(request);
      const token = createAdminSession();
      sendJsonWithCookie(response, 200, { authenticated: true }, origin, sessionCookie(token, request));
      return;
    }

    if (url.pathname === "/api/admin/logout" && request.method === "POST") {
      deleteAdminSession(request);
      sendJsonWithCookie(response, 200, { authenticated: false }, origin, clearSessionCookie(request));
      return;
    }

    const reservationId = parseId(url.pathname);

    if (reservationId && request.method === "PATCH") {
      if (!requireAdmin(request, response, origin)) return;

      const body = await readBody(request);
      const reservation = await getReservation(reservationId);

      if (!reservation) {
        sendJson(response, 404, { error: "reservation not found" }, origin);
        return;
      }

      if (!["pending", "confirmed", "cancelled"].includes(body.status)) {
        sendJson(response, 400, { error: "status is invalid" }, origin);
        return;
      }

      const previousStatus = reservation.status;
      reservation.status = body.status;
      reservation.updatedAt = new Date().toISOString();
      let confirmationEmail = { configured: false, sent: false };

      if (body.status === "confirmed" && previousStatus !== "confirmed") {
        try {
          confirmationEmail = await sendConfirmationEmail(reservation);
          if (confirmationEmail.sent) {
            reservation.confirmationEmailSentAt = new Date().toISOString();
          }
        } catch (error) {
          confirmationEmail = {
            configured: true,
            sent: false,
            error: error.message,
          };
          console.error("Confirmation email failed:", error);
        }
      }

      await updateReservationRecord(reservation);
      sendJson(response, 200, { ...reservation, confirmationEmail }, origin);
      return;
    }

    if (reservationId && request.method === "DELETE") {
      if (!requireAdmin(request, response, origin)) return;

      const deleted = await deleteReservationRecord(reservationId);

      if (!deleted) {
        sendJson(response, 404, { error: "reservation not found" }, origin);
        return;
      }

      sendJson(response, 200, { ok: true }, origin);
      return;
    }

    sendJson(response, 404, { error: "not found" }, origin);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "server error" }, origin);
  }
}

createServer(handleRequest).listen(port, "0.0.0.0", () => {
  console.log(`Sardeles backend listening on ${port}`);
});