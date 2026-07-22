const canvas = document.querySelector("#waterCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
let width = 0;
let height = 0;
let bands = [];
let ripples = [];
let pointerTargetX = .72;
let pointerTargetY = .32;
let pointerX = pointerTargetX;
let pointerY = pointerTargetY;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let waterActive = !reduceMotion;
let waterFrame = 0;

function renderTransparentBear() {
  const source = new Image();
  source.addEventListener("load", () => {
    const crop = { x: 395, y: 165, width: 460, height: 615 };
    const buffer = document.createElement("canvas");
    buffer.width = crop.width;
    buffer.height = crop.height;
    const bufferContext = buffer.getContext("2d", { willReadFrequently: true });
    bufferContext.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const pixels = bufferContext.getImageData(0, 0, crop.width, crop.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const brightness = Math.max(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
      pixels.data[index + 3] = Math.max(0, Math.min(255, (brightness - 18) * 2.5));
    }
    bufferContext.putImageData(pixels, 0, 0);
    document.querySelectorAll(".bear-icon, .bear-mascot").forEach(target => {
      const targetContext = target.getContext("2d");
      targetContext.clearRect(0, 0, target.width, target.height);
      targetContext.drawImage(buffer, 0, 0, target.width, target.height);
    });
  });
  source.src = "assets/ember-labs.png";
}

renderTransparentBear();

function resizeWater() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  bands = Array.from({ length: 11 }, (_, index) => ({
    y: height * (.04 + index * .1), amplitude: 22 + index % 4 * 12,
    speed: .1 + index * .013, phase: index * .83,
    thickness: .9 + index % 3 * .55, alpha: .042 + index * .0055
  }));
  ripples = Array.from({ length: Math.max(28, Math.floor(width / 42)) }, (_, index) => ({
    x: index * 97 % width, y: index * 157 % height,
    length: 100 + index % 7 * 35, drift: .12 + index % 6 * .028,
    phase: index * .51, alpha: .042 + index % 5 * .017
  }));
}

function drawBand(band, time, offset = 0, opacity = 1) {
  const start = -width * .12;
  const end = width * 1.12;
  const gap = width / 4;
  const first = band.y + offset + Math.sin(time * band.speed + band.phase) * band.amplitude;
  const second = band.y + offset + Math.sin(time * band.speed * 1.35 + band.phase + 1.4) * band.amplitude * .72;
  const stroke = ctx.createLinearGradient(0, first - 50, width, second + 50);
  stroke.addColorStop(0, "rgba(216,173,85,0)");
  stroke.addColorStop(.23, `rgba(125,96,45,${band.alpha * opacity})`);
  stroke.addColorStop(.53, `rgba(255,232,178,${(band.alpha + .05) * opacity})`);
  stroke.addColorStop(.82, `rgba(216,173,85,${band.alpha * .8 * opacity})`);
  stroke.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = stroke;
  ctx.lineWidth = band.thickness * (opacity < 1 ? 2 : 1);
  ctx.beginPath();
  ctx.moveTo(start, first);
  ctx.bezierCurveTo(start + gap, first - band.amplitude * 1.4, start + gap * 2, second + band.amplitude, start + gap * 3, second);
  ctx.bezierCurveTo(start + gap * 3.8, second - band.amplitude, end - gap * .7, first + band.amplitude, end, first);
  ctx.stroke();
}

function drawWater(ms) {
  const time = ms * .001;
  pointerX += (pointerTargetX - pointerX) * .035;
  pointerY += (pointerTargetY - pointerY) * .035;
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#020202"); base.addColorStop(.35, "#0a0907"); base.addColorStop(.72, "#040403"); base.addColorStop(1, "#000");
  ctx.fillStyle = base; ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(pointerX * width, pointerY * height, 0, pointerX * width, pointerY * height, Math.max(width, height) * .58);
  glow.addColorStop(0, "rgba(255,247,220,.18)"); glow.addColorStop(.18, "rgba(245,221,165,.1)"); glow.addColorStop(.4, "rgba(216,173,85,.05)"); glow.addColorStop(.7, "rgba(100,72,25,.02)"); glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "screen"; ctx.lineCap = "round";
  bands.forEach(band => { drawBand(band, time); drawBand(band, time + 2.8, height * .018, .43); });
  ripples.forEach((ripple, index) => {
    const x = (ripple.x + time * 34 * ripple.drift + Math.sin(time * .55 + ripple.phase) * 42) % (width + 240) - 120;
    const y = ripple.y + Math.sin(time * .36 + ripple.phase) * 54;
    const stroke = ctx.createLinearGradient(x, y, x + ripple.length, y);
    stroke.addColorStop(0, "rgba(216,173,85,0)"); stroke.addColorStop(.32, `rgba(216,173,85,${ripple.alpha})`); stroke.addColorStop(.58, `rgba(255,245,214,${ripple.alpha + .06})`); stroke.addColorStop(1, "rgba(216,173,85,0)");
    ctx.strokeStyle = stroke; ctx.lineWidth = .7 + index % 4 * .45; ctx.beginPath(); ctx.moveTo(x, y);
    for (let step = 0; step <= 9; step++) { const p = step / 9; ctx.lineTo(x + ripple.length * p, y + Math.sin(p * Math.PI * 2 + time * .9 + ripple.phase) * (5 + index % 4 * 1.7)); }
    ctx.stroke();
  });
  ctx.globalCompositeOperation = "source-over";
  if (waterActive) waterFrame = requestAnimationFrame(drawWater);
}

window.addEventListener("resize", resizeWater);
window.addEventListener("pointermove", event => { pointerTargetX = event.clientX / Math.max(width, 1); pointerTargetY = event.clientY / Math.max(height, 1); });
resizeWater();
if (waterActive) waterFrame = requestAnimationFrame(drawWater); else drawWater(0);
document.addEventListener("visibilitychange", () => {
  if (reduceMotion) return;
  if (document.hidden) {
    waterActive = false;
    cancelAnimationFrame(waterFrame);
  } else if (!waterActive) {
    waterActive = true;
    waterFrame = requestAnimationFrame(drawWater);
  }
});

const tabButtons = document.querySelectorAll(".tab-trigger");
function openTab(tabId) {
  document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === tabId));
  document.querySelectorAll(".tabs .tab-trigger").forEach(button => {
    const active = button.dataset.tab === tabId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  history.replaceState(null, "", `#${tabId}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
tabButtons.forEach(button => button.addEventListener("click", () => openTab(button.dataset.tab)));
const initialTab = location.hash.slice(1);
if (["inicio", "barbeiros", "servicos", "trabalhos", "studio"].includes(initialTab)) openTab(initialTab);

const modal = document.querySelector("#barber-modal");
const modalName = document.querySelector("#modal-name");
const modalRole = document.querySelector("#modal-role");
const modalBio = document.querySelector("#modal-bio");
const modalPhoto = document.querySelector("#modal-photo");
const modalService = document.querySelector("#modal-service");
const whatsappLink = document.querySelector("#whatsapp-link");
let selectedBarber = "Primeiro disponível";

function showBarber(card) {
  selectedBarber = card.dataset.barber;
  modalName.textContent = selectedBarber;
  modalRole.textContent = card.dataset.role;
  modalBio.textContent = card.dataset.bio;
  modalPhoto.src = card.dataset.photo;
  modalPhoto.alt = `Apresentação de ${selectedBarber}`;
  if (bookingDate.value) loadAvailability();
  modal.showModal();
}
document.querySelectorAll(".barber-card").forEach(card => card.querySelector(".profile-button").addEventListener("click", () => showBarber(card)));
document.querySelectorAll(".open-barbers").forEach(button => button.addEventListener("click", () => {
  if (button.dataset.service) modalService.value = button.dataset.service;
  const fallbackCard = document.querySelector(".barber-card");
  if (fallbackCard) showBarber(fallbackCard);
  else openTab("barbeiros");
}));
document.querySelector(".modal-close").addEventListener("click", () => modal.close());
modal.addEventListener("click", event => { if (event.target === modal) modal.close(); });

const clientName = document.querySelector("#client-name");
const clientPhone = document.querySelector("#client-phone");
const bookingDate = document.querySelector("#booking-date");
const bookingTime = document.querySelector("#booking-time");
const bookingNote = document.querySelector("#booking-note");
const modalMessage = document.querySelector("#modal-message");
const modalWorks = document.querySelectorAll("#modal-works img");
const today = new Date();
const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split("T")[0];
const maxBookingDate = new Date(today);
maxBookingDate.setDate(maxBookingDate.getDate() + 45);
bookingDate.min = localToday;
bookingDate.max = new Date(maxBookingDate.getTime() - maxBookingDate.getTimezoneOffset() * 60000).toISOString().split("T")[0];

async function loadAvailability() {
  if (!bookingDate.value) return;
  const date = new Date(`${bookingDate.value}T12:00:00`);
  if (date.getDay() === 0 || date.getDay() === 1) {
    bookingDate.value = "";
    modalMessage.textContent = "O Studio atende de terça a sábado. Escolha outra data.";
    bookingTime.innerHTML = '<option value="">Escolha outra data</option>';
    bookingTime.disabled = true;
    return;
  }
  modalMessage.textContent = "Consultando a agenda...";
  bookingTime.disabled = true;
  bookingTime.innerHTML = '<option value="">Carregando...</option>';
  try {
    const query = new URLSearchParams({ date: bookingDate.value, service: modalService.value, barber: selectedBarber });
    const response = await fetch(`/api/availability?${query}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não foi possível consultar a agenda.");
    bookingTime.innerHTML = payload.slots.length
      ? '<option value="">Escolha um horário</option>' + payload.slots.map(slot => `<option value="${slot.time}">${slot.time}</option>`).join("")
      : '<option value="">Sem horários disponíveis</option>';
    bookingTime.disabled = payload.slots.length === 0;
    modalMessage.textContent = payload.slots.length ? "" : "Não há horários livres nessa data para este serviço.";
  } catch (error) {
    bookingTime.innerHTML = '<option value="">Agenda indisponível</option>';
    bookingTime.disabled = true;
    modalMessage.textContent = `${error.message} Inicie o servidor pelo arquivo start-ember.cmd.`;
  }
}

bookingDate.addEventListener("change", loadAvailability);
modalService.addEventListener("change", loadAvailability);

whatsappLink.addEventListener("click", async () => {
  modalMessage.textContent = "";
  if (!clientName.value.trim() || !clientPhone.value.trim()) {
    modalMessage.textContent = "Informe seu nome e WhatsApp para reservar.";
    (!clientName.value.trim() ? clientName : clientPhone).focus();
    return;
  }
  if (!bookingDate.value || !bookingTime.value) return void (modalMessage.textContent = "Escolha uma data e um horário disponível.");
  whatsappLink.disabled = true;
  const originalText = whatsappLink.innerHTML;
  whatsappLink.textContent = "Reservando...";
  try {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientName: clientName.value, phone: clientPhone.value, barber: selectedBarber, service: modalService.value, date: bookingDate.value, time: bookingTime.value, notes: bookingNote.value })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não foi possível criar a reserva.");
    modalMessage.style.color = "#75c58b";
    modalMessage.textContent = `Horário reservado. Código ${payload.booking.code}. Abrindo o WhatsApp...`;
    window.location.href = payload.whatsappUrl;
  } catch (error) {
    modalMessage.style.color = "#efb2a8";
    modalMessage.textContent = error.message;
    await loadAvailability();
  } finally {
    whatsappLink.disabled = false;
    whatsappLink.innerHTML = originalText;
  }
});

document.querySelectorAll(".barber-card").forEach((card, index) => {
  card.querySelector(".profile-button").addEventListener("click", () => {
    const portfolios = [
      ["CORTES/img1.jpg", "CORTES/img3.jpg", "CORTES/img4.jpg"],
      ["CORTES/img2.jpg", "CORTES/img4.jpg", "CORTES/img1.jpg"],
      ["CORTES/img4.jpg", "CORTES/img1.jpg", "CORTES/img2.jpg"]
    ];
    modalWorks.forEach((image, workIndex) => { image.src = portfolios[index][workIndex]; });
    modalMessage.textContent = "";
  });
});

const serviceFilters = document.querySelectorAll("[data-service-filter]");
const serviceCards = document.querySelectorAll(".service-card[data-category]");
serviceFilters.forEach(filterButton => {
  filterButton.setAttribute("aria-pressed", String(filterButton.classList.contains("active")));
  filterButton.addEventListener("click", () => {
    const selectedCategory = filterButton.dataset.serviceFilter;
    serviceFilters.forEach(button => {
      const active = button === filterButton;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    serviceCards.forEach(card => {
      const categories = card.dataset.category.split(" ");
      card.classList.toggle("filtered-out", selectedCategory !== "todos" && !categories.includes(selectedCategory));
    });
  });
});
