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
  all: "ΚΡΑΤΗΣΕΙΣ",
  pending: "ΕΚΚΡΕΜΕΙΣ",
};

const apiBase =
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:8787"
    : "https://sardeles-backend.onrender.com";
let currentFilter = "all";
let isAdminRendering = false;
let lastAdminRefreshAt = null;
let nextAdminRefreshAt = null;

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
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
  try {
    return await apiRequest(`/api/reservations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  } catch {
    const reservations = getLocalReservations().map((reservation) =>
      reservation.id === id ? { ...reservation, status } : reservation
    );
    saveLocalReservations(reservations);
    return null;
  }
}

async function removeReservation(id) {
  try {
    return await apiRequest(`/api/reservations/${id}`, {
      method: "DELETE",
    });
  } catch {
    const reservations = getLocalReservations().filter((reservation) => reservation.id !== id);
    saveLocalReservations(reservations);
    return null;
  }
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
  const reservations = await getReservations();
  const reservationsElement = document.querySelector("#stats-reservations");
  const guestsElement = document.querySelector("#stats-guests");

  if (reservationsElement) {
    reservationsElement.textContent = reservations.length;
  }

  if (guestsElement) {
    guestsElement.textContent = reservations.reduce(
      (total, reservation) => total + Number(reservation.guests || 0),
      0
    );
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
  return {
    all: reservations.length,
    pending: reservations.filter((reservation) => reservation.status === "pending").length,
    confirmed: reservations.filter((reservation) => reservation.status === "confirmed").length,
    cancelled: reservations.filter((reservation) => reservation.status === "cancelled").length,
  };
}

async function setReservationStatus(id, status) {
  await updateReservationStatus(id, status);
  await renderAdmin();
}

async function deleteReservation(id) {
  const confirmed = confirm("Σίγουρα θέλεις να διαγράψεις αυτή την κράτηση;");
  if (!confirmed) return;

  await removeReservation(id);
  await renderAdmin();
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

function renderReservations(reservations) {
  const list = document.querySelector("#reservations-list");
  const searchInput = document.querySelector("#admin-search");
  if (!list || !searchInput) return;

  const searchTerm = searchInput.value.trim().toLowerCase();
  const filteredReservations = reservations.filter((reservation) => {
    const matchesFilter = currentFilter === "all" || reservation.status === currentFilter;
    const searchableText = `${reservation.name} ${reservation.phone} ${reservation.email}`.toLowerCase();
    return matchesFilter && searchableText.includes(searchTerm);
  });

  if (filteredReservations.length === 0) {
    list.innerHTML = '<div class="empty-state">Δεν βρέθηκαν κρατήσεις</div>';
    return;
  }

  list.innerHTML = filteredReservations
    .map(
      (reservation) => `
        <article class="reservation-card" data-testid="reservation-${reservation.id}">
          <div class="reservation-card__info">
            <div>
              <small>ΟΝΟΜΑ</small>
              <p><strong>${reservation.name}</strong></p>
              <p>${occasionLabels[reservation.occasion] || ""}</p>
            </div>
            <div>
              <small>ΕΠΙΚΟΙΝΩΝΙΑ</small>
              <p>${reservation.phone}</p>
              <p>${reservation.email}</p>
            </div>
            <div>
              <small>ΗΜ/ΝΙΑ & ΩΡΑ</small>
              <p><strong>${reservation.date}</strong></p>
              <p>${reservation.time} · ${reservation.guests} άτομα</p>
            </div>
            <div>
              <small>ΚΑΤΑΣΤΑΣΗ</small>
              <span class="status status--${reservation.status}">${statusLabels[reservation.status]}</span>
              <p>#${reservation.id.slice(0, 8)}</p>
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
        </article>
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
    const reservations = await getReservations();
    renderAdminFilters(reservations);
    renderReservations(reservations);
    lastAdminRefreshAt = new Date();
    nextAdminRefreshAt = new Date(Date.now() + 30000);
    updateRefreshStatus();
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

  searchInput.addEventListener("input", renderAdmin);
  renderAdmin();

  const refreshInterval = setInterval(renderAdmin, 30000);
  const refreshStatusInterval = setInterval(updateRefreshStatus, 1000);
  window.addEventListener("beforeunload", () => {
    clearInterval(refreshInterval);
    clearInterval(refreshStatusInterval);
  });
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

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

document.addEventListener("DOMContentLoaded", () => {
  window.scrollTo(0, 0);
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