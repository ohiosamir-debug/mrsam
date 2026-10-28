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
 *
 * Направления. У ученика один код, один пароль и один профиль, а курсы выдаются отдельно, столбец «Кабинеты» на листе «Ученики»:
 *   math (математика), english (английский язык), mathen (математика на английском), ielts, toefl.
 *   Пишутся через запятую, можно по-русски: «математика, английский, математика на английском». «все» = все пять.
 *   Пустая ячейка = ни одного направления. Каждое включается отдельно: math не открывает mathen, english не открывает IELTS и TOEFL.
 *   Сервер проверяет направление в каждом запросе ученика: к чужому курсу кабинет получает отказ no_access.
 * Родители. Лист «Родители»: код родителя, имя и дети в виде «ALEX-7: ielts, english; MAX-12: math».
 *   Родитель входит своим кодом и паролем на странице кабинетов и только смотрит: видит направления ребёнка из этого списка,
 *   и только те, что выданы самому ребёнку. Без двоеточия («ALEX-7») = все направления ребёнка.
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
  students: ["Ученики", ["Код", "Имя", "Кабинеты", "Цель IELTS", "Цель TOEFL", "Куда поступает", "Дата экзамена", "Заметка", "Баланс занятий", "Цвет", "Аватар", "Цена занятия"]],
  schedule: ["Расписание", ["День недели", "Время", "Кабинеты"]],
  closed: ["Закрытые дни", ["Дата", "Время", "Комментарий"]],
  bookings: ["Записи", ["ID", "Дата", "Время", "Кабинет", "Код", "Имя", "Статус", "Комментарий", "Создано", "Событие"]],
  payments: ["Оплаты", ["Дата", "Код", "Имя", "Кабинет", "Пакет", "Сумма", "Занятий", "Статус", "Комментарий", "Чек"]],
  homework: ["Домашка", ["ID", "Коды", "Кабинет", "Название", "Описание", "Срок", "Шаги (JSON)", "Ссылка", "Начало"]],
  submissions: ["Сдачи", ["Дата", "Код", "Кабинет", "ID задания", "Ответы (JSON)", "Файлы", "Статус", "Оценка", "Комментарий", "Отзыв по шагам (JSON)"]],
  results: ["Результаты", ["Дата", "Код", "Кабинет", "Тест", "Раздел", "Балл", "Оценка Самира", "Комментарий Самира", "ID", "JSON"]],
  math: ["Математика", ["Дата", "Код", "Тема", "Уровень", "Верно", "Всего", "JSON", "Направление"]],
  leads: ["Заявки", ["Дата", "Имя", "Контакт", "Услуга", "Маршрут", "Сообщение", "Источник", "Все поля (JSON)"]],
  state: ["Состояние", ["Код", "Кабинет", "Данные (JSON)", "Обновлено"]],
  access: ["Доступ", ["Код", "Хеш пароля", "Соль", "Обновлён"]],
  sessions: ["Сессии", ["Токен (хеш)", "Код", "Создан", "Истекает", "Версия"]],
  games: ["Игры", ["ID", "Название", "Предмет", "Кабинеты", "Описание", "Файл", "Размер, КБ", "Добавлено", "Показывать", "Тема", "Навык", "Уровни (JSON)"]],
  mprof: ["Мат-профили", ["Код", "Уровень", "Цель", "Темы", "Уровни тем (JSON)", "Авторекомендации", "Рекомендация (JSON)", "Обновлено", "Направление"]],
  assign: ["Назначения", ["ID", "Код", "Тип", "Название", "Параметры (JSON)", "Срок", "Создано", "Статус", "Результат (JSON)", "Обновлено", "Направление"]],
  answers: ["Ответы", ["Дата", "Код", "Источник", "Ссылка", "Тема", "Навык", "Шаблон", "Сложность", "Ошибка", "Задание", "Верный ответ", "Ответ ученика", "Верно", "Попыток", "Подсказка", "Ловушка", "Секунд", "ID", "Закрывает", "Направление"]],
  parents: ["Родители", ["Код", "Имя", "Дети", "Обновлено"]]
};
const ADMIN = "__ADMIN__";
/** направления (курсы): каждое выдаётся ученику отдельно */
const TRACKS = ["math", "english", "mathen", "ielts", "toefl"];
const TRACK_NAMES = { math: "Математика", english: "Английский язык", mathen: "Математика на английском", ielts: "IELTS", toefl: "TOEFL" };
const MATH_DIRS = ["math", "mathen"];   // у каждого свой план, ответы, назначения и прогресс
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
    if (me.parent) {                      // родитель только смотрит
      switch (action) {
        case "parent_me": return out_(parentMe_(me));
        case "change_password": return out_(changePassword_(p, me));
        case "logout": return out_(logout_(p));
        default: return out_({ ok: false, error: "parent" });
      }
    }
    // направление: одно значение из dir / track / exam, и только из выданных ученику
    const dir = dirOf_(p, MATH_ROUTES[action] ? "math" : "");
    if (dir == null) return out_({ ok: false, error: "bad_request" });
    if (dir && me.tracks.indexOf(dir) < 0) return out_({ ok: false, error: "no_access", tracks: me.tracks });
    if (!dir && DIR_NEED[action]) return out_({ ok: false, error: "bad_request" });
    if (MATH_ROUTES[action] && MATH_DIRS.indexOf(dir) < 0) return out_({ ok: false, error: "bad_request" });
    p.dir = p.track = p.exam = dir;
    switch (action) {
      case "login": case "me": return out_(login_(p));
      case "slots": return out_(slots_(p, me.tracks));
      case "state_get": return out_({ ok: true, state: getState_(me.code, dir) });
      case "state": return out_(saveState_(p));
      case "book": return out_(book_(p));
      case "cancel": return out_(cancel_(p, me.tracks));
      case "paid": return out_(paid_(p));
      case "result": return out_(result_(p));
      case "homework": case "math_hw": return out_(homework_(p));
      case "upload": return out_(upload_(p));
      case "math_attempt": return out_(mathAttempt_(p));
      case "change_password": return out_(changePassword_(p, me));
      case "logout": return out_(logout_(p));
      case "games": return out_(gamesFor_(me, p));
      case "math_me": return out_(mathMe_(me, dir));
      case "math_answers": return out_(mathAnswers_(me, p));
      case "assign_start": return out_(assignSet_(me, p, false));
      case "assign_done": return out_(assignSet_(me, p, true));
      case "math_level": return out_(mathLevel_(me, p));
      case "game": return out_(gameHtml_(me, p));
      case "hw_file": return out_(hwFile_(me, p));
      default: return out_({ ok: false, error: "unknown_action" });
    }
  } catch (err) { return out_({ ok: false, error: "server", message: String(err) }); }
}
/** маршруты, которым нужно направление; у математики по умолчанию обычная математика */
const DIR_NEED = { state: 1, state_get: 1, book: 1, paid: 1, result: 1, homework: 1, games: 1 };
const MATH_ROUTES = { math_attempt: 1, math_hw: 1, math_me: 1, math_answers: 1, assign_start: 1, assign_done: 1, math_level: 1 };
/** одно направление из dir, track и exam; разные значения в одном запросе или неизвестное направление = null */
function dirOf_(p, def) {
  const vals = [p.dir, p.track, p.exam].map(v => str_(v).toLowerCase()).filter(Boolean);
  const uniq = vals.filter((v, i) => vals.indexOf(v) === i);
  if (uniq.length > 1) return null;
  const d = uniq[0] || def || "";
  return !d || TRACKS.indexOf(d) >= 0 ? d : null;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ======================= помощники таблицы ======================= */
function ss_() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID")); }
const HEAD_OK_ = {};
function sh_(k) {
  const ss = ss_(); let sh = ss.getSheetByName(SHEETS[k][0]); const head = SHEETS[k][1];
  if (!sh) { sh = ss.insertSheet(SHEETS[k][0]); sh.appendRow(head); sh.setFrozenRows(1); sh.getRange(1, 1, 1, head.length).setFontWeight("bold").setBackground("#D5F36A"); HEAD_OK_[k] = 1; }
  else if (!HEAD_OK_[k]) {
    HEAD_OK_[k] = 1;   // новые столбцы у старых листов: дописываем заголовки
    const n = sh.getLastColumn();
    if (n < head.length && sh.getLastRow() >= 1) sh.getRange(1, n + 1, 1, head.length - n).setValues([head.slice(n)]).setFontWeight("bold").setBackground("#D5F36A");
  }
  return sh;
}
/** последние n строк листа (быстрее, чем читать весь лист) */
function tail_(k, n) {
  const sh = sh_(k), last = sh.getLastRow();
  if (last < 2) return [];
  const from = Math.max(2, last - n + 1), head = SHEETS[k][1];
  return sh.getRange(from, 1, last - from + 1, head.length).getValues().map((r, i) => ({ _row: from + i, r }));
}
function json_(v, def) { try { const x = JSON.parse(str_(v)); return x == null ? def : x; } catch (e) { return def; } }
function rows_(k) {
  const sh = sh_(k), n = sh.getLastRow();
  if (n < 2) return [];
  const head = SHEETS[k][1];
  return sh.getRange(2, 1, n - 1, head.length).getValues().map((r, i) => ({ _row: i + 2, r }));
}
/** текст от учеников и с сайта не должен стать формулой в таблице: «=…», «+…», «-…», «@…» пишем как текст */
function safe_(v) { return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v; }
/** то же для текстовых столбцов: отрицательные числа («-5», «-3/4») оставляем как есть */
function txt_(v) { return typeof v === "string" && /^[=+\-@]/.test(v) && !/^-\d+([.,]\d+)?(\/\d+)?%?$/.test(v) ? "'" + v : v; }
function add_(k, arr) { sh_(k).appendRow(arr.map(safe_)); }
/** свободный текст (оценка, комментарий): всегда записываем как текст, иначе таблица с русской локалью превращает «5.3» в дату 5 марта, а «7,5» в число */
function text_(v) { const s = str_(v); return s ? "'" + s : ""; }
/** чтение такого текста: старые ячейки, которые таблица уже превратила в дату, показываем как их набрали («5.3») */
function cellTxt_(v) { return v instanceof Date ? Utilities.formatDate(v, SETTINGS.TZ, "d.M") : str_(v); }
const str_ = v => v == null ? "" : String(v).trim();
const up_ = v => str_(v).toUpperCase();
/** «ielts, математика на английском» → ["mathen", "ielts"]. Пустая ячейка = empty (по умолчанию все: для расписания, домашки, игр) */
const TRACK_WORDS_ = { math: "math", maths: "math", "математика": "math", mathen: "mathen", "math-en": "mathen", "math_en": "mathen", english: "english", eng: "english", "английский": "english", "англ": "english", ielts: "ielts", toefl: "toefl" };
function tracksOf_(v, empty) {
  let s = str_(v).toLowerCase();
  if (!s) return (empty || TRACKS).slice();
  if (s === "все" || s === "all") return TRACKS.slice();
  s = s.replace(/математика\s+на\s+английском(\s+языке)?|maths?\s+in\s+english/g, " mathen ").replace(/английский\s+язык/g, " english ");   // «english math» через пробел = два курса, как раньше «ielts toefl»
  const got = {}; s.split(/[,;\/\s]+/).forEach(w => { if (TRACK_WORDS_[w]) got[TRACK_WORDS_[w]] = 1; });
  return TRACKS.filter(t => got[t]);
}
function date_(v) { if (v instanceof Date) return Utilities.formatDate(v, SETTINGS.TZ, "yyyy-MM-dd"); const s = str_(v); const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2) : s.slice(0, 10); }
function time_(v) { if (v instanceof Date) return Utilities.formatDate(v, SETTINGS.TZ, "HH:mm"); const m = str_(v).match(/^(\d{1,2})[:.](\d{2})/); return m ? ("0" + m[1]).slice(-2) + ":" + m[2] : ""; }
function at_(d, t) { return new Date(d + "T" + t + ":00+03:00").getTime(); }
function student_(code) {
  const c = up_(code); if (!c || c === ADMIN) return null;
  const hit = rows_("students").find(x => up_(x.r[0]) === c);
  if (!hit) return null;
  const r = hit.r;
  return { row: hit._row, code: c, name: str_(r[1]) || "Ученик", tracks: tracksOf_(r[2], []), targets: { ielts: num_(r[3]), toefl: num_(r[4]) }, goal: str_(r[5]), examDate: r[6] ? date_(r[6]) : "", note: str_(r[7]), balance: r[8] === "" ? null : num_(r[8]), theme: str_(r[9]), avatar: str_(r[10]), price: num_(r[11]) > 0 ? num_(r[11]) : null };
}
/** «ALEX-7: ielts, english; MAX-12» → [{ code, dirs }], dirs = null: все направления ребёнка */
function parentKids_(v) {
  const out = [];
  str_(v).split(/[;\n]+/).forEach(part => {
    // «A: ielts, B: math» без точки с запятой: новая пара начинается с «КОД:»
    part.split(/,(?=\s*[^,:\s]+\s*:)/).forEach(x => {
      const i = x.indexOf(":");
      if (i < 0) { x.split(/[,\s]+/).forEach(c => { c = up_(c); if (c) out.push({ code: c, dirs: null }); }); return; }
      const code = up_(x.slice(0, i)).replace(/\s+/g, "");
      if (code) out.push({ code, dirs: tracksOf_(x.slice(i + 1), []) });
    });
  });
  const seen = {};   // один ребёнок один раз
  return out.filter(k => k.code !== ADMIN && !seen[k.code] && (seen[k.code] = 1));
}
function parentRow_(code) { const c = up_(code); return c && c !== ADMIN ? rows_("parents").find(x => up_(x.r[0]) === c) || null : null; }
function parent_(code) {
  const hit = parentRow_(code); if (!hit) return null;
  return { row: hit._row, parent: true, code: up_(hit.r[0]), name: str_(hit.r[1]) || "Родитель", kids: parentKids_(hit.r[2]), tracks: [] };
}
/** что родитель видит у ребёнка: из его списка и только выданное самому ребёнку */
function kidDirs_(kid, s) { return kid.dirs ? s.tracks.filter(t => kid.dirs.indexOf(t) >= 0) : s.tracks.slice(); }
/** у старых строк домашки и игр пустой «Кабинет» значил «все три»: новые курсы так не открываются */
const LEGACY_ALL = ["math", "ielts", "toefl"];
function kidsText_(kids) { return kids.map(k => k.code + (k.dirs ? ": " + k.dirs.join(", ") : "")).join("; "); }
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
/** ученик или родитель по коду; кабинет курса (exam/track) пускает только ученика с этим направлением */
function account_(p) {
  const s = student_(p.code) || parent_(p.code);
  if (!s) return { error: "no_code" };
  const track = str_(p.exam || p.track).toLowerCase();
  if (s.parent && track) return { error: "parent" };
  if (!s.parent && track && s.tracks.indexOf(track) < 0) return { error: "no_access" };
  return { s };
}
function check_(p) {
  const a = account_(Object.assign({}, p, { exam: "", track: "" })), parentOnCourse = a.s && a.s.parent && str_(p.exam || p.track);
  if (a.error) return { ok: false, error: a.error };
  if (parentOnCourse) return { ok: false, error: "parent" };
  return { ok: true, name: a.s.name, role: a.s.parent ? "parent" : "student", hasPassword: !!accessRow_(a.s.code) };
}
function fails_(code, add) {
  const c = CacheService.getScriptCache(), k = "fail:" + code;
  let n = parseInt(c.get(k) || "0", 10);
  if (add === "reset") { c.remove(k); return 0; }
  if (add) { n++; c.put(k, String(n), 900); }
  return n;
}
/** версия пароля: меняется при новом пароле и пропадает, если строку в «Доступ» удалили (сброс). Старые сессии с другой версией не работают */
function ver_(code) {
  const cache = CacheService.getScriptCache(), k = "acv:" + code;
  let v = cache.get(k);
  if (v == null) {
    if (code === ADMIN) v = sha_("admin:" + (PropertiesService.getScriptProperties().getProperty("ADMIN_SALT") || "")).slice(0, 16);
    else { const row = accessRow_(code); v = row ? sha_(str_(row.r[2]) + ":" + str_(row.r[1])).slice(0, 16) : "-"; }
    cache.put(k, v, 120);
  }
  return v === "-" ? "" : v;
}
function dropVer_(code) { CacheService.getScriptCache().remove("acv:" + code); }
function newSession_(code) {
  const token = randHex_(48);
  const now = new Date(), exp = new Date(now.getTime() + SETTINGS.SESSION_DAYS * 864e5);
  dropVer_(code);
  add_("sessions", [sha_(token), code, now, exp, ver_(code)]);
  return token;
}
function who_(token) {
  token = str_(token); if (token.length < 32) return null;
  const th = sha_(token), cache = CacheService.getScriptCache();
  let ses = json_(cache.get("tok:" + th), null);
  if (!ses || !ses.c) {
    const hit = rows_("sessions").find(x => str_(x.r[0]) === th);
    if (!hit) return null;
    ses = { c: up_(hit.r[1]), e: new Date(hit.r[3]).getTime(), v: str_(hit.r[4]) };
    cache.put("tok:" + th, JSON.stringify(ses), 600);
  }
  // срок и версия пароля проверяются каждый раз: сброс или смена пароля закрывают все старые сессии
  if (!(ses.e > Date.now()) || !ses.v || ses.v !== ver_(ses.c)) return null;
  if (ses.c === ADMIN) return { admin: true, code: ADMIN };
  return student_(ses.c) || parent_(ses.c);
}
function auth_(p) {
  const base = account_(Object.assign({}, p, { exam: "", track: "" })); if (base.error) return { ok: false, error: base.error };
  const s = base.s;
  if (fails_(s.code) >= SETTINGS.MAX_FAILS) return { ok: false, error: "locked" };
  const row = accessRow_(s.code);
  if (!row) return { ok: false, error: "no_password" };
  if (hashPass_(str_(p.password), str_(row.r[2])) !== str_(row.r[1])) { const n = fails_(s.code, true); return { ok: false, error: n >= SETTINGS.MAX_FAILS ? "locked" : "wrong_password", left: Math.max(0, SETTINGS.MAX_FAILS - n) }; }
  fails_(s.code, "reset");
  const a = account_(p); if (a.error) return { ok: false, error: a.error };   // курс страницы не выдан: пароль верный, но сессию не даём
  return { ok: true, token: newSession_(s.code), name: s.name, role: s.parent ? "parent" : "student" };
}
function setPassword_(p) {
  const a = account_(p); if (a.error) return { ok: false, error: a.error };
  const s = a.s;
  const pass = str_(p.password);
  if (pass.length < SETTINGS.MIN_PASSWORD) return { ok: false, error: "weak_password" };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try {
    if (accessRow_(s.code)) return { ok: false, error: "has_password" };
    const salt = randHex_(24);
    add_("access", [s.code, hashPass_(pass, salt), salt, new Date()]);
    SpreadsheetApp.flush(); dropVer_(s.code);
  } finally { lock.releaseLock(); }
  notify_((s.parent ? "родитель" : "ученик") + " задал пароль", s.name + " (" + s.code + ") впервые вошёл в кабинет и задал пароль.");
  return { ok: true, token: newSession_(s.code), name: s.name, role: s.parent ? "parent" : "student" };
}
function changePassword_(p, me) {
  const row = accessRow_(me.code);
  if (!row || hashPass_(str_(p.old), str_(row.r[2])) !== str_(row.r[1])) return { ok: false, error: "wrong_password" };
  const pass = str_(p.password);
  if (pass.length < SETTINGS.MIN_PASSWORD) return { ok: false, error: "weak_password" };
  const salt = randHex_(24);
  sh_("access").getRange(row._row, 2, 1, 3).setValues([[hashPass_(pass, salt), salt, new Date()]]);
  SpreadsheetApp.flush(); dropVer_(me.code);
  return { ok: true, token: newSession_(me.code) };   // остальные сессии этого кода закрыты; эта продолжается с новым токеном
}
function logout_(p) {
  const th = sha_(str_(p.token));
  const hit = rows_("sessions").find(x => str_(x.r[0]) === th);
  if (hit) sh_("sessions").getRange(hit._row, 4).setValue(new Date(0));
  CacheService.getScriptCache().remove("tok:" + th);
  return { ok: true };
}
/** новый аккаунт с кодом, который был раньше: старый пароль и сессии к нему не переходят */
function forgetAccess_(code) {
  const row = accessRow_(code);
  if (row) sh_("access").deleteRow(row._row);
  dropVer_(code);
}
function upload_(p) {
  const s = student_(p.code);
  if (!p.data) return { ok: false, error: "bad_request" };
  if (!hwVisible_(s, p.dir, str_(p.hwId))) return { ok: false, error: "not_found" };
  const stamp = Utilities.formatDate(new Date(), SETTINGS.TZ, "yyyy-MM-dd HH-mm") + " " + s.code + " " + str_(p.hwId) + " " + str_(p.partId);
  const url = saveFile_(SETTINGS.FILES_FOLDER, stamp, p.name, p.type, p.data);
  return url ? { ok: true, url } : { ok: false, error: "too_big" };
}

/* ======================= вход ======================= */
/** вход в кабинет курса: данные только этого направления. Без направления: профиль и список выданных курсов (страница кабинетов) */
function login_(p) {
  const s = student_(p.code);
  if (!s) return { ok: false, error: "no_code" };
  const track = p.dir;
  const base = { ok: true, role: "student", code: s.code, name: s.name, tracks: s.tracks, names: TRACK_NAMES, theme: s.theme, avatar: s.avatar };
  if (!track) return base;
  const mine = myBookings_(s.code, s.tracks);
  const next = mine.filter(b => b.status === "активна" && at_(b.d, b.t) > Date.now()).sort((a, b) => at_(a.d, a.t) - at_(b.d, b.t))[0];
  return Object.assign(base, {
    track: [track], targets: s.targets, goal: s.goal, examDate: s.examDate, note: s.note, nextLesson: next ? next.d + "T" + next.t + ":00+03:00" : "",
    homework: homeworkFor_(s.code, track), attempts: resultsFor_(s.code, track), state: getState_(s.code, track), payments: { balance: s.balance, history: paymentsFor_(s.code, [track]), price: s.price }, bookings: mine
  });
}
function resultsFor_(code, track, rows) {
  return (rows || rows_("results")).filter(x => up_(x.r[1]) === code && str_(x.r[2]).toLowerCase() === track).map(x => {
    let a = {}; try { a = JSON.parse(x.r[9]); } catch (e) {}
    if (!a || typeof a !== "object") return null;
    a.synced = true; delete a.teacherScore; delete a.teacherComment;
    if (x.r[6] !== "") a.teacherScore = num_(x.r[6]);
    if (str_(x.r[7])) a.teacherComment = str_(x.r[7]);
    return a;
  }).filter(a => a && a.id);
}
/** оплаты по направлениям; старые строки без направления видны в любом кабинете ученика */
function paymentsFor_(code, tracks, rows) {
  return (rows || rows_("payments")).filter(x => up_(x.r[1]) === code && (!str_(x.r[3]) || tracks.indexOf(str_(x.r[3]).toLowerCase()) >= 0))
    .map(x => ({ date: new Date(x.r[0]).toISOString(), pkg: str_(x.r[4]), amount: num_(x.r[5]), lessons: num_(x.r[6]), status: str_(x.r[7]) || "ждёт подтверждения", track: str_(x.r[3]).toLowerCase(), receipt: !!str_(x.r[9]) }));
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
/** свои записи ученика: только по выданным ему направлениям */
function myBookings_(code, tracks) {
  const now = Date.now();
  return rows_("bookings").filter(x => up_(x.r[4]) === code).map(x => ({ id: str_(x.r[0]), d: date_(x.r[1]), t: time_(x.r[2]), track: str_(x.r[3]).toLowerCase(), status: str_(x.r[6]) || "активна" }))
    .filter(b => at_(b.d, b.t) > now - 36e5 * 2 && (!tracks || !b.track || tracks.indexOf(b.track) >= 0));
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
function slots_(p, tracks) {
  const track = str_(p.track).toLowerCase(), code = up_(p.code);
  const key = "slots:" + track;
  const cache = CacheService.getScriptCache();
  let base = null;
  const cached = cache.get(key);
  if (cached) base = JSON.parse(cached);
  else { base = buildSlots_(track, ""); cache.put(key, JSON.stringify(base), 15); }
  // «моё» считаем без кеша
  const mine = code ? myBookings_(code, tracks) : [];
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
        const ev = CalendarApp.getDefaultCalendar().createEvent("Mr.Sam: " + s.name + " · " + TRACK_NAMES[track], new Date(at_(d, t)), new Date(at_(d, t) + SETTINGS.LESSON_MIN * 60000), { description: "Код: " + s.code + (p.comment ? "\nЧто разобрать: " + str_(p.comment) : "") });
        ev.setTag("mrsam", "booking"); evId = ev.getId();
      } catch (e) {}
    }
    add_("bookings", [id, d, t, track, s.code, s.name, "активна", str_(p.comment).slice(0, 500), new Date(), evId]);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().removeAll(TRACKS.map(x => "slots:" + x).concat(["slots:"]));
    notify_("запись " + d + " " + t, s.name + " (" + s.code + ") записался на " + d + " в " + t + " МСК, " + TRACK_NAMES[track] + (p.comment ? "\nЧто разобрать: " + p.comment : ""));
    return { ok: true, booking: { id, d, t, track, status: "активна" } };
  } finally { lock.releaseLock(); }
}
function cancel_(p, tracks) {
  const code = up_(p.code), id = str_(p.id);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: "busy" };
  try {
    const hit = rows_("bookings").find(x => str_(x.r[0]) === id && up_(x.r[4]) === code && str_(x.r[6]) !== "отменена");
    if (!hit) return { ok: false, error: "not_found" };
    const tr = str_(hit.r[3]).toLowerCase();
    if (tr && (tracks || []).indexOf(tr) < 0) return { ok: false, error: "no_access" };   // курс закрыт: отменит Самир
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
  if (s && s.price && num_(p.lessons) > 0) p.amount = String(s.price * num_(p.lessons));
  const url = p.receiptData ? saveFile_(SETTINGS.RECEIPTS_FOLDER, stamp + " " + code + " " + str_(p.amount) + "₽", p.receiptName, p.receiptType, p.receiptData) : "";
  add_("payments", [new Date(), code, name, str_(p.track || p.exam), text_(str_(p.pkg)), num_(p.amount), num_(p.lessons), "ждёт подтверждения", text_(str_(p.note).slice(0, 500)), url]);
  notify_("оплата " + str_(p.amount) + " ₽", name + " (" + code + ") отметил оплату: " + str_(p.pkg) + ", " + str_(p.amount) + " ₽" + (url ? "\nЧек: " + url : "\nБез чека") + (p.note ? "\nКомментарий: " + p.note : ""));
  return { ok: true, receipt: !!url };
}

/* ======================= домашка ======================= */
function hwForCode_(x, code) { const codes = str_(x.r[1]).toUpperCase(); return !codes || codes === "ВСЕ" || codes === "ALL" || codes.split(/[,;\s]+/).indexOf(code) >= 0; }
/** домашка ученика в одном направлении (пустой «Кабинет» у задания = во всех его направлениях) */
function homeworkFor_(code, track, hwRows, subRows) {
  const subs = (subRows || rows_("submissions")).filter(x => up_(x.r[1]) === code);
  return (hwRows || rows_("homework")).filter(x => str_(x.r[0]) && hwForCode_(x, code) && tracksOf_(x.r[2], LEGACY_ALL).indexOf(track) >= 0).map(x => {
    const id = str_(x.r[0]);
    let parts = []; try { parts = x.r[6] ? JSON.parse(x.r[6]) : []; } catch (e) {}
    const sub = subs.filter(y => str_(y.r[3]) === id).pop();
    const hw = { id, title: str_(x.r[3]), desc: str_(x.r[4]), due: x.r[5] ? date_(x.r[5]) : "", parts, link: str_(x.r[7]), from: x.r[8] ? date_(x.r[8]) : "", status: "новое" };
    if (sub) {
      hw.status = str_(sub.r[6]) || "на проверке";
      if (cellTxt_(sub.r[7])) hw.grade = cellTxt_(sub.r[7]);
      if (cellTxt_(sub.r[8])) hw.comment = cellTxt_(sub.r[8]);
      try { if (sub.r[9]) hw.review = JSON.parse(sub.r[9]); } catch (e) {}
    }
    return hw;
  });
}
/** задание действительно выдано этому ученику в этом направлении (или в любом из его направлений) */
function hwVisible_(s, dir, id) {
  if (!s || !id) return false;
  const dirs = dir ? [dir] : s.tracks;
  return rows_("homework").some(x => str_(x.r[0]) === id && hwForCode_(x, s.code) && tracksOf_(x.r[2], LEGACY_ALL).some(t => dirs.indexOf(t) >= 0));
}
function homework_(p) {
  const s = student_(p.code);
  if (!s) return { ok: false, error: "no_code" };
  if (!hwVisible_(s, p.dir, str_(p.hwId || p.hw))) return { ok: false, error: "not_found" };
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
  if (!a || typeof a !== "object" || Array.isArray(a) || !str_(a.id)) return { ok: false, error: "bad_request" };
  if (a.exam && str_(a.exam).toLowerCase() !== p.dir) return { ok: false, error: "no_access" };   // результат только в своё направление
  a.exam = p.dir; a.id = str_(a.id).slice(0, 60); a.score = num_(a.score);
  delete a.teacherScore; delete a.teacherComment; delete a.synced;   // оценка и комментарий Самира только из его столбцов
  if (rows_("results").some(x => str_(x.r[8]) === a.id && up_(x.r[1]) === s.code)) return { ok: true, dup: true };
  add_("results", [new Date(), s.code, p.dir, str_(a.title), str_(a.section), a.score, "", "", a.id, JSON.stringify(a).slice(0, 45000)]);
  return { ok: true };
}
function mathAttempt_(p) {
  const o = Object.assign({}, p); delete o.token; delete o.password; delete o.action;   // токен сессии в таблицу не пишем
  add_("math", [new Date(), up_(p.code), str_(p.topic), str_(p.level), num_(p.correct), num_(p.total), JSON.stringify(o).slice(0, 45000), p.dir]);
  return { ok: true };
}
function lead_(p) {
  add_("leads", [new Date(), str_(p.name), str_(p.contact), str_(p.service), str_(p.route), str_(p.message || p.comment), str_(p.source), JSON.stringify(p).slice(0, 45000)]);
  notify_("новая заявка", "Имя: " + str_(p.name) + "\nКонтакт: " + str_(p.contact) + "\nУслуга: " + str_(p.service) + "\nМаршрут: " + str_(p.route) + "\n" + str_(p.message || p.comment));
  return { ok: true };
}

/* ======================= родитель: только просмотр ======================= */
/** дети родителя и по каждому только видимые направления: результаты, домашка, занятия, план и прогресс по математике */
function parentMe_(me) {
  const res = rows_("results"), hwRows = rows_("homework"), subRows = rows_("submissions"), pays = rows_("payments"), books = rows_("bookings");
  const mth = tail_("math", 4000), asg = rows_("assign"), ans = tail_("answers", 4000), now = Date.now();
  const children = me.kids.map(k => {
    const s = student_(k.code); if (!s) return null;
    const dirs = kidDirs_(k, s), all = s.tracks.length > 0 && s.tracks.every(t => dirs.indexOf(t) >= 0), data = {};
    dirs.forEach(d => {
      const lessons = books.filter(x => up_(x.r[4]) === s.code && str_(x.r[3]).toLowerCase() === d && str_(x.r[6]) !== "отменена").map(x => ({ d: date_(x.r[1]), t: time_(x.r[2]) }));
      const o = { name: TRACK_NAMES[d],
        homework: homeworkFor_(s.code, d, hwRows, subRows).map(x => ({ title: x.title, due: x.due, status: x.status, grade: x.grade || "", comment: x.comment || "" })),
        upcoming: lessons.filter(b => at_(b.d, b.t) > now).sort((a, b) => at_(a.d, a.t) - at_(b.d, b.t)).slice(0, 5), lessonsDone: lessons.filter(b => at_(b.d, b.t) <= now).length };
      if (MATH_DIRS.indexOf(d) >= 0) {
        const mp = mprof_(s.code, d), byTopic = {};
        answersFor_(s.code, 4000, d, ans).forEach(a => { if (!a.topic) return; const g = byTopic[a.topic] = byTopic[a.topic] || { n: 0, ok: 0 }; g.n++; if (a.ok && !a.hint) g.ok++; });
        o.plan = { level: mp.level, goal: mp.goal, topics: mp.topics, byTopic,
          assignments: assignsFor_(s.code, d, asg).map(a => ({ title: a.title, kind: a.kind, due: a.due, status: a.status, correct: a.result ? num_(a.result.correct) : null, total: a.result ? num_(a.result.total) : null })),
          sessions: mth.filter(x => up_(x.r[1]) === s.code && mdir_(x.r[7]) === d).slice(-30).map(x => ({ date: iso_(x.r[0]), topic: str_(x.r[2]), correct: num_(x.r[4]) || 0, total: num_(x.r[5]) || 0, mode: str_(json_(x.r[6], {}).mode) || "practice" })) };
      } else {
        o.tests = resultsFor_(s.code, d, res).slice(-30).map(a => ({ date: str_(a.date), title: str_(a.title), section: str_(a.section), score: a.teacherScore != null ? a.teacherScore : num_(a.score), byTeacher: a.teacherScore != null, comment: str_(a.teacherComment) }));
        o.target = d === "ielts" || d === "toefl" ? s.targets[d] : null;
        if (d === "english") o.level = enLevel_(res.filter(r => up_(r.r[1]) === s.code));
      }
      data[d] = o;
    });
    return { code: s.code, name: s.name, avatar: s.avatar, dirs, data, payments: paymentsFor_(s.code, dirs, pays).filter(x => x.track || all), balance: all ? s.balance : null };
  }).filter(Boolean);
  return { ok: true, role: "parent", code: me.code, name: me.name, names: TRACK_NAMES, children };
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
  dropVer_(ADMIN);   // все прежние сессии учителя перестают работать
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
    case "admin_student_tracks": return locked_(() => adminStudentTracks_(p));
    case "admin_parent_save": return locked_(() => adminParentSave_(p));
    case "admin_hw_list": return adminHwList_();
    case "admin_hw_save": return adminHwSave_(p);
    case "admin_hw_delete": return adminDelete_("homework", 0, p.id);
    case "admin_hw_file": return adminHwFile_(p);
    case "admin_hw_file_get": return hwFileData_(str_(p.fileId));
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
    case "admin_math_get": return adminMathGet_(p);
    case "admin_math_save": return adminMathSave_(p);
    case "admin_assign_save": return locked_(() => adminAssignSave_(p));
    case "admin_assign_delete": return locked_(() => adminDelete_("assign", 0, p.id));
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
/** уровень английского по результатам: последний тест на уровень или все тесты уровня на 80%+ (сколько тестов в уровне, кабинет пишет в попытку: lvN) */
const EN_LV_ = ["A1", "A2", "B1", "B2", "C1"];
function enLevel_(mine) {
  let cur = -1; const best = {}, lvN = {};
  mine.filter(r => str_(r.r[2]).toLowerCase() === "english").forEach(r => {
    const a = json_(r.r[9], {});
    if (a.testId === "english-placement" && EN_LV_.indexOf(a.level) >= 0) cur = EN_LV_.indexOf(a.level);
    if (EN_LV_.indexOf(a.lv) >= 0 && a.testId) { lvN[a.lv] = Math.max(lvN[a.lv] || 0, num_(a.lvN) || 0); const b = best[a.lv] = best[a.lv] || {}; b[a.testId] = Math.max(b[a.testId] || 0, num_(a.score) || 0); }
  });
  EN_LV_.forEach((L, i) => { const b = best[L]; if (lvN[L] && b && Object.keys(b).filter(k => b[k] >= 80).length >= lvN[L] && i > cur) cur = i; });
  return cur >= 0 ? EN_LV_[cur] : "";
}
function adminStudents_() {
  const asg = rows_("assign"), pars = rows_("parents").map(x => ({ code: up_(x.r[0]), name: str_(x.r[1]), kids: parentKids_(x.r[2]) })).filter(x => x.code);
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
    return { code: s.code, name: s.name, tracks: s.tracks, targets: s.targets, goal: s.goal, examDate: s.examDate, note: s.note, balance: s.balance, price: s.price,
      hasPassword: acc.some(a => up_(a.r[0]) === s.code), tests: mine.length, mathRuns: mth.filter(r => up_(r.r[1]) === s.code).length, lastScore,
      hw: { assigned, submitted: ms.length, review: ms.filter(r => str_(r.r[6]) === "на проверке").length },
      lessons: { done: sb.filter(r => at_(r.d, r.t) <= now).length, upcoming: sb.filter(r => at_(r.d, r.t) > now).length },
      next: next ? next.d + " " + next.t : "", paid: pays.filter(p => p.code === s.code && p.status === "подтверждено").reduce((a, p) => a + p.amount, 0),
      enLevel: s.tracks.indexOf("english") >= 0 ? enLevel_(mine) : "",
      math: s.tracks.indexOf("math") >= 0 ? mathSum_(s.code, "math", asg) : null, mathen: s.tracks.indexOf("mathen") >= 0 ? mathSum_(s.code, "mathen", asg) : null,
      parents: pars.filter(x => x.kids.some(k => k.code === s.code)).map(x => { const k = x.kids.find(y => y.code === s.code); return { code: x.code, name: x.name, dirs: k.dirs, sees: kidDirs_(k, s), hasPassword: acc.some(a => up_(a.r[0]) === x.code) }; }),
      lastActive: acts.length ? new Date(Math.max.apply(null, acts)).toISOString() : "" };
  }).filter(Boolean);
}
function mathSum_(code, dir, asg) {
  const mp = mprof_(code, dir), open = asg.filter(x => up_(x.r[1]) === code && mdir_(x.r[10]) === dir && str_(x.r[0]) && str_(x.r[7]) !== "выполнено").length;
  return { level: mp.level, topics: mp.topics.length, open };
}
function adminStudentSave_(p) {
  const code = up_(p.code).replace(/[^A-ZА-ЯЁ0-9-]/g, "");
  if (code.length < 3) return { ok: false, error: "bad_code" };
  if (parentRow_(code)) return { ok: false, error: "code_taken" };   // коды учеников и родителей не пересекаются
  const tracks = tracksOf_(p.tracks, []);   // можно сохранить и без направлений: ученик не увидит ни одного курса
  const row = [code, str_(p.name) || "Ученик", tracks.join(", "), num_(p.ielts) == null ? "" : num_(p.ielts), num_(p.toefl) == null ? "" : num_(p.toefl), str_(p.goal), str_(p.examDate), str_(p.note), num_(p.balance) == null ? "" : num_(p.balance)];
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try {
    const hit = rows_("students").find(x => up_(x.r[0]) === code);
    // своя цена занятия: число > 0 или пусто (обычная цена курса). Не пришла = не трогаем
    const price = p.price == null ? undefined : (num_(p.price) > 0 ? Math.round(num_(p.price)) : "");
    if (hit) {
      if (p.create === "1") return { ok: false, error: "exists" };
      sh_("students").getRange(hit._row, 1, 1, row.length).setValues([row]);
      if (price !== undefined) sh_("students").getRange(hit._row, 12).setValue(price);
    }
    else { forgetAccess_(code); add_("students", row.concat(["", "", price === undefined ? "" : price])); }
    CacheService.getScriptCache().removeAll(TRACKS.map(x => "slots:" + x));
    return { ok: true, code };
  } finally { lock.releaseLock(); }
}
/** включить или выключить направления одному ученику: меняется только его строка */
function adminStudentTracks_(p) {
  const s = student_(p.code); if (!s) return { ok: false, error: "not_found" };
  const tracks = tracksOf_(p.tracks, []);
  sh_("students").getRange(s.row, 3).setValue(tracks.join(", "));
  return { ok: true, code: s.code, tracks };
}
/** родитель ребёнка: код, имя и что он видит. dirs: «ielts,english» или «*» = все направления ребёнка; remove=1 отвязать */
function adminParentSave_(p) {
  const child = student_(p.child); if (!child) return { ok: false, error: "not_found" };
  const code = up_(p.code).replace(/[^A-ZА-ЯЁ0-9-]/g, "");
  if (code.length < 3) return { ok: false, error: "bad_code" };
  if (student_(code)) return { ok: false, error: "code_taken" };
  const hit = parentRow_(code);
  // код родителя открывает данные ребёнка и служит секретом для первого входа: не короче 8 знаков без дефисов
  if (!hit && code.replace(/-/g, "").length < 8) return { ok: false, error: "weak_code" };
  const kids = hit ? parentKids_(hit.r[2]).filter(k => k.code !== child.code) : [];
  if (p.remove !== "1") kids.push({ code: child.code, dirs: str_(p.dirs) === "*" ? null : tracksOf_(p.dirs, []) });
  if (!kids.length) { if (hit) { sh_("parents").deleteRow(hit._row); forgetAccess_(code); } return { ok: true, removed: true }; }   // без детей: родитель и его вход удалены
  const row = [code, str_(p.name).slice(0, 80) || (hit ? str_(hit.r[1]) : "") || "Родитель", kidsText_(kids), new Date()];
  if (hit) sh_("parents").getRange(hit._row, 1, 1, row.length).setValues([row]); else { forgetAccess_(code); add_("parents", row); }
  return { ok: true, code };
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
  const tracks = tracksOf_(p.track, []); if (!tracks.length) return { ok: false, error: "no_tracks" };   // курс задания указываем явно
  let parts = []; try { parts = p.parts ? JSON.parse(p.parts) : []; } catch (e) { return { ok: false, error: "bad_parts" }; }
  if (!Array.isArray(parts)) return { ok: false, error: "bad_parts" };
  const codes = str_(p.codes).toUpperCase().split(/[,;\s]+/).filter(Boolean).join(", ") || "ВСЕ";
  parts = cleanHwParts_(parts);
  const pj = JSON.stringify(parts); if (pj.length > 45000) return { ok: false, error: "bad_parts" };
  const id = str_(p.id) || ("hw" + Date.now().toString(36));
  const row = [id, codes, tracks.join(", "), text_(title), text_(str_(p.desc).slice(0, 5000)), str_(p.due), pj, str_(p.link), str_(p.from) || Utilities.formatDate(new Date(), SETTINGS.TZ, "yyyy-MM-dd")];
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
  return { ok: true, subs: rows_("submissions").map(x => ({ row: x._row, date: iso_(x.r[0]), code: up_(x.r[1]), name: names[up_(x.r[1])] || "", track: str_(x.r[2]), hwId: str_(x.r[3]), title: titles[str_(x.r[3])] || str_(x.r[3]), partTitles: ptitles[str_(x.r[3])] || {}, answers: str_(x.r[4]).slice(0, 20000), files: str_(x.r[5]).split("\n").filter(Boolean), status: str_(x.r[6]) || "на проверке", grade: cellTxt_(x.r[7]), comment: cellTxt_(x.r[8]) })).reverse().slice(0, 300) };
}
function adminSubReview_(p) {
  const row = parseInt(p.row, 10), sh = sh_("submissions");
  if (!(row >= 2 && row <= sh.getLastRow())) return { ok: false, error: "not_found" };
  const r = sh.getRange(row, 1, 1, 10).getValues()[0];
  if (up_(r[1]) !== up_(p.code) || str_(r[3]) !== str_(p.hwId)) return { ok: false, error: "changed" };
  const status = ["проверено", "доработать", "на проверке"].indexOf(str_(p.status)) >= 0 ? str_(p.status) : "проверено";
  sh.getRange(row, 7, 1, 3).setValues([[status, text_(str_(p.grade).slice(0, 40)), text_(str_(p.comment).slice(0, 5000))]]);
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
  setAdminPass_(pass); return { ok: true, token: newSession_(ADMIN) };
}

/* ======================= игры (HTML-файлы на Диске) ======================= */
const GAMES_FOLDER = "Mr.Sam · игры";
/* ======================= файлы заданий: фото и HTML-тесты ======================= */
const HW_FOLDER = "Mr.Sam · задания";
const HW_TYPES_ = { "image/jpeg": 1, "image/png": 1, "image/webp": 1, "image/gif": 1, "text/html": 1 };
/** фото и HTML-тесты в шагах задания: только id и имя файла, не больше 20 фото в шаге */
function cleanHwParts_(parts) {
  const f_ = f => f && str_(f.id) ? { id: str_(f.id).slice(0, 100), name: str_(f.name).slice(0, 120) } : null;
  return parts.filter(q => q && typeof q === "object").map(q => {
    if (q.type === "photo") return Object.assign({}, q, { files: (Array.isArray(q.files) ? q.files : []).map(f_).filter(Boolean).slice(0, 20) });
    if (q.type === "html") return Object.assign({}, q, { file: f_(q.file) });
    return q;
  });
}
function hwFileIds_(parts) {
  const out = [];
  (Array.isArray(parts) ? parts : []).forEach(q => { if (!q) return; (Array.isArray(q.files) ? q.files : []).forEach(f => { if (f && f.id) out.push(str_(f.id)); }); if (q.file && q.file.id) out.push(str_(q.file.id)); });
  return out;
}
/** учитель загружает фото или HTML-тест для задания: файл ложится в папку «Mr.Sam · задания» на Диске */
function adminHwFile_(p) {
  const type = str_(p.type).toLowerCase(), name = str_(p.name).slice(0, 120) || "file";
  if (!HW_TYPES_[type] || !p.data) return { ok: false, error: "bad_type" };
  const bytes = Utilities.base64Decode(String(p.data));
  if (bytes.length > (type === "text/html" ? 4 : 6) * 1024 * 1024) return { ok: false, error: "too_big" };
  if (type === "text/html" && !/<(html|body|script|div|form|input|svg|canvas|p)\b/i.test(Utilities.newBlob(bytes).getDataAsString("UTF-8"))) return { ok: false, error: "not_html" };
  const stamp = Utilities.formatDate(new Date(), SETTINGS.TZ, "yyyy-MM-dd HH-mm");
  const f = folder_(HW_FOLDER).createFile(Utilities.newBlob(bytes, type, stamp + " " + name));
  return { ok: true, id: f.getId(), name, type, size: bytes.length };
}
/** файл задания: только из папки заданий. HTML отдаём текстом, картинки в base64 */
function hwFileData_(fid) {
  let f = null; try { f = DriveApp.getFileById(fid); } catch (e) { f = null; }
  if (!f) return { ok: false, error: "not_found" };
  let mine = false; const it = f.getParents(); while (it.hasNext()) if (it.next().getName() === HW_FOLDER) mine = true;
  if (!mine) return { ok: false, error: "not_found" };
  const b = f.getBlob(), type = String(b.getContentType() || "").toLowerCase();
  if (type.indexOf("html") >= 0) return { ok: true, type: "text/html", html: b.getDataAsString("UTF-8") };
  return { ok: true, type, data: Utilities.base64Encode(b.getBytes()) };
}
/** ученик получает файл, только если задание выдано ему в этом курсе и файл есть в этом задании */
function hwFile_(me, p) {
  const s = student_(me.code), id = str_(p.hwId), fid = str_(p.fileId);
  if (!fid || !hwVisible_(s, p.dir, id)) return { ok: false, error: "not_found" };
  const hit = rows_("homework").find(x => str_(x.r[0]) === id);
  if (!hit || hwFileIds_(json_(hit.r[6], [])).indexOf(fid) < 0) return { ok: false, error: "not_found" };
  return hwFileData_(fid);
}
function gamesAll_() {
  return rows_("games").filter(x => str_(x.r[0])).map(x => ({ id: str_(x.r[0]), title: str_(x.r[1]), subject: str_(x.r[2]), tracks: tracksOf_(x.r[3], LEGACY_ALL), desc: str_(x.r[4]), size: num_(x.r[6]) || 0, added: iso_(x.r[7]), visible: str_(x.r[8]).toLowerCase() !== "нет", topic: str_(x.r[9]), skill: str_(x.r[10]), levels: json_(x.r[11], []) })).reverse();
}
/** игры одного направления (направление уже проверено: оно выдано ученику) */
function gamesFor_(me, p) {
  const track = p.dir;
  return { ok: true, games: gamesAll_().filter(g => g.visible && g.tracks.indexOf(track) >= 0).map(g => ({ id: g.id, title: g.title, subject: g.subject, desc: g.desc, added: g.added, topic: g.topic, skill: g.skill, levels: g.levels })) };
}
function gameFile_(id) {
  const hit = rows_("games").find(x => str_(x.r[0]) === str_(id));
  return hit ? { hit, file: DriveApp.getFileById(str_(hit.r[5])) } : null;
}
function gameHtml_(me, p) {
  const g = gamesAll_().find(x => x.id === str_(p.id)), dirs = p.dir ? [p.dir] : me.tracks;
  if (!g || !g.visible || !g.tracks.some(t => dirs.indexOf(t) >= 0)) return { ok: false, error: "not_found" };
  const f = gameFile_(g.id);
  return { ok: true, title: g.title, html: f.file.getBlob().getDataAsString("UTF-8") };
}
function adminGameGet_(p) {
  const f = gameFile_(p.id); if (!f) return { ok: false, error: "not_found" };
  return { ok: true, html: f.file.getBlob().getDataAsString("UTF-8") };
}
function adminGameSave_(p) {
  const title = str_(p.title); if (!title) return { ok: false, error: "no_title" };
  const tracks = tracksOf_(p.tracks, []); if (!tracks.length) return { ok: false, error: "no_tracks" };
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
  let levels = json_(p.levels, null); if (!Array.isArray(levels)) levels = hit ? json_(hit.r[11], []) : [];
  levels = levels.slice(0, 12).map(l => ({ v: str_(l && l.v).slice(0, 20), name: str_(l && l.name).slice(0, 60) })).filter(l => l.v);
  const row = [id, title, str_(p.subject), tracks.join(", "), str_(p.desc).slice(0, 1000), fileId, size, hit ? hit.r[7] : new Date(), p.visible === "0" ? "нет" : "да",
    p.topic != null ? str_(p.topic).slice(0, 40) : (hit ? str_(hit.r[9]) : ""), p.skill != null ? str_(p.skill).slice(0, 200) : (hit ? str_(hit.r[10]) : ""), JSON.stringify(levels)];
  if (hit) sh_("games").getRange(hit._row, 1, 1, row.length).setValues([row]); else add_("games", row);
  return { ok: true, id };
}
function adminGameDelete_(p) {
  const f = gameFile_(p.id); if (!f) return { ok: false, error: "not_found" };
  try { f.file.setTrashed(true); } catch (e) {}
  sh_("games").deleteRow(f.hit._row);
  return { ok: true };
}

/* ======================= математика: персональный план ======================= */
const ASSIGN_KINDS = ["test", "game"];
/** направление строки математики: старые строки без него относятся к обычной математике */
const mdir_ = v => str_(v).toLowerCase() || "math";
const mathDir_ = v => MATH_DIRS.indexOf(str_(v).toLowerCase()) >= 0 ? str_(v).toLowerCase() : "math";
function mprofRow_(code, dir) { return rows_("mprof").find(x => up_(x.r[0]) === code && mdir_(x.r[8]) === dir) || null; }
function mprof_(code, dir) {
  const s = student_(code), hit = mprofRow_(code, dir);
  const base = { level: 1, goal: s ? s.goal : "", topics: [], levels: {}, autoRec: true, rec: null, note: s ? s.note : "", updated: "" };
  if (!hit) return base;
  return Object.assign(base, { level: Math.min(3, Math.max(1, num_(hit.r[1]) || 1)), goal: str_(hit.r[2]) || base.goal, topics: str_(hit.r[3]).split(/[,;\s]+/).filter(Boolean),
    levels: json_(hit.r[4], {}), autoRec: str_(hit.r[5]).toLowerCase() !== "нет", rec: json_(hit.r[6], null), updated: iso_(hit.r[7]) });
}
function assignRow_(x) {
  return { id: str_(x.r[0]), code: up_(x.r[1]), kind: str_(x.r[2]), title: str_(x.r[3]), params: json_(x.r[4], {}), due: x.r[5] ? date_(x.r[5]) : "", created: iso_(x.r[6]),
    status: str_(x.r[7]) || "новое", result: json_(x.r[8], null), updated: iso_(x.r[9]), dir: mdir_(x.r[10]) };
}
function assignsFor_(code, dir, rows) { return (rows || rows_("assign")).filter(x => str_(x.r[0]) && up_(x.r[1]) === code && mdir_(x.r[10]) === dir).map(assignRow_); }
const ANS_COLS = ["at", "code", "src", "ref", "topic", "skill", "tpl", "diff", "err", "q", "a", "given", "ok", "tries", "hint", "trap", "secs", "id", "fix", "dir"];
function answerObj_(x) {
  const r = x.r, o = {};
  ANS_COLS.forEach((k, i) => { o[k] = r[i]; });
  o.at = iso_(r[0]); o.code = up_(r[1]); o.ok = r[12] === true || str_(r[12]).toLowerCase() === "да" || str_(r[12]) === "1";
  o.hint = r[14] === true || str_(r[14]).toLowerCase() === "да"; o.diff = num_(r[7]) || 1; o.tries = num_(r[13]) || 1; o.secs = num_(r[16]) || 0;
  ["src", "ref", "topic", "skill", "tpl", "err", "q", "a", "given", "trap", "id", "fix"].forEach(k => { o[k] = str_(o[k]); });
  o.dir = mdir_(r[19]);
  delete o.code; return o;
}
function answersFor_(code, n, dir, rows) { return (rows || tail_("answers", 4000)).filter(x => up_(x.r[1]) === code && mdir_(x.r[19]) === dir).slice(-n).map(answerObj_); }
function mathMe_(me, dir) {
  if (me.tracks.indexOf(dir) < 0) return { ok: false, error: "no_access" };
  return { ok: true, dir, profile: mprof_(me.code, dir), assignments: assignsFor_(me.code, dir), answers: answersFor_(me.code, 400, dir) };
}
/** ответы ученика пачкой: [{id, at, src, ref, topic, skill, tpl, diff, err, q, a, given, ok, tries, hint, trap, secs}] */
function mathAnswers_(me, p) {
  let list = json_(p.list, []);
  if (!Array.isArray(list) || !list.length) return { ok: false, error: "bad_request" };
  list = list.slice(0, 80);
  const lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return { ok: false, error: "busy" };
  try {
    const have = {}; tail_("answers", 4000).forEach(x => { if (up_(x.r[1]) === me.code) have[str_(x.r[17])] = 1; });
    const rows = [];
    list.forEach(a => {
      const id = str_(a && a.id).slice(0, 40); if (!id || have[id]) return; have[id] = 1;
      const at = new Date(a.at); 
      rows.push([isNaN(at) ? new Date() : at, me.code, str_(a.src).slice(0, 12), str_(a.ref).slice(0, 40), str_(a.topic).slice(0, 20), str_(a.skill).slice(0, 120), str_(a.tpl).slice(0, 30),
        Math.min(3, Math.max(1, num_(a.diff) || 1)), str_(a.err).slice(0, 20), str_(a.q).slice(0, 400), str_(a.a).slice(0, 60), str_(a.given).slice(0, 60), a.ok ? "да" : "нет",
        Math.min(9, Math.max(1, num_(a.tries) || 1)), a.hint ? "да" : "нет", str_(a.trap).slice(0, 200), Math.min(36000, Math.max(0, Math.round(num_(a.secs) || 0))), id, str_(a.fix).slice(0, 40), p.dir]);
    });
    if (rows.length) {
      const sh = sh_("answers"), from = sh.getLastRow() + 1, n = rows.length;
      // текст ученика храним как текст: иначе таблица превращает «25%» в 0,25, а «3/4» в дату
      [[3, 5], [9, 4], [16, 1], [18, 2]].forEach(c => sh.getRange(from, c[0], n, c[1]).setNumberFormat("@"));
      sh.getRange(from, 1, n, rows[0].length).setValues(rows.map(r => r.map(txt_)));
      SpreadsheetApp.flush();
    }
    return { ok: true, saved: rows.length };
  } finally { lock.releaseLock(); }
}
function assignSet_(me, p, done) {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return { ok: false, error: "busy" };
  try {
    const hit = rows_("assign").find(x => str_(x.r[0]) === str_(p.id) && up_(x.r[1]) === me.code && mdir_(x.r[10]) === p.dir);
    if (!hit) return { ok: false, error: "not_found" };
    const sh = sh_("assign");
    if (done) {
      if (str_(hit.r[7]) === "выполнено") return { ok: true, already: true };
      const res = json_(p.result, null);
      if (!res || typeof res !== "object") return { ok: false, error: "bad_request" };
      const clean = { correct: num_(res.correct) || 0, total: num_(res.total) || 0, secs: num_(res.secs) || 0, at: new Date().toISOString(), topics: res.topics && typeof res.topics === "object" ? res.topics : {},
        run: str_(res.run).slice(0, 40), goal: num_(res.goal) || 0, progress: num_(res.progress) || 0 };
      sh.getRange(hit._row, 8, 1, 3).setValues([["выполнено", JSON.stringify(clean).slice(0, 4000), new Date()]]);
      notify_("назначение выполнено", me.name + " (" + me.code + ") выполнил «" + str_(hit.r[3]) + "»: " + clean.correct + " из " + clean.total);
    } else if ((str_(hit.r[7]) || "новое") === "новое") sh.getRange(hit._row, 8, 1, 3).setValues([["в процессе", str_(hit.r[8]), new Date()]]);
    SpreadsheetApp.flush();
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/** автоматическая смена уровня темы (3 тренировки подряд от 80% или 2 ниже 50%): кабинет считает, сервер запоминает.
    Только свой профиль, только незакреплённая тема и только от текущего уровня. */
function mathLevel_(me, p) {
  const dir = p.dir;
  if (me.tracks.indexOf(dir) < 0) return { ok: false, error: "no_access" };
  const topic = str_(p.topic).slice(0, 20), to = num_(p.to);
  if (!/^[a-z]{2,20}$/.test(topic) || [1, 2, 3].indexOf(to) < 0) return { ok: false, error: "bad_request" };
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try {
    const hit = mprofRow_(me.code, dir), mp = mprof_(me.code, dir), set = mp.levels[topic] || null, gen = mp.levels._ || null;
    if (set && set.lock) return { ok: false, error: "locked" };
    const cur = Math.min(3, Math.max(1, num_(set ? set.d : gen ? gen.d : mp.level) || 1));
    if (num_(p.from) !== cur || to === cur) return { ok: false, error: "changed", level: cur };
    const levels = Object.assign({}, mp.levels); levels[topic] = { d: to, lock: false, at: new Date().toISOString(), auto: true };
    const row = hit ? hit.r.slice(0, SHEETS.mprof[1].length) : [me.code, mp.level, mp.goal, mp.topics.join(", "), "", "да", "", new Date(), dir];
    row[4] = JSON.stringify(levels); row[7] = new Date(); row[8] = dir;
    if (hit) sh_("mprof").getRange(hit._row, 1, 1, row.length).setValues([row]); else add_("mprof", row);
    SpreadsheetApp.flush();
    return { ok: true, levels };
  } finally { lock.releaseLock(); }
}

/* кабинет учителя: профиль, назначения, ответы ученика */
function adminMathGet_(p) {
  const s = student_(p.code); if (!s) return { ok: false, error: "not_found" };
  const dir = mathDir_(p.dir);
  const attempts = tail_("math", 4000).filter(x => up_(x.r[1]) === s.code && mdir_(x.r[7]) === dir).slice(-200).map(x => { const o = json_(x.r[6], {}); return { id: str_(o.id), date: iso_(x.r[0]), topic: str_(x.r[2]), level: str_(x.r[3]), correct: num_(x.r[4]) || 0, total: num_(x.r[5]) || 0, diff: num_(o.diff) || null, mode: str_(o.mode) || "practice", ref: str_(o.ref || o.asg), title: str_(o.title).slice(0, 160), secs: num_(o.secs) || 0, topics: json_(o.topics, {}) }; });
  return { ok: true, dir, access: s.tracks.indexOf(dir) >= 0, profile: mprof_(s.code, dir), assignments: assignsFor_(s.code, dir), answers: answersFor_(s.code, 600, dir), attempts };
}
function adminMathSave_(p) {
  const s = student_(p.code); if (!s) return { ok: false, error: "not_found" };
  const dir = mathDir_(p.dir);
  const topics = str_(p.topics).split(/[,;\s]+/).filter(Boolean).slice(0, 20);
  let levels = json_(p.levels, {}); if (!levels || typeof levels !== "object" || Array.isArray(levels)) levels = {};
  const clean = {}; Object.keys(levels).slice(0, 20).forEach(k => { const v = levels[k] || {}; const d = Math.min(3, Math.max(1, num_(v.d) || 1)); clean[str_(k).slice(0, 20)] = { d, lock: !!v.lock, at: str_(v.at) || new Date().toISOString(), auto: !!v.auto }; });
  let rec = str_(p.rec) ? json_(p.rec, null) : null;
  if (rec && typeof rec === "object") {
    rec = { text: str_(rec.text).slice(0, 300), topic: str_(rec.topic).slice(0, 20), diff: Math.min(3, Math.max(1, num_(rec.diff) || 1)), count: Math.min(30, Math.max(3, num_(rec.count) || 10)), at: new Date().toISOString() };
    const old = mprof_(s.code, dir).rec;   // та же рекомендация: оставляем прежнюю дату, иначе выполненный шаг вернётся
    if (old && old.text === rec.text && old.topic === rec.topic && +old.diff === rec.diff && +old.count === rec.count && old.at) rec.at = old.at;
  } else rec = null;
  const row = [s.code, Math.min(3, Math.max(1, num_(p.level) || 1)), str_(p.goal).slice(0, 200), topics.join(", "), JSON.stringify(clean), p.autoRec === "0" ? "нет" : "да", rec ? JSON.stringify(rec) : "", new Date(), dir];
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return { ok: false, error: "busy" };
  try {
    const hit = mprofRow_(s.code, dir);
    if (hit) sh_("mprof").getRange(hit._row, 1, 1, row.length).setValues([row]); else add_("mprof", row);
    SpreadsheetApp.flush();
    return { ok: true, profile: mprof_(s.code, dir) };
  } finally { lock.releaseLock(); }
}
/** под общим замком: строки листа не сдвинутся между чтением и записью */
function locked_(fn) {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return { ok: false, error: "busy" };
  try { const r = fn(); SpreadsheetApp.flush(); return r; } finally { lock.releaseLock(); }
}
function adminAssignSave_(p) {
  const s = student_(p.code); if (!s) return { ok: false, error: "not_found" };
  const kind = str_(p.kind); if (ASSIGN_KINDS.indexOf(kind) < 0) return { ok: false, error: "bad_request" };
  const params = json_(p.params, null); if (!params || typeof params !== "object") return { ok: false, error: "bad_request" };
  const title = str_(p.title).slice(0, 160); if (!title) return { ok: false, error: "no_title" };
  const id = str_(p.id) || ("as" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  const hit = str_(p.id) ? rows_("assign").find(x => str_(x.r[0]) === id) : null;
  const dir = hit ? mdir_(hit.r[10]) : mathDir_(p.dir);   // направление назначения не меняется
  if (hit && (up_(hit.r[1]) !== s.code || (str_(p.dir) && mathDir_(p.dir) !== dir))) return { ok: false, error: "not_found" };
  const reset = p.reset === "1";   // «дать пройти заново»: статус и результат обнуляются
  const row = [id, s.code, kind, title, JSON.stringify(params).slice(0, 20000), str_(p.due), hit ? hit.r[6] : new Date(), hit && !reset ? (str_(hit.r[7]) || "новое") : "новое", hit && !reset ? str_(hit.r[8]) : "", new Date(), dir];
  if (hit) sh_("assign").getRange(hit._row, 1, 1, row.length).setValues([row]); else add_("assign", row);
  return { ok: true, id };
}
