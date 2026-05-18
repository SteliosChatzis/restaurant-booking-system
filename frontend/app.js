const menuItems = [
  {
    name: "Σαρδέλα Παντρεμένη",
    description: "Λεμόνι, μαϊντανός, σπιτικό ψωμί",
    price: "9€",
  },
  {
    name: "Ταραμοσαλάτα της ώρας",
    description: "Φρέσκο αυγοτάραχο, ελαιόλαδο",
    price: "7€",
  },
  {
    name: "Τηγανητό Καλαμάρι",
    description: "Τριμμένη φρυγανιά, σκόρδο, λεμόνι",
    price: "12€",
  },
  {
    name: "Μελιτζανοσαλάτα",
    description: "Καπνιστή, χειροποίητη, με σκόρδο",
    price: "6€",
  },
  {
    name: "Μπαρμπούνι Τηγανητό",
    description: "Αλεύρωτο, με φρέσκο λεμόνι",
    price: "14€",
  },
  {
    name: "Ανάμεικτοι Μεζέδες",
    description: "Επιλογή της ημέρας, για 2-3 άτομα",
    price: "18€",
  },
];

const tickerItems = [
  "ΜΗΝ ΨΑΡΩΝΕΙΣ",
  "ΧΑΡΟΥΜΕΝΕΣ ΣΑΡΔΕΛΕΣ",
  "NEW AGE ΜΕΖΕΔΟΠΩΛΕΙΟ",
  "ΘΕΣΣΑΛΟΝΙΚΗ",
  "ΟΛΥΜΠΟΥ 15",
  "ΑΠΟ 2026",
];

const timeSlots = [
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
  "20:30",
  "21:00",
  "21:30",
  "22:00",
  "22:30",
  "23:00",
];

const occasionLabels = {
  birthday: "Γενέθλια",
  anniversary: "Επέτειος",
  romantic: "Ρομαντικό δείπνο",
  business: "Επιχειρηματικό γεύμα",
};

const statusLabels = {
  pending: "Εκκρεμεί",
  confirmed: "Επιβεβαιωμένη",
  cancelled: "Ακυρωμένη",
};

const filterLabels = {
  all: "ΟΛΕΣ",
  pending: "ΕΚΚΡΕΜΕΙΣ",
  confirmed: "ΕΠΙΒΕΒΑΙΩΜΕΝΕΣ",
  cancelled: "ΑΚΥΡΩΜΕΝΕΣ",
};

const apiBase =
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:8787"
    : "";
let currentFilter = "all";
let currentDateScope = "active";
let currentSort = "date-asc";
let isAdminRendering = false;
let lastAdminRefreshAt = null;
let nextAdminRefreshAt = null;
let adminRefreshInterval = null;
let adminRefreshStatusInterval = null;

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "request failed" }));
    throw new Error(error.error || "request failed");
  }

  return response.json();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getLocalReservations() {
  return JSON.parse(localStorage.getItem("sardeles-reservations-fallback") || "[]");
}

function saveLocalReservations(reservations) {
  localStorage.setItem("sardeles-reservations-fallback", JSON.stringify(reservations));
}

async function getReservations() {
  try {
    return await apiRequest("/api/reservations");
  } catch {
    return getLocalReservations();
  }
}

async function getReservationStats() {
  return apiRequest("/api/reservations/stats");
}

async function getAdminSession() {
  return apiRequest("/api/admin/session");
}

async function loginAdmin(password) {
  return apiRequest("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

async function logoutAdmin() {
  return apiRequest("/api/admin/logout", {
    method: "POST",
  });
}

async function getAdminReservations() {
  return apiRequest("/api/reservations");
}

async function createReservation(reservation) {
  try {
    return await apiRequest("/api/reservations", {
      method: "POST",
      body: JSON.stringify(reservation),
    });
  } catch {
    const reservations = getLocalReservations();
    const localReservation = {
      ...reservation,
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    reservations.unshift(localReservation);
    saveLocalReservations(reservations);
    return localReservation;
  }
}

async function updateReservationStatus(id, status) {
  return apiRequest(`/api/reservations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

async function removeReservation(id) {
  return apiRequest(`/api/reservations/${id}`, {
    method: "DELETE",
  });
}

function formatDateForInput(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function initRevealAnimations() {
  const elements = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  elements.forEach((element) => observer.observe(element));
}

function initTicker() {
  const tickerTrack = document.querySelector("#ticker-track");
  if (!tickerTrack) return;

  const repeatedItems = Array(4).fill(tickerItems).flat();
  tickerTrack.innerHTML = repeatedItems.map((item) => `<span>${item}</span>`).join("");
}

function initMenu() {
  const menuGrid = document.querySelector("#menu-grid");
  if (!menuGrid) return;

  menuGrid.innerHTML = menuItems
    .map(
      (item) => `
        <article class="menu-item reveal">
          <div>
            <h3>${item.name}</h3>
            <p>${item.description}</p>
          </div>
          <strong>${item.price}</strong>
        </article>
      `
    )
    .join("");
}

async function updateStats() {
  const reservationsElement = document.querySelector("#stats-reservations");
  const guestsElement = document.querySelector("#stats-guests");
  let stats = { total: 0, totalGuests: 0 };

  try {
    stats = await getReservationStats();
  } catch {
    const reservations = getLocalReservations();
    stats = {
      total: reservations.length,
      totalGuests: reservations.reduce((total, reservation) => total + Number(reservation.guests || 0), 0),
    };
  }

  if (reservationsElement) {
    reservationsElement.textContent = stats.total;
  }

  if (guestsElement) {
    guestsElement.textContent = stats.totalGuests;
  }
}

function initBookingForm() {
  const form = document.querySelector("#booking-form");
  if (!form) return;

  const dateInput = form.elements.date;
  const timeSelect = form.elements.time;
  const message = document.querySelector("#form-message");

  dateInput.value = formatDateForInput(new Date());
  timeSelect.innerHTML = timeSlots
    .map((time) => `<option value="${time}" ${time === "20:00" ? "selected" : ""}>${time}</option>`)
    .join("");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const reservation = {
      name: formData.get("name").trim(),
      phone: formData.get("phone").trim(),
      email: formData.get("email").trim(),
      guests: Number(formData.get("guests")),
      date: formData.get("date"),
      time: formData.get("time"),
      occasion: formData.get("occasion"),
    };

    try {
      await createReservation(reservation);
      form.reset();
      dateInput.value = formatDateForInput(new Date());
      timeSelect.value = "20:00";
      await updateStats();
      message.textContent = "Η κράτηση στάλθηκε! Θα επικοινωνήσουμε μαζί σας σύντομα.";
    } catch {
      message.textContent = "Κάτι πήγε στραβά. Παρακαλώ δοκιμάστε ξανά ή καλέστε μας.";
    }
  });
}

function getCounts(reservations) {
  const today = formatDateForInput(new Date());

  return {
    all: reservations.length,
    pending: reservations.filter((reservation) => reservation.status === "pending").length,
    confirmed: reservations.filter((reservation) => reservation.status === "confirmed").length,
    cancelled: reservations.filter((reservation) => reservation.status === "cancelled").length,
    today: reservations.filter((reservation) => reservation.date === today).length,
    active: reservations.filter((reservation) => reservation.status !== "cancelled" && reservation.date >= today).length,
  };
}

async function setReservationStatus(id, status) {
  const button = document.querySelector(`[data-id="${CSS.escape(id)}"][data-action="${CSS.escape(status)}"]`);
  if (button) button.disabled = true;

  try {
    await updateReservationStatus(id, status);
    await renderAdmin();
  } catch (error) {
    showAdminNotice(error.message || "Η αλλαγή δεν ολοκληρώθηκε.", "error");
    if (error.message.includes("authentication")) {
      showAdminLogin();
    }
  }
}

async function deleteReservation(id) {
  const confirmed = confirm("Σίγουρα θέλεις να διαγράψεις αυτή την κράτηση;");
  if (!confirmed) return;

  try {
    await removeReservation(id);
    await renderAdmin();
  } catch (error) {
    showAdminNotice(error.message || "Η διαγραφή δεν ολοκληρώθηκε.", "error");
    if (error.message.includes("authentication")) {
      showAdminLogin();
    }
  }
}

function renderAdminFilters(reservations) {
  const filters = document.querySelector("#admin-filters");
  if (!filters) return;

  const counts = getCounts(reservations);
  filters.innerHTML = Object.entries(filterLabels)
    .map(
      ([filter, label]) => `
        <button class="filter-card ${currentFilter === filter ? "is-active" : ""}" data-filter="${filter}" data-testid="filter-${filter}">
          <strong>${counts[filter]}</strong>
          <span>${label}</span>
        </button>
      `
    )
    .join("");

  filters.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      renderAdmin();
    });
  });
}

function getReservationDateTime(reservation) {
  return new Date(`${reservation.date}T${reservation.time || "00:00"}`);
}

function getDateScope(reservation) {
  const today = formatDateForInput(new Date());
  if (reservation.date === today) return "today";
  if (reservation.date > today) return "upcoming";
  return "past";
}

function matchesDateScope(reservation) {
  const scope = getDateScope(reservation);

  if (currentDateScope === "all") return true;
  if (currentDateScope === "active") return reservation.status !== "cancelled" && scope !== "past";
  return scope === currentDateScope;
}

function sortReservations(reservations) {
  return [...reservations].sort((first, second) => {
    const firstTime = getReservationDateTime(first).getTime();
    const secondTime = getReservationDateTime(second).getTime();

    if (currentSort === "date-desc") return secondTime - firstTime;
    if (currentSort === "created-desc") {
      return new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime();
    }

    return firstTime - secondTime;
  });
}

function groupReservations(reservations) {
  const groups = [
    { key: "today", title: "Σήμερα", items: [] },
    { key: "upcoming", title: "Επόμενες κρατήσεις", items: [] },
    { key: "past", title: "Παλαιότερες", items: [] },
  ];

  reservations.forEach((reservation) => {
    groups.find((group) => group.key === getDateScope(reservation)).items.push(reservation);
  });

  return groups.filter((group) => group.items.length > 0);
}

function formatReservationDate(reservation) {
  const date = getReservationDateTime(reservation);
  return date.toLocaleDateString("el-GR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function renderAdminSummary(reservations) {
  const summary = document.querySelector("#admin-summary");
  if (!summary) return;

  const counts = getCounts(reservations);
  const pendingGuests = reservations
    .filter((reservation) => reservation.status === "pending")
    .reduce((total, reservation) => total + Number(reservation.guests || 0), 0);

  summary.innerHTML = `
    <div>
      <span>Ενεργές επόμενες</span>
      <strong>${counts.active}</strong>
    </div>
    <div>
      <span>Σήμερα</span>
      <strong>${counts.today}</strong>
    </div>
    <div>
      <span>Άτομα σε εκκρεμότητα</span>
      <strong>${pendingGuests}</strong>
    </div>
  `;
}

function showAdminNotice(message, tone = "default") {
  const notice = document.querySelector("#admin-notice");
  if (!notice) return;

  notice.textContent = message;
  notice.dataset.tone = tone;
}

function renderReservations(reservations) {
  const list = document.querySelector("#reservations-list");
  const searchInput = document.querySelector("#admin-search");
  if (!list || !searchInput) return;

  const searchTerm = searchInput.value.trim().toLowerCase();
  const filteredReservations = sortReservations(
    reservations.filter((reservation) => {
      const matchesFilter = currentFilter === "all" || reservation.status === currentFilter;
      const searchableText = `${reservation.name} ${reservation.phone} ${reservation.email} ${reservation.date} ${
        reservation.time
      } ${occasionLabels[reservation.occasion] || ""}`.toLowerCase();
      return matchesFilter && matchesDateScope(reservation) && searchableText.includes(searchTerm);
    })
  );

  if (filteredReservations.length === 0) {
    list.innerHTML = '<div class="empty-state">Δεν βρέθηκαν κρατήσεις με αυτά τα φίλτρα</div>';
    return;
  }

  list.innerHTML = groupReservations(filteredReservations)
    .map(
      (group) => `
        <section class="reservation-group">
          <div class="reservation-group__header">
            <h2>${group.title}</h2>
            <span>${group.items.length} ${group.items.length === 1 ? "κράτηση" : "κρατήσεις"}</span>
          </div>
          ${group.items
            .map(
              (reservation) => `
        <article class="reservation-card" data-testid="reservation-${reservation.id}">
          <div class="reservation-card__date">
            <strong>${escapeHtml(formatReservationDate(reservation))}</strong>
            <span>${escapeHtml(reservation.time)} · ${escapeHtml(reservation.guests)} άτομα</span>
          </div>
          <div class="reservation-card__info">
            <div>
              <small>ΟΝΟΜΑ</small>
              <p><strong>${escapeHtml(reservation.name)}</strong></p>
              <p>${escapeHtml(occasionLabels[reservation.occasion] || "Χωρίς περίσταση")}</p>
            </div>
            <div>
              <small>ΕΠΙΚΟΙΝΩΝΙΑ</small>
              <p><a href="tel:${escapeHtml(reservation.phone)}">${escapeHtml(reservation.phone)}</a></p>
              <p><a href="mailto:${escapeHtml(reservation.email)}">${escapeHtml(reservation.email)}</a></p>
            </div>
            <div>
              <small>ΚΑΤΑΣΤΑΣΗ</small>
              <span class="status status--${escapeHtml(reservation.status)}">${escapeHtml(
                statusLabels[reservation.status] || reservation.status
              )}</span>
              <p>#${escapeHtml(reservation.id.slice(0, 8))}</p>
            </div>
          </div>
          <div class="reservation-card__actions">
            ${
              reservation.status !== "confirmed"
                ? `<button class="action-button action-button--confirm" data-action="confirmed" data-id="${reservation.id}" data-testid="confirm-${reservation.id}">ΕΠΙΒΕΒΑΙΩΣΗ</button>`
                : ""
            }
            ${
              reservation.status !== "cancelled"
                ? `<button class="action-button action-button--cancel" data-action="cancelled" data-id="${reservation.id}" data-testid="cancel-${reservation.id}">ΑΚΥΡΩΣΗ</button>`
                : ""
            }
            <button class="action-button action-button--delete" data-action="delete" data-id="${reservation.id}" data-testid="delete-${reservation.id}">ΔΙΑΓΡΑΦΗ</button>
          </div>
        </article>`
            )
            .join("")}
        </section>
      `
    )
    .join("");

  list.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "delete") {
        deleteReservation(button.dataset.id);
        return;
      }

      setReservationStatus(button.dataset.id, button.dataset.action);
    });
  });
}

async function renderAdmin() {
  if (isAdminRendering) return;

  isAdminRendering = true;

  try {
    const reservations = await getAdminReservations();
    renderAdminSummary(reservations);
    renderAdminFilters(reservations);
    renderReservations(reservations);
    showAdminNotice("");
    lastAdminRefreshAt = new Date();
    nextAdminRefreshAt = new Date(Date.now() + 30000);
    updateRefreshStatus();
  } catch (error) {
    if (error.message.includes("authentication")) {
      showAdminLogin();
      return;
    }

    showAdminNotice(error.message || "Δεν μπορέσαμε να φορτώσουμε τις κρατήσεις.", "error");
  } finally {
    isAdminRendering = false;
  }
}

function updateRefreshStatus() {
  const refreshLabel = document.querySelector("#refresh-label");
  const refreshBar = document.querySelector("#refresh-bar");

  if (!refreshLabel || !refreshBar || !lastAdminRefreshAt || !nextAdminRefreshAt) return;

  const now = Date.now();
  const totalDuration = nextAdminRefreshAt.getTime() - lastAdminRefreshAt.getTime();
  const elapsed = now - lastAdminRefreshAt.getTime();
  const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
  const secondsLeft = Math.max(0, Math.ceil((nextAdminRefreshAt.getTime() - now) / 1000));

  refreshBar.style.width = `${progress}%`;
  refreshLabel.textContent = `Τελευταία ενημέρωση ${lastAdminRefreshAt.toLocaleTimeString("el-GR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })} · επόμενο σε ${secondsLeft}s`;
}

function initAdmin() {
  const searchInput = document.querySelector("#admin-search");
  if (!searchInput) return;

  document.querySelector("#admin-login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    const message = document.querySelector("#admin-login-message");
    const password = form.elements.password.value;

    button.disabled = true;
    message.textContent = "";

    try {
      await loginAdmin(password);
      form.reset();
      showAdminPanel();
      renderAdmin();
    } catch (error) {
      message.textContent =
        error.message === "too many login attempts"
          ? "Πολλές προσπάθειες. Δοκίμασε ξανά σε λίγο."
          : "Λάθος password ή μη ρυθμισμένο password στο Render.";
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#admin-logout")?.addEventListener("click", async () => {
    await logoutAdmin().catch(() => null);
    stopAdminRefresh();
    showAdminLogin();
  });

  searchInput.addEventListener("input", renderAdmin);
  document.querySelector("#admin-date-scope")?.addEventListener("change", (event) => {
    currentDateScope = event.target.value;
    renderAdmin();
  });
  document.querySelector("#admin-sort")?.addEventListener("change", (event) => {
    currentSort = event.target.value;
    renderAdmin();
  });

  getAdminSession()
    .then((session) => {
      if (session.authenticated) {
        showAdminPanel();
        renderAdmin();
        startAdminRefresh();
      } else {
        showAdminLogin();
      }
    })
    .catch(() => showAdminLogin());

  window.addEventListener("beforeunload", stopAdminRefresh);
}

function showAdminLogin() {
  document.querySelector("#admin-login")?.classList.add("is-active");
  document.querySelector("#admin-shell")?.classList.remove("is-active");
  document.querySelector("#admin-login-password")?.focus();
}

function showAdminPanel() {
  document.querySelector("#admin-login")?.classList.remove("is-active");
  document.querySelector("#admin-shell")?.classList.add("is-active");
  startAdminRefresh();
}

function startAdminRefresh() {
  if (!adminRefreshInterval) {
    adminRefreshInterval = setInterval(renderAdmin, 30000);
  }

  if (!adminRefreshStatusInterval) {
    adminRefreshStatusInterval = setInterval(updateRefreshStatus, 1000);
  }
}

function stopAdminRefresh() {
  clearInterval(adminRefreshInterval);
  clearInterval(adminRefreshStatusInterval);
  adminRefreshInterval = null;
  adminRefreshStatusInterval = null;
}

function getCurrentView() {
  const path = window.location.pathname.replace(/\/$/, "");
  const query = window.location.search.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  return path === "/admin" || query.includes("admin") || hash === "#admin" ? "admin" : "site";
}

function showCurrentView() {
  const currentView = getCurrentView();

  document.querySelectorAll("[data-view]").forEach((view) => {
    view.classList.toggle("is-active", view.dataset.view === currentView);
  });

  return currentView;
}

document.addEventListener("DOMContentLoaded", () => {
  const currentView = showCurrentView();

  if (currentView === "admin") {
    initAdmin();
    return;
  }

  initTicker();
  initMenu();
  initBookingForm();
  updateStats();
  initRevealAnimations();
});
