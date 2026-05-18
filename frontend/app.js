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
let adminReservationsCache = [];
let hasAdminReservationsCache = false;
let selectedReservationIds = new Set();
let visibleReservationIds = [];

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

async function createAdminReservation(reservation) {
  return apiRequest("/api/reservations", {
    method: "POST",
    body: JSON.stringify(reservation),
  });
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
    const updatedReservation = await updateReservationStatus(id, status);
    await renderAdmin();

    if (status === "confirmed") {
      if (updatedReservation.confirmationEmail?.sent) {
        showAdminNotice("Η κράτηση επιβεβαιώθηκε και στάλθηκε email στον πελάτη.", "success");
      } else if (updatedReservation.confirmationEmail?.configured === false) {
        showAdminNotice("Η κράτηση επιβεβαιώθηκε, αλλά το email δεν είναι ρυθμισμένο στο Render.", "error");
      } else if (updatedReservation.confirmationEmail?.error) {
        showAdminNotice(`Η κράτηση επιβεβαιώθηκε, αλλά το email απέτυχε: ${updatedReservation.confirmationEmail.error}`, "error");
      } else {
        showAdminNotice("Η κράτηση επιβεβαιώθηκε. Email στέλνεται μόνο όταν αλλάζει από pending/cancelled σε confirmed.", "success");
      }
    }
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
          <span>${label}</span>
          <strong>${counts[filter]}</strong>
        </button>
      `
    )
    .join("");

  filters.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      renderAdminFromCache();
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
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
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
      <span>Active</span>
      <strong>${counts.active}</strong>
      <small>επόμενες</small>
    </div>
    <div>
      <span>Today</span>
      <strong>${counts.today}</strong>
      <small>κρατήσεις</small>
    </div>
    <div>
      <span>Pending guests</span>
      <strong>${pendingGuests}</strong>
      <small>άτομα</small>
    </div>
  `;
}

function showAdminNotice(message, tone = "default") {
  const notice = document.querySelector("#admin-notice");
  if (!notice) return;

  notice.textContent = message;
  notice.dataset.tone = tone;
}

function updateBulkSelectionControls() {
  const count = selectedReservationIds.size;
  const countLabel = document.querySelector("#selected-count");
  const deleteButton = document.querySelector("#delete-selected");
  const selectAllButton = document.querySelector("#select-all-visible");
  const clearButton = document.querySelector("#clear-selected");

  if (countLabel) {
    countLabel.textContent = `${count} επιλεγμένες`;
  }

  if (deleteButton) {
    deleteButton.disabled = count === 0;
  }

  if (clearButton) {
    clearButton.disabled = count === 0;
  }

  if (selectAllButton) {
    selectAllButton.disabled = visibleReservationIds.length === 0;
  }
}

function renderManualReservationTimeSlots() {
  const timeSelect = document.querySelector("#manual-time");
  if (!timeSelect) return;

  timeSelect.innerHTML = timeSlots
    .map((time) => `<option value="${time}" ${time === "20:00" ? "selected" : ""}>${time}</option>`)
    .join("");
}

function reservationFromForm(form) {
  const formData = new FormData(form);

  return {
    name: formData.get("name").trim(),
    phone: formData.get("phone").trim(),
    email: formData.get("email").trim(),
    guests: Number(formData.get("guests")),
    date: formData.get("date"),
    time: formData.get("time"),
    occasion: formData.get("occasion"),
  };
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
    list.innerHTML = `
      <section class="booking-panel">
        <div class="booking-panel__header">
          <div>
            <p>Booking List</p>
            <h2>Κρατήσεις</h2>
          </div>
          <span>0 αποτελέσματα</span>
        </div>
        <div class="empty-state">Δεν βρέθηκαν κρατήσεις με αυτά τα φίλτρα</div>
      </section>
    `;
    visibleReservationIds = [];
    updateBulkSelectionControls();
    return;
  }

  visibleReservationIds = filteredReservations.map((reservation) => reservation.id);
  selectedReservationIds = new Set([...selectedReservationIds].filter((id) => reservations.some((reservation) => reservation.id === id)));

  list.innerHTML = `
    <section class="booking-panel">
      <div class="booking-panel__header">
        <div>
          <p>Booking List</p>
          <h2>Κρατήσεις</h2>
        </div>
        <span>${filteredReservations.length} ${filteredReservations.length === 1 ? "αποτέλεσμα" : "αποτελέσματα"}</span>
      </div>
      <div class="booking-table-wrap">
        <table class="booking-table">
          <thead>
            <tr>
              <th aria-label="Επιλογή"></th>
              <th>Booking ID</th>
              <th>Status</th>
              <th>Guest</th>
              <th>Date</th>
              <th>Time</th>
              <th>Guests</th>
              <th>Contact</th>
              <th>Occasion</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredReservations
              .map(
                (reservation) => `
                  <tr data-testid="reservation-${reservation.id}">
                    <td>
                      <input
                        class="booking-checkbox"
                        type="checkbox"
                        data-select-reservation
                        value="${escapeHtml(reservation.id)}"
                        aria-label="Επιλογή κράτησης ${escapeHtml(reservation.name)}"
                        ${selectedReservationIds.has(reservation.id) ? "checked" : ""}
                      />
                    </td>
                    <td><span class="booking-id">#${escapeHtml(reservation.id.slice(0, 8))}</span></td>
                    <td>
                      <span class="status status--${escapeHtml(reservation.status)}">${escapeHtml(
                        statusLabels[reservation.status] || reservation.status
                      )}</span>
                    </td>
                    <td>
                      <strong>${escapeHtml(reservation.name)}</strong>
                      <small>${escapeHtml(reservation.email)}</small>
                    </td>
                    <td>${escapeHtml(formatReservationDate(reservation))}</td>
                    <td>${escapeHtml(reservation.time)}</td>
                    <td>${escapeHtml(reservation.guests)}</td>
                    <td><a href="tel:${escapeHtml(reservation.phone)}">${escapeHtml(reservation.phone)}</a></td>
                    <td>${escapeHtml(occasionLabels[reservation.occasion] || "-")}</td>
                    <td>
                      <div class="table-actions">
                        ${
                          reservation.status !== "confirmed"
                            ? `<button class="table-action table-action--confirm" data-action="confirmed" data-id="${reservation.id}" data-testid="confirm-${reservation.id}">Confirm</button>`
                            : ""
                        }
                        ${
                          reservation.status !== "cancelled"
                            ? `<button class="table-action table-action--cancel" data-action="cancelled" data-id="${reservation.id}" data-testid="cancel-${reservation.id}">Cancel</button>`
                            : ""
                        }
                        <button class="table-action table-action--delete" data-action="delete" data-id="${reservation.id}" data-testid="delete-${reservation.id}">Delete</button>
                      </div>
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  list.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "delete") {
        deleteReservation(button.dataset.id);
        return;
      }

      setReservationStatus(button.dataset.id, button.dataset.action);
    });
  });

  list.querySelectorAll("[data-select-reservation]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedReservationIds.add(checkbox.value);
      } else {
        selectedReservationIds.delete(checkbox.value);
      }

      updateBulkSelectionControls();
    });
  });

  updateBulkSelectionControls();
}

function renderAdminView(reservations, shouldUpdateRefreshStatus = false) {
  renderAdminSummary(reservations);
  renderAdminFilters(reservations);
  renderReservations(reservations);
  showAdminNotice("");

  if (shouldUpdateRefreshStatus) {
    lastAdminRefreshAt = new Date();
    nextAdminRefreshAt = new Date(Date.now() + 30000);
    updateRefreshStatus();
  }
}

function renderAdminFromCache() {
  if (!hasAdminReservationsCache) {
    renderAdmin();
    return;
  }

  renderAdminView(adminReservationsCache);
}

async function renderAdmin() {
  if (isAdminRendering) return;

  isAdminRendering = true;

  try {
    const reservations = await getAdminReservations();
    adminReservationsCache = reservations;
    hasAdminReservationsCache = true;
    renderAdminView(reservations, true);
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
  refreshLabel.textContent = `Ενημερώθηκε ${lastAdminRefreshAt.toLocaleTimeString("el-GR", {
    hour: "2-digit",
    minute: "2-digit",
  })} · ${secondsLeft}s`;
}

function initAdmin() {
  const searchInput = document.querySelector("#admin-search");
  if (!searchInput) return;

  renderManualReservationTimeSlots();
  const manualDateInput = document.querySelector("#manual-date");
  if (manualDateInput) {
    manualDateInput.value = formatDateForInput(new Date());
  }

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

  document.querySelector("#toggle-manual-form")?.addEventListener("click", () => {
    document.querySelector("#manual-reservation-panel")?.classList.toggle("is-open");
    document.querySelector("#manual-name")?.focus();
  });

  document.querySelector("#cancel-manual-form")?.addEventListener("click", () => {
    document.querySelector("#manual-reservation-panel")?.classList.remove("is-open");
  });

  document.querySelector("#manual-reservation-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    button.disabled = true;

    try {
      await createAdminReservation(reservationFromForm(form));
      form.reset();
      form.elements.guests.value = "2";
      form.elements.date.value = formatDateForInput(new Date());
      form.elements.time.value = "20:00";
      document.querySelector("#manual-reservation-panel")?.classList.remove("is-open");
      await renderAdmin();
      showAdminNotice("Η κράτηση προστέθηκε χειροκίνητα.", "success");
    } catch (error) {
      showAdminNotice(error.message || "Δεν έγινε η προσθήκη κράτησης.", "error");
      if (error.message.includes("authentication")) {
        showAdminLogin();
      }
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#select-all-visible")?.addEventListener("click", () => {
    visibleReservationIds.forEach((id) => selectedReservationIds.add(id));
    document.querySelectorAll("[data-select-reservation]").forEach((checkbox) => {
      checkbox.checked = true;
    });
    updateBulkSelectionControls();
  });

  document.querySelector("#clear-selected")?.addEventListener("click", () => {
    selectedReservationIds.clear();
    document.querySelectorAll("[data-select-reservation]").forEach((checkbox) => {
      checkbox.checked = false;
    });
    updateBulkSelectionControls();
  });

  document.querySelector("#delete-selected")?.addEventListener("click", async () => {
    const ids = [...selectedReservationIds];
    if (ids.length === 0) return;

    const confirmed = confirm(`Σίγουρα θέλεις να διαγράψεις ${ids.length} επιλεγμένες κρατήσεις;`);
    if (!confirmed) return;

    const button = document.querySelector("#delete-selected");
    button.disabled = true;

    try {
      await Promise.all(ids.map((id) => removeReservation(id)));
      selectedReservationIds.clear();
      await renderAdmin();
      showAdminNotice(`Διαγράφηκαν ${ids.length} κρατήσεις.`, "success");
    } catch (error) {
      showAdminNotice(error.message || "Δεν ολοκληρώθηκε η μαζική διαγραφή.", "error");
      if (error.message.includes("authentication")) {
        showAdminLogin();
      }
    } finally {
      button.disabled = false;
      updateBulkSelectionControls();
    }
  });

  searchInput.addEventListener("input", renderAdminFromCache);
  document.querySelector("#admin-date-scope")?.addEventListener("change", (event) => {
    currentDateScope = event.target.value;
    renderAdminFromCache();
  });
  document.querySelector("#admin-sort")?.addEventListener("change", (event) => {
    currentSort = event.target.value;
    renderAdminFromCache();
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
    adminRefreshStatusInterval = setInterval(updateRefreshStatus, 1500);
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
