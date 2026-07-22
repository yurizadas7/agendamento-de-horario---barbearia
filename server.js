const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "agenda.json");
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ember2026";
const WHATSAPP_NUMBER = "5511915969577";
const sessions = new Map();

const services = [
  ["corte-social", "Corte Social", 45, 45, "cortes"],
  ["degrade-fade", "Degradê / Fade", 50, 50, "cortes"],
  ["corte-tesoura", "Corte na Tesoura", 55, 55, "cortes"],
  ["corte-infantil", "Corte Infantil", 40, 40, "cortes"],
  ["experiencia-completa", "Experiência Completa", 80, 75, "combo"],
  ["barba-premium", "Barba Premium", 35, 35, "barba"],
  ["pezinho-contornos", "Pezinho e Contornos", 20, 20, "cortes"],
  ["sobrancelha", "Sobrancelha", 15, 15, "cuidados"],
  ["hidratacao-capilar", "Hidratação Capilar", 30, 30, "cuidados"],
  ["camuflagem-grisalhos", "Camuflagem de Grisalhos", 45, 45, "cuidados"],
  ["luzes-platinado", "Luzes ou Platinado", 120, null, "cuidados"],
  ["alinhamento-capilar", "Alinhamento Capilar", 90, null, "cuidados"]
].map(([id, name, duration, price, category]) => ({ id, name, duration, price, category, active: true }));

const defaultDatabase = {
  services,
  barbers: [
    { id: "rafael-costa", name: "Rafael Costa", specialty: "Degradê e cortes modernos", workDays: [2, 3, 4, 5, 6], start: "09:00", end: "19:00", active: true },
    { id: "lucas-almeida", name: "Lucas Almeida", specialty: "Barba e cortes clássicos", workDays: [2, 3, 4, 5, 6], start: "09:00", end: "19:00", active: true }
  ],
  bookings: [],
  blocks: []
};

function ensureDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(defaultDatabase, null, 2), "utf8");
}

function readDatabase() {
  ensureDatabase();
  const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  if (!data.services?.length) data.services = defaultDatabase.services;
  if (!data.barbers?.length) data.barbers = defaultDatabase.barbers;
  data.bookings ||= [];
  data.blocks ||= [];
  return data;
}

function saveDatabase(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Payload muito grande"));
    });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("JSON inválido")); }
    });
    request.on("error", reject);
  });
}

function minutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function overlaps(startA, durationA, startB, durationB) {
  const a = minutes(startA);
  const b = minutes(startB);
  return a < b + durationB && b < a + durationA;
}

function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T12:00:00`).getTime());
}

function resolveService(database, value) {
  return database.services.find(item => item.active && (item.id === value || item.name === value));
}

function resolveBarber(database, value) {
  return database.barbers.find(item => item.active && (item.id === value || item.name === value));
}

function availableSlots(database, barber, service, date) {
  const day = new Date(`${date}T12:00:00`).getDay();
  if (!barber.workDays.includes(day)) return [];
  const slots = [];
  const start = minutes(barber.start);
  const end = minutes(barber.end);
  const activeBookings = database.bookings.filter(item => item.barberId === barber.id && item.date === date && item.status !== "cancelled");
  const activeBlocks = database.blocks.filter(item => item.barberId === barber.id && item.date === date);
  for (let value = start; value + service.duration <= end; value += 30) {
    const time = timeFromMinutes(value);
    const conflictsBooking = activeBookings.some(item => overlaps(time, service.duration, item.time, item.duration));
    const conflictsBlock = activeBlocks.some(item => overlaps(time, service.duration, item.start, minutes(item.end) - minutes(item.start)));
    const dateTime = new Date(`${date}T${time}:00`);
    if (!conflictsBooking && !conflictsBlock && dateTime.getTime() > Date.now()) slots.push(time);
  }
  return slots;
}

function publicConfig(database) {
  return {
    services: database.services.filter(item => item.active),
    barbers: database.barbers.filter(item => item.active).map(({ id, name, specialty }) => ({ id, name, specialty }))
  };
}

function getToken(request) {
  const header = request.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function isAuthorized(request) {
  const session = sessions.get(getToken(request));
  return Boolean(session && session.expiresAt > Date.now());
}

function requireAdmin(request, response) {
  if (isAuthorized(request)) return true;
  sendJson(response, 401, { error: "Acesso administrativo necessário." });
  return false;
}

function bookingWhatsApp(booking) {
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${booking.date}T12:00:00Z`));
  const text = [
    "Olá! Fiz uma reserva pelo site do Ember Studio.", "",
    `Código: ${booking.code}`,
    `Cliente: ${booking.clientName}`,
    `Telefone: ${booking.phone}`,
    `Barbeiro: ${booking.barberName}`,
    `Serviço: ${booking.serviceName}`,
    `Data: ${date}`,
    `Horário: ${booking.time}`,
    booking.notes ? `Observação: ${booking.notes}` : ""
  ].filter(Boolean).join("\n");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

async function handleApi(request, response, url) {
  const database = readDatabase();
  if (request.method === "GET" && url.pathname === "/api/config") return sendJson(response, 200, publicConfig(database));

  if (request.method === "GET" && url.pathname === "/api/availability") {
    const date = url.searchParams.get("date") || "";
    const service = resolveService(database, url.searchParams.get("service") || "");
    const barberValue = url.searchParams.get("barber") || "";
    if (!validDate(date) || !service) return sendJson(response, 400, { error: "Data ou serviço inválido." });
    if (barberValue === "Primeiro disponível" || barberValue === "first-available") {
      const byTime = new Map();
      database.barbers.filter(item => item.active).forEach(barber => availableSlots(database, barber, service, date).forEach(time => {
        if (!byTime.has(time)) byTime.set(time, { time, barberId: barber.id, barberName: barber.name });
      }));
      return sendJson(response, 200, { slots: [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time)) });
    }
    const barber = resolveBarber(database, barberValue);
    if (!barber) return sendJson(response, 400, { error: "Barbeiro inválido." });
    return sendJson(response, 200, { slots: availableSlots(database, barber, service, date).map(time => ({ time, barberId: barber.id, barberName: barber.name })) });
  }

  if (request.method === "POST" && url.pathname === "/api/bookings") {
    const body = await readBody(request);
    const service = resolveService(database, body.service);
    const chosenBarber = body.barber === "Primeiro disponível" ? null : resolveBarber(database, body.barber);
    if (!body.clientName?.trim() || !body.phone?.trim() || !service || !validDate(body.date) || !/^\d{2}:\d{2}$/.test(body.time || "")) {
      return sendJson(response, 400, { error: "Preencha corretamente nome, telefone, serviço, data e horário." });
    }
    let barber = chosenBarber;
    if (!barber) barber = database.barbers.find(item => item.active && availableSlots(database, item, service, body.date).includes(body.time));
    if (!barber || !availableSlots(database, barber, service, body.date).includes(body.time)) return sendJson(response, 409, { error: "Este horário acabou de ficar indisponível. Escolha outro." });
    const booking = {
      id: crypto.randomUUID(), code: crypto.randomBytes(3).toString("hex").toUpperCase(),
      clientName: body.clientName.trim().slice(0, 100), phone: body.phone.trim().slice(0, 30),
      serviceId: service.id, serviceName: service.name, duration: service.duration, price: service.price,
      barberId: barber.id, barberName: barber.name, date: body.date, time: body.time,
      notes: String(body.notes || "").trim().slice(0, 300), status: "pending", createdAt: new Date().toISOString()
    };
    database.bookings.push(booking);
    saveDatabase(database);
    return sendJson(response, 201, { booking, whatsappUrl: bookingWhatsApp(booking) });
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await readBody(request);
    const supplied = Buffer.from(String(body.password || ""));
    const expected = Buffer.from(ADMIN_PASSWORD);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return sendJson(response, 401, { error: "Senha inválida." });
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
    return sendJson(response, 200, { token });
  }

  // Painel local sem autenticação, conforme configuração solicitada.

  if (request.method === "GET" && url.pathname === "/api/admin/dashboard") {
    const today = new Date().toISOString().slice(0, 10);
    const active = database.bookings.filter(item => item.status !== "cancelled");
    return sendJson(response, 200, {
      bookings: database.bookings.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)),
      blocks: database.blocks,
      config: publicConfig(database),
      stats: {
        today: active.filter(item => item.date === today).length,
        pending: active.filter(item => item.status === "pending").length,
        confirmed: active.filter(item => item.status === "confirmed").length,
        revenue: active.filter(item => item.status === "completed").reduce((sum, item) => sum + (item.price || 0), 0)
      }
    });
  }

  const bookingMatch = url.pathname.match(/^\/api\/admin\/bookings\/([^/]+)$/);
  if (request.method === "PATCH" && bookingMatch) {
    const body = await readBody(request);
    const allowed = ["pending", "confirmed", "completed", "cancelled"];
    const booking = database.bookings.find(item => item.id === bookingMatch[1]);
    if (!booking || !allowed.includes(body.status)) return sendJson(response, 400, { error: "Reserva ou status inválido." });
    booking.status = body.status;
    booking.updatedAt = new Date().toISOString();
    saveDatabase(database);
    return sendJson(response, 200, { booking });
  }

  if (request.method === "POST" && url.pathname === "/api/admin/blocks") {
    const body = await readBody(request);
    const barber = resolveBarber(database, body.barberId);
    if (!barber || !validDate(body.date) || !/^\d{2}:\d{2}$/.test(body.start || "") || !/^\d{2}:\d{2}$/.test(body.end || "") || minutes(body.end) <= minutes(body.start)) {
      return sendJson(response, 400, { error: "Dados do bloqueio inválidos." });
    }
    const block = { id: crypto.randomUUID(), barberId: barber.id, barberName: barber.name, date: body.date, start: body.start, end: body.end, reason: String(body.reason || "Bloqueio interno").slice(0, 120) };
    database.blocks.push(block);
    saveDatabase(database);
    return sendJson(response, 201, { block });
  }

  const blockMatch = url.pathname.match(/^\/api\/admin\/blocks\/([^/]+)$/);
  if (request.method === "DELETE" && blockMatch) {
    const index = database.blocks.findIndex(item => item.id === blockMatch[1]);
    if (index < 0) return sendJson(response, 404, { error: "Bloqueio não encontrado." });
    database.blocks.splice(index, 1);
    saveDatabase(database);
    return sendJson(response, 200, { ok: true });
  }

  sendJson(response, 404, { error: "Rota não encontrada." });
}

const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon" };

function serveStatic(response, pathname) {
  let relative = decodeURIComponent(pathname);
  if (relative === "/") relative = "/index.html";
  if (relative === "/admin" || relative === "/admin/") relative = "/admin/index.html";
  const file = path.resolve(ROOT, `.${relative}`);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("Arquivo não encontrado");
  }
  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin"
  });
  fs.createReadStream(file).pipe(response);
}

ensureDatabase();
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(request, response, url);
    else serveStatic(response, url.pathname);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "Erro interno do servidor." });
    else response.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Ember Studio: http://127.0.0.1:${PORT}`);
  console.log(`Painel: http://127.0.0.1:${PORT}/admin`);
});
