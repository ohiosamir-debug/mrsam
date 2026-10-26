/**
 * Mr.Sam · сервер кабинетов на Google Таблице.
 *
 * Вход: код ученика + пароль. При первом входе ученик сам придумывает пароль.
 * Забыл пароль: удали строку ученика на листе «Доступ», и при следующем входе он задаст новый.
 *
 * Что делает: вход учеников по коду и паролю, общая запись на занятия по слотам (без двойных записей),
 * отмена, оплаты с чеком (чек сохраняется на Google Диск), домашка с файлами, результаты тестов,
 * заявки с сайта. Занятые события в Google Календаре Самира тоже закрывают слоты.
 *
 * Установка (5 минут):
 *  1. script.google.com → «Новый проект» → вставь этот файл вместо Code.gs → Сохранить.
 *  2. Выбери функцию setup → «Выполнить» → разреши доступ к Таблицам, Диску, Календарю и почте.
 *     Появится таблица «Mr.Sam · кабинеты» у тебя на Диске (ссылка будет в журнале выполнения).
 *  3. «Развернуть» → «Новое развёртывание» → тип «Веб-приложение»:
 *     «Запуск от имени» = Я, «У кого есть доступ» = Все. Скопируй URL, он заканчивается на /exec.
 *  4. Этот URL вставь в CONFIG.api во всех кабинетах и в CONFIG.form.endpoint на сайте.
 *  После правок кода: «Развернуть» → «Управление развёртываниями» → карандаш → «Новая версия».
 *
 * Кабинет учителя (teacher.html): один раз запусти функцию initAdmin, пароль появится в журнале выполнения.
 * Забыл пароль учителя: запусти resetAdminPassword. Игры лежат на Диске в папке «Mr.Sam · игры», список на листе «Игры».
 */

const SETTINGS = {
  TZ: "Europe/Moscow",
  DAYS_AHEAD: 21,          // на сколько дней вперёд открыта запись
  MIN_LEAD_HOURS: 12,      // минимум часов до занятия, чтобы записаться
  CANCEL_HOURS: 24,        // отменить можно не позже чем за столько часов
  LESSON_MIN: 60,          // длительность занятия, минут
  MAX_ACTIVE: 3,           // сколько будущих записей может держать один ученик
  USE_CALENDAR: true,      // события в твоём Google Календаре закрывают пересекающиеся слоты
  ADD_TO_CALENDAR: true,   // запись ученика сразу создаёт событие в календаре
  NOTIFY_EMAIL: true,      // письмо тебе о записи, отмене, оплате, сдаче ДЗ и заявке
  SESSION_DAYS: 60,        // сколько дней ученик остаётся в кабинете без повторного ввода пароля
  MIN_PASSWORD: 6,         // минимальная длина пароля
  MAX_FAILS: 5,            // неверных паролей подряд, после которых вход закрывается на 15 минут
  RECEIPTS_FOLDER: "Mr.Sam · чеки",
  FILES_FOLDER: "Mr.Sam · домашка"
};

const SHEETS = {
  students: ["Ученики", ["Код", "Имя", "Кабинеты", "Цель IELTS", "Цель TOEFL", "Куда поступает", "Дата экзамена", "Заметка", "Баланс занятий", "Цвет", "Аватар"]],
  schedule: ["Расписание", ["День недели", "Время", "Кабинеты"]],
  closed: ["Закрытые дни", ["Дата", "Время", "Комментарий"]],
  bookings: ["Записи", ["ID", "Дата", "Время", "Кабинет", "Код", "Имя", "Статус", "Комментарий", "Создано", "Событие"]],
  payments: ["Оплаты", ["Дата", "Код", "Имя", "Кабинет", "Пакет", "Сумма", "Занятий", "Статус", "Комментарий", "Чек"]],
  homework: ["Домашка", ["ID", "Коды", "Кабинет", "Название", "Описание", "Срок", "Шаги (JSON)", "Ссылка", "Начало"]],
  submissions: ["Сдачи", ["Дата", "Код", "Кабинет", "ID задания", "Ответы (JSON)", "Файлы", "Статус", "Оценка", "Комментарий", "Отзыв по шагам (JSON)"]],
  results: ["Результаты", ["Дата", "Код", "Кабинет", "Тест", "Раздел", "Балл", "Оценка Самира", "Комментарий Самира", "ID", "JSON"]],
  math: ["Математика", ["Дата", "Код", "Тема", "Уровень", "Верно", "Всего", "JSON"]],
  leads: ["Заявки", ["Дата", "Имя", "Контакт", "Услуга", "Маршрут", "Сообщение", "Источник", "Все поля (JSON)"]],
  state: ["Состояние", ["Код", "Кабинет", "Данные (JSON)", "Обновлено"]],
  access: ["Доступ", ["Код", "Хеш пароля", "Соль", "Обновлён"]],
  sessions: ["Сессии", ["Токен (хеш)", "Код", "Создан", "Истекает"]],
  games: ["Игры", ["ID", "Название", "Предмет", "Кабинеты", "Описание", "Файл", "Размер, КБ", "Добавлено", "Показывать"]]
};
const ADMIN = "__ADMIN__";
const TRACKS = ["ielts", "toefl", "math"];
const WEEKDAYS = { "вс": 0, "пн": 1, "вт": 2, "ср": 3, "чт": 4, "пт": 5, "сб": 6 };

/* ======================= установка ======================= */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const id = props.getProperty("SHEET_ID");
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create("Mr.Sam · кабинеты"); props.setProperty("SHEET_ID", ss.getId()); }
  Object.keys(SHEETS).forEach(k => {
    const [name, head] = SHEETS[k];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) { sh.appendRow(head); sh.setFrozenRows(1); sh.getRange(1, 1, 1, head.length).setFontWeight("bold").setBackground("#D5F36A"); }
  });
  try { ss.setSpreadsheetTimeZone(SETTINGS.TZ); } catch (e) {}
  const first = ss.getSheets()[0];
  if (first.getName() === "Лист1" || first.getName() === "Sheet1") ss.deleteSheet(first);
  // тестовый ученик и рабочие часы 9:00–22:00. Выходной или занятой час закрывай на листе «Закрытые дни».
  const st = sh_("students");
  if (st.getLastRow() === 1) st.appendRow(["TEST-1", "Тестовый ученик", "ielts, toefl, math", 7, 5, "", "", "Это тестовый профиль, удали его", 4, "violet", "rocket"]);
  const sc = sh_("schedule");
  if (sc.getLastRow() === 1) {
    const rows = [];
    // каждый день с 9:00 до 22:00, слоты по часу (последний 21:00–22:00)
    ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].forEach(d => { for (let hh = 9; hh <= 21; hh++) rows.push([d, (hh < 10 ? "0" : "") + hh + ":00", ""]); });
    sc.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  [sh_("schedule").getRange("B:B"), sh_("bookings").getRange("B:C"), sh_("closed").getRange("B:B")].forEach(r => r.setNumberFormat("@"));
  Logger.log("Таблица: " + ss.getUrl());
  return ss.getUrl();
}

/* ======================= маршрутизация ======================= */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === "slots") return out_(slots_(Object.assign({}, p, { code: "" })));   // без входа: только свободные и занятые
    return out_({ ok: true, service: "mrsam", time: new Date().toISOString() });
  } catch (err) { return out_({ ok: false, error: "server", message: String(err) }); }
}
const PUBLIC = { check: 1, auth: 1, set_password: 1, lead: 1, "": 1 };
function doPost(e) {
  const p = Object.assign({}, (e && e.parameter) || {});
  const action = p.action || "";
  try {
    switch (action) {
      case "check": return out_(check_(p));
      case "auth": return out_(auth_(p));
      case "set_password": return out_(setPassword_(p));
      case "": case "lead": return out_(lead_(p));
      case "admin_auth": return out_(adminAuth_(p));
    }
    const me = who_(p.token);
    if (!me) return out_({ ok: false, error: "auth" });
    if (action.indexOf("admin_") === 0) { if (!me.admin) return out_({ ok: false, error: "auth" }); return out_(admin_(action, p)); }
    if (me.admin) return out_({ ok: false, error: "auth" });
    p.code = me.code;                     // личность берём только из сессии, а не из присланного кода
    switch (action) {
      case "login": return out_(login_(p));
      case "slots": return out_(slots_(p));
      case "state_get": return out_({ ok: true, state: getState_(me.code, str_(p.exam || p.track).toLowerCase()) });
      case "state": return out_(saveState_(p));
      case "book": return out_(book_(p));
      case "cancel": return out_(cancel_(p));
      case "paid": return out_(paid_(p));
      case "result": return out_(result_(p));
      case "homework": return out_(homework_(p));
      case "upload": return out_(upload_(p));
      case "math_attempt": return out_(mathAttempt_(p));
      case "math_hw": return out_(homework_(Object.assign({}, p, { track: "math" })));
      case "change_password": return out_(changePassword_(p, me));
      case "logout": return out_(logout_(p));
      case "games": return out_(gamesFor_(me, p));
      case "game": return out_(gameHtml_(me, p));
      default: return out_({ ok: false, error: "unknown_action" });
    }
  } catch (err) { return out_({ ok: false, error: "server", message: String(err) }); }
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ======================= помощники таблицы ======================= */
function ss_() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID")); }
function sh_(k) {
  const ss = ss_(); let sh = ss.getSheetByName(SHEETS[k][0]);
  if (!sh) { sh = ss.insertSheet(SHEETS[k][0]); const head = SHEETS[k][1]; sh.appendRow(head); sh.setFrozenRows(1); sh.getRange(1, 1, 1, head.length).setFontWeight("bold").setBackground("#D5F36A"); }
  return sh;
}
function rows_(k) {
  const sh = sh_(k), n = sh.getLastRow();
  if (n < 2) return [];
  const head = SHEETS[k][1];
  return sh.getRange(2, 1, n - 1, head.length).getValues().map((r, i) => ({ _row: i + 2, r }));
}
function add_(k, arr) { sh_(k).appendRow(arr); }
const str_ = v => v == null ? "" : String(v).trim();
const up_ = v => str_(v).toUpperCase();
function tracksOf_(v) { const s = str_(v).toLowerCase(); if (!s || s === "все" || s === "all") return TRACKS.slice(); return s.split(/[,;\s]+/).map(x => x === "математика" ? "math" : x).filter(x => TRACKS.indexOf(x) >= 0); }
function date_(v) { if (v instanceof Date) return Utilities.formatDate(v, SETTINGS.TZ, "yyyy-MM-dd"); const s = str_(v); const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2) : s.slice(0, 10); }
function time_(v) { if (v instanceof Date) return Utilities.formatDate(v, SETTINGS.TZ, "HH:mm"); const m = str_(v).match(/^(\d{1,2})[:.](\d{2})/); return m ? ("0" + m[1]).slice(-2) + ":" + m[2] : ""; }
function at_(d, t) { return new Date(d + "T" + t + ":00+03:00").getTime(); }
function student_(code) {
  const c = up_(code); if (!c) return null;
  const hit = rows_("students").find(x => up_(x.r[0]) === c);
  if (!hit) return null;
  const r = hit.r;
  return { row: hit._row, code: c, name: str_(r[1]) || "Ученик", tracks: tracksOf_(r[2]), targets: { ielts: num_(r[3]), toefl: num_(r[4]) }, goal: str_(r[5]), examDate: r[6] ? date_(r[6]) : "", note: str_(r[7]), balance: r[8] === "" ? null : num_(r[8]), theme: str_(r[9]), avatar: str_(r[10]) };
}
function num_(v) { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; }
function folder_(name) { const it = DriveApp.getFoldersByName(name); return it.hasNext() ? it.next() : DriveApp.createFolder(name); }
function saveFile_(folderName, prefix, name, type, b64) {
  if (!b64) return "";
  const bytes = Utilities.base64Decode(b64);
  if (bytes.length > 10 * 1024 * 1024) return "";
  const blob = Utilities.newBlob(bytes, type || "application/octet-stream", prefix + " " + (name || "file"));
  return folder_(folderName).createFile(blob).getUrl();
}
function notify_(subject, body) {
  if (!SETTINGS.NOTIFY_EMAIL) return;
  try { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), "Mr.Sam · " + subject, body); } catch (e) {}
}

/* ======================= пароли и сессии ======================= */
function hex_(bytes) { return bytes.map(b => ("0" + (b & 255).toString(16)).slice(-2)).join(""); }
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function hashPass_(pass, salt) { let h = salt + ":" + pass; for (let i = 0; i < 1500; i++) h = sha_(salt + h); return h; }
function randHex_(n) { let s = ""; while (s.length < n) s += Utilities.getUuid().replace(/-/g, ""); return s.slice(0, n); }
function accessRow_(code) { return rows_("access").find(x => up_(x.r[0]) === code) || null; }
function check_(p) {
  const s = student_(p.code);
  if (!s) return { ok: false, error: "no_code" };
  const track = str_(p.exam || p.track).toLowerCase();
  if (track && s.tracks.indexOf(track) < 0) return { ok: false, error: "no_access" };
  return { ok: true, name: s.name, hasPassword: !!accessRow_(s.code) };
}
function fails_(code, add) {
  const c = CacheService.getScriptCache(), k = "fail:" + code;
  let n = parseInt(c.get(k) || "0", 10);
  if (add === "reset") { c.remove(k); return 0; }
  if (add) { n++; c.put(k, String(n), 900); }
  return n;
}
function newSession_(code) {
  const token = randHex_(48);
  const now = new Date(), exp = new Date(now.getTime() + SETTINGS.SESSION_DAYS * 864e5);
  add_("sessions", [sha_(token), code, now, exp]);
  return token;
}
function who_(token) {
  token = str_(token); if (token.length < 32) return null;
  const th = sha_(token), cache = CacheService.getScriptCache();
  let code = cache.get("tok:" + th);
  if (!code) {
    const hit = rows_("sessions").find(x => str_(x.r[0]) === th);
    if (!hit || new Date(hit.r[3]).getTime() < Date.now()) return null;
    code = up_(hit.r[1]); cache.put("tok:" + th, code, 600);
  }
  if (code === ADMIN) return { admin: true, code: ADMIN };
  return student_(code);
}
function auth_(p) {
  const s = student_(p.code);
  if (!s) return { ok: false, error: "no_code" };
  const track = str_(p.exam || p.track).toLowerCase();
  if (track && s.tracks.indexOf(track) < 0) return { ok: false, error: "no_access" };
  if (fails_(s.code) >= SETTINGS.MAX_FAILS) return { ok: false, error: "locked" };
  const row = accessRow_(s.code);
  if (!row) return { ok: false, error: "no_password" };
  if (hashPass_(str_(p.password), str_(row.r[2])) !== str_(row.r[1])) { const n = fails_(s.code, true); return { ok: false, error: n >= SETTINGS.MAX_FAILS ? "locked" : "wrong_password", left: Math.max(0, SETTINGS.MAX_FAILS - n) }; }
  fails_(s.code, "reset");
  return { ok: true, token: newSession_(s.code), name: s.name };
}
function setPassword_(p) {
  const s = student_(p.code);
  if (!s) return { ok: false, error: "no_code" };
  const pass = str_(p.password);
  if (pass.length < SETTINGS.MIN_PASSWORD) return { ok: false, error: "weak_password" };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try {
    if (accessRow_(s.code)) return { ok: false, error: "has_password" };
    const salt = randHex_(24);
    add_("access", [s.code, hashPass_(pass, salt), salt, new Date()]);
  } finally { lock.releaseLock(); }
  notify_("ученик задал пароль", s.name + " (" + s.code + ") впервые вошёл в кабинет и задал пароль.");
  return { ok: true, token: newSession_(s.code), name: s.name };
}
function changePassword_(p, me) {
  const row = accessRow_(me.code);
  if (!row || hashPass_(str_(p.old), str_(row.r[2])) !== str_(row.r[1])) return { ok: false, error: "wrong_password" };
  const pass = str_(p.password);
  if (pass.length < SETTINGS.MIN_PASSWORD) return { ok: false, error: "weak_password" };
  const salt = randHex_(24);
  sh_("access").getRange(row._row, 2, 1, 3).setValues([[hashPass_(pass, salt), salt, new Date()]]);
  return { ok: true };
}
function logout_(p) {
  const th = sha_(str_(p.token));
  const hit = rows_("sessions").find(x => str_(x.r[0]) === th);
  if (hit) sh_("sessions").getRange(hit._row, 4).setValue(new Date(0));
  CacheService.getScriptCache().remove("tok:" + th);
  return { ok: true };
}
function upload_(p) {
  const s = student_(p.code);
  if (!p.data) return { ok: false, error: "bad_request" };
  const stamp = Utilities.formatDate(new Date(), SETTINGS.TZ, "yyyy-MM-dd HH-mm") + " " + s.code + " " + str_(p.hwId) + " " + str_(p.partId);
  const url = saveFile_(SETTINGS.FILES_FOLDER, stamp, p.name, p.type, p.data);
  return url ? { ok: true, url } : { ok: false, error: "too_big" };
}

/* ======================= вход ======================= */
function login_(p) {
  const s = student_(p.code);
  if (!s) return { ok: false, error: "no_code" };
  const track = str_(p.exam || p.track).toLowerCase();
  if (track && s.tracks.indexOf(track) < 0) return { ok: false, error: "no_access" };
  const mine = myBookings_(s.code);
  const next = mine.filter(b => b.status === "активна" && at_(b.d, b.t) > Date.now()).sort((a, b) => at_(a.d, a.t) - at_(b.d, b.t))[0];
  const attempts = rows_("results").filter(x => up_(x.r[1]) === s.code && (!track || str_(x.r[2]) === track)).map(x => {
    let a = {}; try { a = JSON.parse(x.r[9]); } catch (e) {}
    a.synced = true;
    if (x.r[6] !== "") a.teacherScore = num_(x.r[6]);
    if (str_(x.r[7])) a.teacherComment = str_(x.r[7]);
    return a;
  }).filter(a => a && a.id);
  const payments = rows_("payments").filter(x => up_(x.r[1]) === s.code).map(x => ({ date: new Date(x.r[0]).toISOString(), pkg: str_(x.r[4]), amount: num_(x.r[5]), lessons: num_(x.r[6]), status: str_(x.r[7]) || "ждёт подтверждения", track: str_(x.r[3]), receipt: !!str_(x.r[9]) }));
  return {
    ok: true, name: s.name, track: track ? [track] : s.tracks.filter(t => t !== "math"), targets: s.targets, goal: s.goal, examDate: s.examDate, note: s.note,
    theme: s.theme, avatar: s.avatar, nextLesson: next ? next.d + "T" + next.t + ":00+03:00" : "",
    homework: homeworkFor_(s.code, track), attempts, state: getState_(s.code, track), payments: { balance: s.balance, history: payments }, bookings: mine
  };
}

/* ======================= расписание ======================= */
function template_() {
  const t = {};
  rows_("schedule").forEach(x => {
    const wd = WEEKDAYS[str_(x.r[0]).toLowerCase().slice(0, 2)];
    const tm = time_(x.r[1]);
    if (wd == null || !tm) return;
    (t[wd] = t[wd] || []).push({ t: tm, tracks: tracksOf_(x.r[2]) });
  });
  return t;
}
function closed_() {
  const set = {};
  rows_("closed").forEach(x => { const d = date_(x.r[0]); if (!d) return; const t = time_(x.r[1]); set[d + " " + (t || "*")] = true; });
  return set;
}
function busyFromCalendar_(from, to) {
  if (!SETTINGS.USE_CALENDAR) return [];
  try {
    return CalendarApp.getDefaultCalendar().getEvents(new Date(from), new Date(to))
      .filter(ev => !ev.isAllDayEvent() && ev.getTag("mrsam") !== "booking" && ev.getMyStatus() !== CalendarApp.GuestStatus.NO)
      .map(ev => [ev.getStartTime().getTime(), ev.getEndTime().getTime()]);
  } catch (e) { return []; }
}
function activeBookings_() {
  return rows_("bookings").filter(x => str_(x.r[6]) !== "отменена").map(x => ({ row: x._row, id: str_(x.r[0]), d: date_(x.r[1]), t: time_(x.r[2]), track: str_(x.r[3]), code: up_(x.r[4]) }));
}
function myBookings_(code) {
  const now = Date.now();
  return rows_("bookings").filter(x => up_(x.r[4]) === code).map(x => ({ id: str_(x.r[0]), d: date_(x.r[1]), t: time_(x.r[2]), track: str_(x.r[3]), status: str_(x.r[6]) || "активна" }))
    .filter(b => at_(b.d, b.t) > now - 36e5 * 2);
}
/** все слоты на DAYS_AHEAD дней: free | taken | mine. Слоты общие для всех кабинетов: у Самира одно занятие в час. */
function buildSlots_(track, code) {
  const now = Date.now(), tpl = template_(), cl = closed_(), act = activeBookings_();
  const busy = busyFromCalendar_(now, now + (SETTINGS.DAYS_AHEAD + 1) * 864e5);
  const taken = {}; act.forEach(b => { taken[b.d + " " + b.t] = b.code; });
  const out = [];
  for (let i = 0; i < SETTINGS.DAYS_AHEAD; i++) {
    const day = new Date(now + i * 864e5), d = Utilities.formatDate(day, SETTINGS.TZ, "yyyy-MM-dd");
    const wd = new Date(d + "T12:00:00+03:00").getUTCDay();
    if (cl[d + " *"]) continue;
    (tpl[wd] || []).forEach(s => {
      if (track && s.tracks.indexOf(track) < 0) return;
      const start = at_(d, s.t), end = start + SETTINGS.LESSON_MIN * 60000;
      if (start < now + SETTINGS.MIN_LEAD_HOURS * 36e5 || cl[d + " " + s.t]) return;
      const owner = taken[d + " " + s.t];
      let st = owner ? (code && owner === code ? "mine" : "taken") : "free";
      if (st === "free" && busy.some(b => b[0] < end && b[1] > start)) st = "taken";
      out.push({ d, t: s.t, st });
    });
  }
  return out;
}
function slots_(p) {
  const track = str_(p.track).toLowerCase(), code = up_(p.code);
  const key = "slots:" + track;
  const cache = CacheService.getScriptCache();
  let base = null;
  const cached = cache.get(key);
  if (cached) base = JSON.parse(cached);
  else { base = buildSlots_(track, ""); cache.put(key, JSON.stringify(base), 15); }
  // «моё» считаем без кеша
  const mine = code ? myBookings_(code) : [];
  const mk = {}; mine.filter(b => b.status === "активна").forEach(b => { mk[b.d + " " + b.t] = true; });
  const slots = base.map(s => mk[s.d + " " + s.t] ? { d: s.d, t: s.t, st: "mine" } : s);
  return { ok: true, slots, mine, cfg: { days: SETTINGS.DAYS_AHEAD, cancelHours: SETTINGS.CANCEL_HOURS, lessonMin: SETTINGS.LESSON_MIN, maxActive: SETTINGS.MAX_ACTIVE, minLeadHours: SETTINGS.MIN_LEAD_HOURS } };
}
function book_(p) {
  const s = student_(p.code);
  if (!s) return { ok: false, error: "no_code" };
  const track = str_(p.track).toLowerCase(), d = date_(p.d), t = time_(p.t);
  if (TRACKS.indexOf(track) < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !t) return { ok: false, error: "bad_request" };
  if (s.tracks.indexOf(track) < 0) return { ok: false, error: "no_access" };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: "busy" };
  try {
    const fresh = buildSlots_(track, s.code);   // без кеша, внутри блокировки
    const slot = fresh.find(x => x.d === d && x.t === t);
    if (!slot) return { ok: false, error: at_(d, t) < Date.now() + SETTINGS.MIN_LEAD_HOURS * 36e5 ? "too_late" : "closed" };
    if (slot.st !== "free") return { ok: false, error: "taken" };
    const active = activeBookings_().filter(b => b.code === s.code && at_(b.d, b.t) > Date.now());
    if (active.length >= SETTINGS.MAX_ACTIVE) return { ok: false, error: "limit" };
    const id = "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    let evId = "";
    if (SETTINGS.ADD_TO_CALENDAR) {
      try {
        const ev = CalendarApp.getDefaultCalendar().createEvent("Mr.Sam: " + s.name + " · " + track.toUpperCase(), new Date(at_(d, t)), new Date(at_(d, t) + SETTINGS.LESSON_MIN * 60000), { description: "Код: " + s.code + (p.comment ? "\nЧто разобрать: " + str_(p.comment) : "") });
        ev.setTag("mrsam", "booking"); evId = ev.getId();
      } catch (e) {}
    }
    add_("bookings", [id, d, t, track, s.code, s.name, "активна", str_(p.comment).slice(0, 500), new Date(), evId]);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().removeAll(TRACKS.map(x => "slots:" + x).concat(["slots:"]));
    notify_("запись " + d + " " + t, s.name + " (" + s.code + ") записался на " + d + " в " + t + " МСК, " + track.toUpperCase() + (p.comment ? "\nЧто разобрать: " + p.comment : ""));
    return { ok: true, booking: { id, d, t, track, status: "активна" } };
  } finally { lock.releaseLock(); }
}
function cancel_(p) {
  const code = up_(p.code), id = str_(p.id);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: "busy" };
  try {
    const hit = rows_("bookings").find(x => str_(x.r[0]) === id && up_(x.r[4]) === code && str_(x.r[6]) !== "отменена");
    if (!hit) return { ok: false, error: "not_found" };
    const d = date_(hit.r[1]), t = time_(hit.r[2]);
    if (at_(d, t) - Date.now() < SETTINGS.CANCEL_HOURS * 36e5) return { ok: false, error: "too_late" };
    sh_("bookings").getRange(hit._row, 7).setValue("отменена");
    const evId = str_(hit.r[9]);
    if (evId) { try { const ev = CalendarApp.getDefaultCalendar().getEventById(evId); if (ev) ev.deleteEvent(); } catch (e) {} }
    SpreadsheetApp.flush();
    CacheService.getScriptCache().removeAll(TRACKS.map(x => "slots:" + x).concat(["slots:"]));
    notify_("отмена " + d + " " + t, str_(hit.r[5]) + " (" + code + ") отменил занятие " + d + " в " + t + " МСК");
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* ======================= оплаты ======================= */
function paid_(p) {
  const s = student_(p.code);
  const code = s ? s.code : up_(p.code), name = s ? s.name : str_(p.name);
  if (!code) return { ok: false, error: "no_code" };
  const stamp = Utilities.formatDate(new Date(), SETTINGS.TZ, "yyyy-MM-dd HH-mm");
  const url = p.receiptData ? saveFile_(SETTINGS.RECEIPTS_FOLDER, stamp + " " + code + " " + str_(p.amount) + "₽", p.receiptName, p.receiptType, p.receiptData) : "";
  add_("payments", [new Date(), code, name, str_(p.track || p.exam), str_(p.pkg), num_(p.amount), num_(p.lessons), "ждёт подтверждения", str_(p.note).slice(0, 500), url]);
  notify_("оплата " + str_(p.amount) + " ₽", name + " (" + code + ") отметил оплату: " + str_(p.pkg) + ", " + str_(p.amount) + " ₽" + (url ? "\nЧек: " + url : "\nБез чека") + (p.note ? "\nКомментарий: " + p.note : ""));
  return { ok: true, receipt: !!url };
}

/* ======================= домашка ======================= */
function homeworkFor_(code, track) {
  const subs = rows_("submissions").filter(x => up_(x.r[1]) === code);
  return rows_("homework").filter(x => {
    const codes = str_(x.r[1]).toUpperCase();
    const forMe = !codes || codes === "ВСЕ" || codes === "ALL" || codes.split(/[,;\s]+/).indexOf(code) >= 0;
    const tr = tracksOf_(x.r[2]);
    return str_(x.r[0]) && forMe && (!track || tr.indexOf(track) >= 0);
  }).map(x => {
    const id = str_(x.r[0]);
    let parts = []; try { parts = x.r[6] ? JSON.parse(x.r[6]) : []; } catch (e) {}
    const sub = subs.filter(y => str_(y.r[3]) === id).pop();
    const hw = { id, title: str_(x.r[3]), desc: str_(x.r[4]), due: x.r[5] ? date_(x.r[5]) : "", parts, link: str_(x.r[7]), from: x.r[8] ? date_(x.r[8]) : "", status: "новое" };
    if (sub) {
      hw.status = str_(sub.r[6]) || "на проверке";
      if (str_(sub.r[7])) hw.grade = str_(sub.r[7]);
      if (str_(sub.r[8])) hw.comment = str_(sub.r[8]);
      try { if (sub.r[9]) hw.review = JSON.parse(sub.r[9]); } catch (e) {}
    }
    return hw;
  });
}
function homework_(p) {
  const s = student_(p.code);
  if (!s) return { ok: false, error: "no_code" };
  const stamp = Utilities.formatDate(new Date(), SETTINGS.TZ, "yyyy-MM-dd HH-mm") + " " + s.code + " " + str_(p.hwId || p.hw);
  const files = [];
  if (p.fileData) files.push(saveFile_(SETTINGS.FILES_FOLDER, stamp, p.fileName, p.fileType, p.fileData));
  str_(p.fileUrls).split(/\n+/).filter(u => /^https:\/\//.test(u)).forEach(u => files.push(u));
  Object.keys(p).forEach(k => { const m = k.match(/^file_(.+)_data$/); if (m) files.push(saveFile_(SETTINGS.FILES_FOLDER, stamp + " " + m[1], p["file_" + m[1] + "_name"], p["file_" + m[1] + "_type"], p[k])); });
  add_("submissions", [new Date(), s.code, str_(p.exam || p.track), str_(p.hwId || p.hw), str_(p.parts || p.text || p.answer).slice(0, 45000), files.filter(Boolean).join("\n"), "на проверке", "", "", ""]);
  notify_("домашка " + str_(p.hwId || p.hw), s.name + " (" + s.code + ") сдал задание " + str_(p.hwId || p.hw) + (files.length ? "\nФайлы:\n" + files.join("\n") : ""));
  return { ok: true };
}

/* ======================= состояние кабинета (черновики, настройки) ======================= */
function getState_(code, track) {
  const hit = rows_("state").find(x => up_(x.r[0]) === code && str_(x.r[1]) === (track || ""));
  if (!hit) return null;
  try { return JSON.parse(hit.r[2]); } catch (e) { return null; }
}
function saveState_(p) {
  const s = student_(p.code);
  if (!s) return { ok: false, error: "no_code" };
  const track = str_(p.exam || p.track).toLowerCase(), data = str_(p.data);
  if (!data || data.length > 49000) return { ok: false, error: "too_big" };
  try { JSON.parse(data); } catch (e) { return { ok: false, error: "bad_request" }; }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try {
    const hit = rows_("state").find(x => up_(x.r[0]) === s.code && str_(x.r[1]) === track);
    if (hit) sh_("state").getRange(hit._row, 3, 1, 2).setValues([[data, new Date()]]);
    else add_("state", [s.code, track, data, new Date()]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* ======================= результаты и заявки ======================= */
function result_(p) {
  const s = student_(p.code);
  if (!s) return { ok: false, error: "no_code" };
  let a = {}; try { a = JSON.parse(p.payload); } catch (e) { return { ok: false, error: "bad_request" }; }
  if (rows_("results").some(x => str_(x.r[8]) === str_(a.id))) return { ok: true, dup: true };
  add_("results", [new Date(), s.code, str_(a.exam || p.exam), str_(a.title), str_(a.section), a.score, "", "", str_(a.id), JSON.stringify(a).slice(0, 45000)]);
  return { ok: true };
}
function mathAttempt_(p) {
  add_("math", [new Date(), up_(p.code), str_(p.topic), str_(p.level), num_(p.correct), num_(p.total), JSON.stringify(p).slice(0, 45000)]);
  return { ok: true };
}
function lead_(p) {
  add_("leads", [new Date(), str_(p.name), str_(p.contact), str_(p.service), str_(p.route), str_(p.message || p.comment), str_(p.source), JSON.stringify(p).slice(0, 45000)]);
  notify_("новая заявка", "Имя: " + str_(p.name) + "\nКонтакт: " + str_(p.contact) + "\nУслуга: " + str_(p.service) + "\nМаршрут: " + str_(p.route) + "\n" + str_(p.message || p.comment));
  return { ok: true };
}

/* ======================= кабинет учителя ======================= */
/** Один раз запусти в редакторе: создаёт пароль учителя и пишет его в журнал выполнения. */
function initAdmin() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("ADMIN_HASH")) { Logger.log("Пароль учителя уже задан. Чтобы сбросить, запусти resetAdminPassword."); return "exists"; }
  return resetAdminPassword();
}
function resetAdminPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  let pass = ""; const raw = randHex_(40);
  for (let i = 0; i < 12; i++) pass += abc[parseInt(raw.substr(i * 2, 2), 16) % abc.length];
  pass = pass.slice(0, 4) + "-" + pass.slice(4, 8) + "-" + pass.slice(8);
  setAdminPass_(pass);
  Logger.log("Пароль учителя: " + pass);
  return pass;
}
function setAdminPass_(pass) {
  const salt = randHex_(24), props = PropertiesService.getScriptProperties();
  props.setProperty("ADMIN_SALT", salt); props.setProperty("ADMIN_HASH", hashPass_(pass, salt));
}
function adminAuth_(p) {
  const props = PropertiesService.getScriptProperties(), hash = props.getProperty("ADMIN_HASH");
  if (!hash) return { ok: false, error: "no_admin" };
  if (fails_(ADMIN) >= SETTINGS.MAX_FAILS) return { ok: false, error: "locked" };
  if (hashPass_(str_(p.password), props.getProperty("ADMIN_SALT")) !== hash) { const n = fails_(ADMIN, true); return { ok: false, error: n >= SETTINGS.MAX_FAILS ? "locked" : "wrong_password", left: Math.max(0, SETTINGS.MAX_FAILS - n) }; }
  fails_(ADMIN, "reset");
  return { ok: true, token: newSession_(ADMIN) };
}
function admin_(action, p) {
  switch (action) {
    case "admin_overview": return adminOverview_();
    case "admin_students": return { ok: true, students: adminStudents_() };
    case "admin_student_save": return adminStudentSave_(p);
    case "admin_hw_list": return adminHwList_();
    case "admin_hw_save": return adminHwSave_(p);
    case "admin_hw_delete": return adminDelete_("homework", 0, p.id);
    case "admin_subs": return adminSubs_();
    case "admin_sub_review": return adminSubReview_(p);
    case "admin_payments": return adminPayments_();
    case "admin_payment_set": return adminPaymentSet_(p);
    case "admin_bookings": return adminBookings_();
    case "admin_booking_cancel": return adminBookingCancel_(p);
    case "admin_games": return { ok: true, games: gamesAll_() };
    case "admin_game_save": return adminGameSave_(p);
    case "admin_game_get": return adminGameGet_(p);
    case "admin_game_delete": return adminGameDelete_(p);
    case "admin_password": return adminPassword_(p);
    case "admin_logout": return logout_(p);
    default: return { ok: false, error: "unknown_action" };
  }
}
const iso_ = v => v instanceof Date ? v.toISOString() : (v ? new Date(v).toISOString() : "");
function month_(v) { return v ? date_(new Date(v)).slice(0, 7) : ""; }
function bookingsAll_() {
  return rows_("bookings").map(x => ({ row: x._row, id: str_(x.r[0]), d: date_(x.r[1]), t: time_(x.r[2]), track: str_(x.r[3]), code: up_(x.r[4]), name: str_(x.r[5]), status: str_(x.r[6]) || "активна", comment: str_(x.r[7]), created: iso_(x.r[8]) }))
    .filter(b => b.id && b.d && b.t);
}
function paymentsAll_() {
  return rows_("payments").map(x => ({ row: x._row, date: iso_(x.r[0]), code: up_(x.r[1]), name: str_(x.r[2]), track: str_(x.r[3]), pkg: str_(x.r[4]), amount: num_(x.r[5]) || 0, lessons: num_(x.r[6]) || 0, status: str_(x.r[7]) || "ждёт подтверждения", note: str_(x.r[8]), receipt: str_(x.r[9]) }))
    .filter(x => x.code || x.amount);
}
function adminOverview_() {
  const now = Date.now(), thisMonth = month_(new Date()), b = bookingsAll_().filter(x => x.status !== "отменена");
  const upcoming = b.filter(x => at_(x.d, x.t) > now).sort((x, y) => at_(x.d, x.t) - at_(y.d, y.t));
  const week = upcoming.filter(x => at_(x.d, x.t) < now + 7 * 864e5).length;
  const doneMonth = b.filter(x => at_(x.d, x.t) <= now && x.d.slice(0, 7) === thisMonth).length;
  const pays = paymentsAll_();
  const pending = pays.filter(x => x.status === "ждёт подтверждения");
  const ok = pays.filter(x => x.status === "подтверждено");
  const byMonth = {}; ok.forEach(x => { const m = month_(x.date); byMonth[m] = (byMonth[m] || 0) + x.amount; });
  const subs = rows_("submissions").filter(x => str_(x.r[6]) === "на проверке").length;
  const weekAgo = now - 7 * 864e5;
  const leads = rows_("leads").map(x => ({ date: iso_(x.r[0]), name: str_(x.r[1]), contact: str_(x.r[2]), service: str_(x.r[3]), message: str_(x.r[5]) })).filter(x => x.date).reverse();
  return { ok: true, students: rows_("students").filter(x => str_(x.r[0])).length,
    lessons: { upcoming: upcoming.length, week, doneMonth, next: upcoming.slice(0, 8) },
    payments: { pendingCount: pending.length, pendingSum: pending.reduce((a, x) => a + x.amount, 0), monthSum: byMonth[thisMonth] || 0, totalSum: ok.reduce((a, x) => a + x.amount, 0), byMonth },
    toCheck: subs, leads: { week: leads.filter(x => new Date(x.date).getTime() > weekAgo).length, last: leads.slice(0, 5) } };
}
function adminStudents_() {
  const now = Date.now(), res = rows_("results"), subs = rows_("submissions"), b = bookingsAll_().filter(x => x.status !== "отменена"), pays = paymentsAll_(), acc = rows_("access"), hw = rows_("homework"), mth = rows_("math");
  return rows_("students").filter(x => str_(x.r[0])).map(x => {
    const s = student_(x.r[0]); if (!s) return null;
    const mine = res.filter(r => up_(r.r[1]) === s.code);
    const last = {}; mine.forEach(r => { last[str_(r.r[2]) + ":" + str_(r.r[4])] = num_(r.r[6] !== "" ? r.r[6] : r.r[5]); });
    const lastScore = {}; Object.keys(last).forEach(k => { const [ex, sec] = k.split(":"); (lastScore[ex] = lastScore[ex] || {})[sec] = last[k]; });
    const assigned = hw.filter(h => { const codes = str_(h.r[1]).toUpperCase(); return str_(h.r[0]) && (!codes || codes === "ВСЕ" || codes === "ALL" || codes.split(/[,;\s]+/).indexOf(s.code) >= 0); }).length;
    const ms = subs.filter(r => up_(r.r[1]) === s.code);
    const sb = b.filter(r => r.code === s.code);
    const next = sb.filter(r => at_(r.d, r.t) > now).sort((p, q) => at_(p.d, p.t) - at_(q.d, q.t))[0];
    const acts = mine.map(r => new Date(r.r[0]).getTime()).concat(ms.map(r => new Date(r.r[0]).getTime()), mth.filter(r => up_(r.r[1]) === s.code).map(r => new Date(r.r[0]).getTime())).filter(Boolean);
    return { code: s.code, name: s.name, tracks: s.tracks, targets: s.targets, goal: s.goal, examDate: s.examDate, note: s.note, balance: s.balance,
      hasPassword: acc.some(a => up_(a.r[0]) === s.code), tests: mine.length, mathRuns: mth.filter(r => up_(r.r[1]) === s.code).length, lastScore,
      hw: { assigned, submitted: ms.length, review: ms.filter(r => str_(r.r[6]) === "на проверке").length },
      lessons: { done: sb.filter(r => at_(r.d, r.t) <= now).length, upcoming: sb.filter(r => at_(r.d, r.t) > now).length },
      next: next ? next.d + " " + next.t : "", paid: pays.filter(p => p.code === s.code && p.status === "подтверждено").reduce((a, p) => a + p.amount, 0),
      lastActive: acts.length ? new Date(Math.max.apply(null, acts)).toISOString() : "" };
  }).filter(Boolean);
}
function adminStudentSave_(p) {
  const code = up_(p.code).replace(/[^A-ZА-ЯЁ0-9-]/g, "");
  if (code.length < 3) return { ok: false, error: "bad_code" };
  const tracks = tracksOf_(p.tracks); if (!tracks.length) return { ok: false, error: "no_tracks" };
  const row = [code, str_(p.name) || "Ученик", tracks.join(", "), num_(p.ielts) == null ? "" : num_(p.ielts), num_(p.toefl) == null ? "" : num_(p.toefl), str_(p.goal), str_(p.examDate), str_(p.note), num_(p.balance) == null ? "" : num_(p.balance)];
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try {
    const hit = rows_("students").find(x => up_(x.r[0]) === code);
    if (hit) { if (p.create === "1") return { ok: false, error: "exists" }; sh_("students").getRange(hit._row, 1, 1, row.length).setValues([row]); }
    else add_("students", row.concat(["", ""]));
    CacheService.getScriptCache().removeAll(TRACKS.map(x => "slots:" + x));
    return { ok: true, code };
  } finally { lock.releaseLock(); }
}
function adminHwList_() {
  const subs = rows_("submissions");
  return { ok: true, homework: rows_("homework").filter(x => str_(x.r[0])).map(x => {
    let parts = []; try { parts = x.r[6] ? JSON.parse(x.r[6]) : []; } catch (e) {}
    const id = str_(x.r[0]), ss = subs.filter(y => str_(y.r[3]) === id);
    return { id, codes: str_(x.r[1]), track: str_(x.r[2]), title: str_(x.r[3]), desc: str_(x.r[4]), due: x.r[5] ? date_(x.r[5]) : "", parts, link: str_(x.r[7]), from: x.r[8] ? date_(x.r[8]) : "", submitted: ss.length, review: ss.filter(y => str_(y.r[6]) === "на проверке").length };
  }).reverse() };
}
function adminHwSave_(p) {
  const title = str_(p.title); if (!title) return { ok: false, error: "no_title" };
  const tracks = tracksOf_(p.track); if (!tracks.length) return { ok: false, error: "no_tracks" };
  let parts = []; try { parts = p.parts ? JSON.parse(p.parts) : []; } catch (e) { return { ok: false, error: "bad_parts" }; }
  if (!Array.isArray(parts)) return { ok: false, error: "bad_parts" };
  const codes = str_(p.codes).toUpperCase().split(/[,;\s]+/).filter(Boolean).join(", ") || "ВСЕ";
  const id = str_(p.id) || ("hw" + Date.now().toString(36));
  const row = [id, codes, tracks.join(", "), title, str_(p.desc).slice(0, 5000), str_(p.due), JSON.stringify(parts).slice(0, 45000), str_(p.link), str_(p.from) || Utilities.formatDate(new Date(), SETTINGS.TZ, "yyyy-MM-dd")];
  const hit = str_(p.id) ? rows_("homework").find(x => str_(x.r[0]) === id) : null;
  if (hit) sh_("homework").getRange(hit._row, 1, 1, row.length).setValues([row]); else add_("homework", row);
  return { ok: true, id };
}
function adminDelete_(k, col, id) {
  id = str_(id); if (!id) return { ok: false, error: "bad_request" };
  const hit = rows_(k).find(x => str_(x.r[col]) === id);
  if (!hit) return { ok: false, error: "not_found" };
  sh_(k).deleteRow(hit._row);
  return { ok: true };
}
function adminSubs_() {
  const names = {}; rows_("students").forEach(x => { names[up_(x.r[0])] = str_(x.r[1]); });
  const titles = {}, ptitles = {};
  rows_("homework").forEach(x => { const id = str_(x.r[0]); titles[id] = str_(x.r[3]); try { const pt = {}; (JSON.parse(x.r[6] || "[]") || []).forEach((q, i) => { pt[q.id || "p" + (i + 1)] = q.title || ""; }); ptitles[id] = pt; } catch (e) {} });
  return { ok: true, subs: rows_("submissions").map(x => ({ row: x._row, date: iso_(x.r[0]), code: up_(x.r[1]), name: names[up_(x.r[1])] || "", track: str_(x.r[2]), hwId: str_(x.r[3]), title: titles[str_(x.r[3])] || str_(x.r[3]), partTitles: ptitles[str_(x.r[3])] || {}, answers: str_(x.r[4]).slice(0, 20000), files: str_(x.r[5]).split("\n").filter(Boolean), status: str_(x.r[6]) || "на проверке", grade: str_(x.r[7]), comment: str_(x.r[8]) })).reverse().slice(0, 300) };
}
function adminSubReview_(p) {
  const row = parseInt(p.row, 10), sh = sh_("submissions");
  if (!(row >= 2 && row <= sh.getLastRow())) return { ok: false, error: "not_found" };
  const r = sh.getRange(row, 1, 1, 10).getValues()[0];
  if (up_(r[1]) !== up_(p.code) || str_(r[3]) !== str_(p.hwId)) return { ok: false, error: "changed" };
  const status = ["проверено", "доработать", "на проверке"].indexOf(str_(p.status)) >= 0 ? str_(p.status) : "проверено";
  sh.getRange(row, 7, 1, 3).setValues([[status, str_(p.grade).slice(0, 40), str_(p.comment).slice(0, 5000)]]);
  return { ok: true };
}
function adminPayments_() { return { ok: true, payments: paymentsAll_().reverse() }; }
function adminPaymentSet_(p) {
  const row = parseInt(p.row, 10), sh = sh_("payments");
  if (!(row >= 2 && row <= sh.getLastRow())) return { ok: false, error: "not_found" };
  const status = ["подтверждено", "отклонено", "ждёт подтверждения"].indexOf(str_(p.status)) >= 0 ? str_(p.status) : "";
  if (!status) return { ok: false, error: "bad_request" };
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try {
    const r = sh.getRange(row, 1, 1, 10).getValues()[0];
    const before = str_(r[7]) || "ждёт подтверждения", lessons = num_(r[6]) || 0;
    sh.getRange(row, 8).setValue(status);
    // при подтверждении занятия из пакета добавляются на баланс ученика, при отмене подтверждения списываются
    const delta = (status === "подтверждено" ? 1 : 0) - (before === "подтверждено" ? 1 : 0);
    let balance = null;
    if (delta && lessons) { const s = student_(r[1]); if (s) { balance = (s.balance || 0) + delta * lessons; sh_("students").getRange(s.row, 9).setValue(balance); } }
    return { ok: true, balance };
  } finally { lock.releaseLock(); }
}
function adminBookings_() {
  const from = Date.now() - 45 * 864e5;
  return { ok: true, bookings: bookingsAll_().filter(b => at_(b.d, b.t) > from).sort((a, b) => at_(a.d, a.t) - at_(b.d, b.t)) };
}
function adminBookingCancel_(p) {
  const id = str_(p.id), lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: "busy" };
  try {
    const hit = rows_("bookings").find(x => str_(x.r[0]) === id && str_(x.r[6]) !== "отменена");
    if (!hit) return { ok: false, error: "not_found" };
    sh_("bookings").getRange(hit._row, 7).setValue("отменена");
    const evId = str_(hit.r[9]);
    if (evId) { try { const ev = CalendarApp.getDefaultCalendar().getEventById(evId); if (ev) ev.deleteEvent(); } catch (e) {} }
    SpreadsheetApp.flush();
    CacheService.getScriptCache().removeAll(TRACKS.map(x => "slots:" + x).concat(["slots:"]));
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function adminPassword_(p) {
  const props = PropertiesService.getScriptProperties();
  if (hashPass_(str_(p.old), props.getProperty("ADMIN_SALT")) !== props.getProperty("ADMIN_HASH")) return { ok: false, error: "wrong_password" };
  const pass = str_(p.password); if (pass.length < 8) return { ok: false, error: "weak_password" };
  setAdminPass_(pass); return { ok: true };
}

/* ======================= игры (HTML-файлы на Диске) ======================= */
const GAMES_FOLDER = "Mr.Sam · игры";
function gamesAll_() {
  return rows_("games").filter(x => str_(x.r[0])).map(x => ({ id: str_(x.r[0]), title: str_(x.r[1]), subject: str_(x.r[2]), tracks: tracksOf_(x.r[3]), desc: str_(x.r[4]), size: num_(x.r[6]) || 0, added: iso_(x.r[7]), visible: str_(x.r[8]).toLowerCase() !== "нет" })).reverse();
}
function gamesFor_(me, p) {
  const track = str_(p.track || p.exam).toLowerCase();
  return { ok: true, games: gamesAll_().filter(g => g.visible && (!track || g.tracks.indexOf(track) >= 0) && g.tracks.some(t => me.tracks.indexOf(t) >= 0)).map(g => ({ id: g.id, title: g.title, subject: g.subject, desc: g.desc, added: g.added })) };
}
function gameFile_(id) {
  const hit = rows_("games").find(x => str_(x.r[0]) === str_(id));
  return hit ? { hit, file: DriveApp.getFileById(str_(hit.r[5])) } : null;
}
function gameHtml_(me, p) {
  const g = gamesAll_().find(x => x.id === str_(p.id));
  if (!g || !g.visible || !g.tracks.some(t => me.tracks.indexOf(t) >= 0)) return { ok: false, error: "not_found" };
  const f = gameFile_(g.id);
  return { ok: true, title: g.title, html: f.file.getBlob().getDataAsString("UTF-8") };
}
function adminGameGet_(p) {
  const f = gameFile_(p.id); if (!f) return { ok: false, error: "not_found" };
  return { ok: true, html: f.file.getBlob().getDataAsString("UTF-8") };
}
function adminGameSave_(p) {
  const title = str_(p.title); if (!title) return { ok: false, error: "no_title" };
  const tracks = tracksOf_(p.tracks); if (!tracks.length) return { ok: false, error: "no_tracks" };
  const html = p.html == null ? null : String(p.html);
  if (html != null && html.length > 4 * 1024 * 1024) return { ok: false, error: "too_big" };
  if (html != null && !/<(html|body|script|div|canvas|svg)/i.test(html)) return { ok: false, error: "not_html" };
  const id = str_(p.id) || ("g" + Date.now().toString(36));
  const hit = str_(p.id) ? rows_("games").find(x => str_(x.r[0]) === id) : null;
  let fileId = hit ? str_(hit.r[5]) : "", size = hit ? num_(hit.r[6]) : 0;
  if (html != null) {
    if (fileId) DriveApp.getFileById(fileId).setContent(html);
    else fileId = folder_(GAMES_FOLDER).createFile(Utilities.newBlob(html, "text/html", id + " " + title + ".html")).getId();
    size = Math.round(html.length / 1024);
  }
  if (!fileId) return { ok: false, error: "no_file" };
  const row = [id, title, str_(p.subject), tracks.join(", "), str_(p.desc).slice(0, 1000), fileId, size, hit ? hit.r[7] : new Date(), p.visible === "0" ? "нет" : "да"];
  if (hit) sh_("games").getRange(hit._row, 1, 1, row.length).setValues([row]); else add_("games", row);
  return { ok: true, id };
}
function adminGameDelete_(p) {
  const f = gameFile_(p.id); if (!f) return { ok: false, error: "not_found" };
  try { f.file.setTrashed(true); } catch (e) {}
  sh_("games").deleteRow(f.hit._row);
  return { ok: true };
}
