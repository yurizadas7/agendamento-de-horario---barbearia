const tokenKey = "emberAdminToken";
let token = sessionStorage.getItem(tokenKey) || "";
let dashboard = null;

const loginView = document.querySelector("#login-view");
const adminApp = document.querySelector("#admin-app");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const bookingList = document.querySelector("#booking-list");
const bookingEmpty = document.querySelector("#booking-empty");
const filterDate = document.querySelector("#filter-date");
const filterStatus = document.querySelector("#filter-status");
const blockForm = document.querySelector("#block-form");
const blockMessage = document.querySelector("#block-message");

async function request(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
  return payload;
}

function setLoggedIn(value) {
  loginView.hidden = value;
  adminApp.hidden = !value;
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function dateLabel(date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

const statusLabels = { pending: "Pendente", confirmed: "Confirmado", completed: "Concluído", cancelled: "Cancelado" };

function renderDashboard() {
  document.querySelector("#stat-today").textContent = dashboard.stats.today;
  document.querySelector("#stat-pending").textContent = dashboard.stats.pending;
  document.querySelector("#stat-confirmed").textContent = dashboard.stats.confirmed;
  document.querySelector("#stat-revenue").textContent = currency(dashboard.stats.revenue);
  renderBookings();
  renderBlocks();
  const barberSelect = document.querySelector("#block-barber");
  barberSelect.innerHTML = dashboard.config.barbers.map(item => `<option value="${item.id}">${item.name}</option>`).join("");
}

function renderBookings() {
  const date = filterDate.value;
  const status = filterStatus.value;
  const bookings = dashboard.bookings.filter(item => (!date || item.date === date) && (!status || item.status === status));
  bookingEmpty.hidden = bookings.length > 0;
  bookingList.innerHTML = bookings.map(item => `
    <article class="booking" data-id="${item.id}">
      <div class="booking-time"><strong>${item.time}</strong><span>${dateLabel(item.date)}</span></div>
      <div class="booking-client"><strong>${item.clientName}</strong><span>${item.phone} · ${item.code}</span></div>
      <div class="booking-service"><strong>${item.serviceName}</strong><span>${item.barberName} · ${item.duration} min</span></div>
      <div class="booking-status"><span class="status ${item.status}">${statusLabels[item.status]}</span></div>
      <div class="booking-actions">
        ${item.status === "pending" ? `<button data-status="confirmed">Confirmar</button>` : ""}
        ${item.status === "confirmed" ? `<button data-status="completed">Concluir</button>` : ""}
        ${!["completed", "cancelled"].includes(item.status) ? `<button data-status="cancelled">Cancelar</button>` : ""}
      </div>
    </article>`).join("");
}

function renderBlocks() {
  const today = new Date().toISOString().slice(0, 10);
  const blocks = dashboard.blocks.filter(item => item.date >= today).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  document.querySelector("#block-empty").hidden = blocks.length > 0;
  document.querySelector("#block-list").innerHTML = blocks.map(item => `<article class="block-item" data-id="${item.id}"><div><strong>${item.barberName} · ${dateLabel(item.date)}</strong><span>${item.start}–${item.end} · ${item.reason}</span></div><button type="button" aria-label="Remover bloqueio">×</button></article>`).join("");
}

async function loadDashboard() {
  try {
    dashboard = await request("/api/admin/dashboard");
    setLoggedIn(true);
    renderDashboard();
  } catch (error) {
    if (/acesso|sessão|administrativo/i.test(error.message)) {
      token = "";
      sessionStorage.removeItem(tokenKey);
      setLoggedIn(false);
    } else {
      bookingList.innerHTML = `<p class="error-banner">${error.message}</p>`;
    }
  }
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginMessage.textContent = "";
  try {
    const result = await request("/api/admin/login", { method: "POST", body: JSON.stringify({ password: document.querySelector("#password").value }) });
    token = result.token;
    sessionStorage.setItem(tokenKey, token);
    await loadDashboard();
  } catch (error) { loginMessage.textContent = error.message; }
});

bookingList.addEventListener("click", async event => {
  const button = event.target.closest("[data-status]");
  if (!button) return;
  button.disabled = true;
  try {
    const card = button.closest("[data-id]");
    await request(`/api/admin/bookings/${card.dataset.id}`, { method: "PATCH", body: JSON.stringify({ status: button.dataset.status }) });
    await loadDashboard();
  } catch (error) { button.disabled = false; window.alert(error.message); }
});

blockForm.addEventListener("submit", async event => {
  event.preventDefault();
  blockMessage.textContent = "";
  try {
    await request("/api/admin/blocks", { method: "POST", body: JSON.stringify({ barberId: document.querySelector("#block-barber").value, date: document.querySelector("#block-date").value, start: document.querySelector("#block-start").value, end: document.querySelector("#block-end").value, reason: document.querySelector("#block-reason").value }) });
    blockForm.reset();
    blockMessage.style.color = "var(--green)";
    blockMessage.textContent = "Horário bloqueado.";
    await loadDashboard();
  } catch (error) { blockMessage.style.color = "var(--red)"; blockMessage.textContent = error.message; }
});

document.querySelector("#block-list").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button) return;
  const item = button.closest("[data-id]");
  try { await request(`/api/admin/blocks/${item.dataset.id}`, { method: "DELETE" }); await loadDashboard(); } catch (error) { window.alert(error.message); }
});

[filterDate, filterStatus].forEach(field => field.addEventListener("change", renderBookings));
document.querySelector("#refresh").addEventListener("click", loadDashboard);
document.querySelector("#logout")?.addEventListener("click", () => { token = ""; sessionStorage.removeItem(tokenKey); setLoggedIn(false); });

loadDashboard();
