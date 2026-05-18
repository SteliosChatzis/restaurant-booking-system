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
  };
}

async function readBody(request) {
  let body = "";

  for await (const chunk of request) {
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

function confirmationEmailHtml(reservation) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#181b22">
      <h1 style="color:#c51f2f;margin-bottom:8px">Η κράτησή σας επιβεβαιώθηκε</h1>
      <p>Γεια σας ${escapeHtml(reservation.name)},</p>
      <p>Η κράτησή σας στις <strong>Χαρούμενες Σαρδέλες</strong> επιβεβαιώθηκε.</p>
      <table style="border-collapse:collapse;margin:20px 0">
        <tr>
          <td style="padding:6px 14px 6px 0;color:#71717a">Ημερομηνία</td>
          <td style="padding:6px 0"><strong>${escapeHtml(reservation.date)}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 14px 6px 0;color:#71717a">Ώρα</td>
          <td style="padding:6px 0"><strong>${escapeHtml(reservation.time)}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 14px 6px 0;color:#71717a">Άτομα</td>
          <td style="padding:6px 0"><strong>${escapeHtml(reservation.guests)}</strong></td>
        </tr>
      </table>
      <p>Διεύθυνση: Ολύμπου 15, Θεσσαλονίκη 546 30</p>
      <p>Τηλέφωνο: <a href="tel:2310553479" style="color:#c51f2f">2310 553 479</a></p>
      <p style="margin-top:24px">Σας περιμένουμε!</p>
    </div>
  `;
}

function confirmationEmailText(reservation) {
  return [
    `Γεια σας ${reservation.name},`,
    "",
    "Η κράτησή σας στις Χαρούμενες Σαρδέλες επιβεβαιώθηκε.",
    "",
    `Ημερομηνία: ${reservation.date}`,
    `Ώρα: ${reservation.time}`,
    `Άτομα: ${reservation.guests}`,
    "",
    "Διεύθυνση: Ολύμπου 15, Θεσσαλονίκη 546 30",
    "Τηλέφωνο: 2310 553 479",
    "",
    "Σας περιμένουμε!",
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
      subject: "Η κράτησή σας επιβεβαιώθηκε | Χαρούμενες Σαρδέλες",
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

    const reservationId = parseId(url.pathname);

    if (reservationId && request.method === "PATCH") {
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
    sendJson(response, 500, { error: "server error", details: error.message }, origin);
  }
}

createServer(handleRequest).listen(port, "0.0.0.0", () => {
  console.log(`Sardeles backend listening on ${port}`);
});