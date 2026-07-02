// Логика обучающего теста. Без бэкенда — всё состояние в памяти + localStorage
// для истории попыток и имени сотрудника. Результат отправляется напрямую
// в Telegram Bot API из браузера (см. telegram-config.js).

const LS_KEY = "skybud_quiz_history_v1";
const LS_NAME_KEY = "skybud_quiz_name_v1";

// Разворачиваем секции в плоский список вопросов (с привязкой к секции) для прогресс-бара.
const FLAT = QUIZ_DATA.sections.flatMap((sec) =>
  sec.questions.map((q) => ({ ...q, sectionId: sec.id, sectionTitle: sec.title }))
);

const state = {
  employeeName: "",
  current: 0,
  answers: new Array(FLAT.length).fill(null), // выбранный индекс ответа
  locked: false,
};

const root = document.getElementById("app");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function saveAttempt(scorePercent, passed) {
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(LS_KEY)) || [];
  } catch (e) {
    history = [];
  }
  history.push({ date: new Date().toISOString(), score: scorePercent, passed, name: state.employeeName });
  localStorage.setItem(LS_KEY, JSON.stringify(history.slice(-10)));
}

function lastAttempt() {
  try {
    const h = JSON.parse(localStorage.getItem(LS_KEY)) || [];
    return h[h.length - 1] || null;
  } catch (e) {
    return null;
  }
}

// --- Экран 0: имя сотрудника ---
function renderNameEntry() {
  const savedName = localStorage.getItem(LS_NAME_KEY) || "";
  const [savedLast, savedFirst] = savedName.split(" ");

  root.innerHTML = `
    <div class="card start-card">
      <img class="logo" src="assets/skybud-logo.svg" alt="SkyBud">
      <h1>${QUIZ_DATA.title}</h1>
      <p class="muted">Перед началом введите фамилию и имя — они попадут в результат теста.</p>
      <div class="name-form">
        <input type="text" id="lastName" class="text-input" placeholder="Фамилия" value="${escapeHtml(savedLast || "")}">
        <input type="text" id="firstName" class="text-input" placeholder="Имя" value="${escapeHtml(savedFirst || "")}">
        <p class="error" id="nameError" hidden>Заполните фамилию и имя</p>
      </div>
      <button class="btn primary" id="confirmNameBtn">Подтвердить</button>
    </div>
  `;

  const goNext = () => {
    const last = document.getElementById("lastName").value.trim();
    const first = document.getElementById("firstName").value.trim();
    if (!last || !first) {
      document.getElementById("nameError").hidden = false;
      return;
    }
    state.employeeName = `${last} ${first}`;
    localStorage.setItem(LS_NAME_KEY, state.employeeName);
    renderStart();
  };

  document.getElementById("confirmNameBtn").addEventListener("click", goNext);
  root.querySelectorAll(".text-input").forEach((inp) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") goNext();
    });
  });
}

function renderStart() {
  const last = lastAttempt();
  const sectionsList = QUIZ_DATA.sections
    .map((s) => `<li><span class="dot"></span>${s.title} <em>(${s.questions.length} вопр.)</em></li>`)
    .join("");

  root.innerHTML = `
    <div class="card start-card">
      <img class="logo" src="assets/skybud-logo.svg" alt="SkyBud">
      <h1>${QUIZ_DATA.title}</h1>
      <p class="muted">Сотрудник: <strong>${escapeHtml(state.employeeName)}</strong> · <a href="#" id="changeNameLink">сменить</a></p>
      <p class="muted">Пройдите тест по шагам приложения. Проходной балл — <strong>${QUIZ_DATA.passingScore}%</strong>.</p>
      <ul class="section-list">${sectionsList}</ul>
      ${
        last
          ? `<p class="muted last-attempt">Последняя попытка: <strong class="${last.passed ? "ok" : "bad"}">${last.score}%</strong> ${last.passed ? "— пройдено ✅" : "— не пройдено"}</p>`
          : ""
      }
      <button class="btn primary" id="startBtn">Начать тест (${FLAT.length} вопросов)</button>
    </div>
  `;
  document.getElementById("startBtn").addEventListener("click", () => {
    state.current = 0;
    state.answers = new Array(FLAT.length).fill(null);
    renderQuestion();
  });
  document.getElementById("changeNameLink").addEventListener("click", (e) => {
    e.preventDefault();
    renderNameEntry();
  });
}

function renderQuestion() {
  state.locked = false;
  const idx = state.current;
  const q = FLAT[idx];
  const progressPct = Math.round((idx / FLAT.length) * 100);

  const imgHtml = q.screenshot
    ? `<div class="shot"><img src="${q.screenshot}" alt="screen"></div>`
    : `<div class="shot no-shot">
         <div class="hint-icon">${q.hintIcon || "📄"}</div>
         <div class="hint-label">${escapeHtml(q.hintLabel || "Вопрос по тексту регламента")}</div>
       </div>`;

  const optionsHtml = q.options
    .map(
      (opt, i) => `<button class="option" data-i="${i}">${opt}</button>`
    )
    .join("");

  root.innerHTML = `
    <div class="card quiz-card">
      <div class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" style="width:${progressPct}%"></div></div>
        <div class="progress-label">Вопрос ${idx + 1} из ${FLAT.length} · ${q.sectionTitle}</div>
      </div>
      <div class="question-row">
        ${imgHtml}
        <div class="qa">
          <p class="question-text">${q.question}</p>
          <div class="options">${optionsHtml}</div>
          <div class="explanation" id="explanation" hidden></div>
          <button class="btn primary" id="nextBtn" hidden>${idx === FLAT.length - 1 ? "Завершить тест" : "Далее →"}</button>
        </div>
      </div>
    </div>
  `;

  root.querySelectorAll(".option").forEach((btn) => {
    btn.addEventListener("click", () => selectAnswer(Number(btn.dataset.i)));
  });
  document.getElementById("nextBtn").addEventListener("click", () => {
    if (state.current === FLAT.length - 1) {
      renderResults();
    } else {
      state.current += 1;
      renderQuestion();
    }
  });
}

function selectAnswer(i) {
  if (state.locked) return;
  state.locked = true;
  const idx = state.current;
  const q = FLAT[idx];
  state.answers[idx] = i;

  root.querySelectorAll(".option").forEach((btn, bi) => {
    btn.disabled = true;
    if (bi === q.correct) btn.classList.add("correct");
    if (bi === i && i !== q.correct) btn.classList.add("wrong");
  });

  const expBox = document.getElementById("explanation");
  expBox.hidden = false;
  expBox.className = "explanation " + (i === q.correct ? "ok" : "bad");
  expBox.innerHTML = (i === q.correct ? "✅ Верно. " : "❌ Неверно. ") + q.explanation;

  document.getElementById("nextBtn").hidden = false;
}

// --- Отправка результата в Telegram напрямую из браузера ---
function buildTelegramMessage(correctCount, total, scorePercent, passed, missed) {
  const dt = new Date().toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  let text = `📋 <b>Результат теста</b> · ${escapeHtml(QUIZ_DATA.title)}\n\n`;
  text += `👤 ${escapeHtml(state.employeeName || "Без имени")}\n`;
  text += `📊 ${correctCount} / ${total} (${scorePercent}%)\n`;
  text += `${passed ? "✅ Пройдено" : "❌ Не пройдено"} (порог ${QUIZ_DATA.passingScore}%)\n`;
  text += `🕐 ${dt}\n`;
  if (missed.length) {
    text += `\n<b>Ошибки (${missed.length}):</b>\n`;
    missed.forEach((m, i) => {
      text += `${i + 1}. ${escapeHtml(m.q.question)}\n   → верно: ${escapeHtml(m.q.options[m.q.correct])}\n`;
    });
  }
  if (text.length > 3800) {
    text = text.slice(0, 3800) + "\n… (список сокращён)";
  }
  return text;
}

async function sendResultToTelegram(text) {
  const cfg = window.TELEGRAM_CONFIG;
  if (!cfg || !cfg.botToken || cfg.botToken.includes("ВСТАВЬТЕ")) {
    return { ok: false, reason: "not_configured" };
  }
  try {
    const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: "HTML" }),
    });
    const data = await res.json();
    return { ok: data.ok === true, raw: data };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

function renderResults() {
  const total = FLAT.length;
  let correctCount = 0;
  const missed = [];
  FLAT.forEach((q, i) => {
    if (state.answers[i] === q.correct) correctCount += 1;
    else missed.push({ q, given: state.answers[i] });
  });
  const scorePercent = Math.round((correctCount / total) * 100);
  const passed = scorePercent >= QUIZ_DATA.passingScore;
  saveAttempt(scorePercent, passed);

  const missedHtml = missed.length
    ? `<div class="missed">
        <h3>Вопросы, требующие повторения:</h3>
        ${missed
          .map(
            (m) => `<div class="missed-item">
              <p class="q">${m.q.question}</p>
              <p class="a">Правильный ответ: <strong>${m.q.options[m.q.correct]}</strong></p>
              <p class="exp">${m.q.explanation}</p>
            </div>`
          )
          .join("")}
      </div>`
    : `<p class="ok muted">Все ответы верные — отлично!</p>`;

  root.innerHTML = `
    <div class="card results-card">
      <h1 class="${passed ? "ok" : "bad"}">${passed ? "✅ Тест пройден" : "❌ Тест не пройден"}</h1>
      <p class="muted">Сотрудник: <strong>${escapeHtml(state.employeeName)}</strong></p>
      <p class="score-big">${correctCount} / ${total} (${scorePercent}%)</p>
      <p class="muted">Проходной балл: ${QUIZ_DATA.passingScore}%</p>
      <p class="muted" id="sendStatus">Отправка результата администратору…</p>
      ${missedHtml}
      <button class="btn primary" id="retryBtn">Пройти заново</button>
    </div>
  `;
  document.getElementById("retryBtn").addEventListener("click", renderStart);

  const message = buildTelegramMessage(correctCount, total, scorePercent, passed, missed);
  sendResultToTelegram(message).then((r) => {
    const status = document.getElementById("sendStatus");
    if (!status) return; // пользователь уже ушёл с экрана результатов
    if (r.ok) {
      status.textContent = "Результат отправлен администратору ✅";
      status.classList.add("ok");
    } else if (r.reason === "not_configured") {
      status.textContent = "Отправка не настроена (заполните telegram-config.js)";
      status.classList.add("bad");
    } else {
      status.textContent = "Не удалось отправить результат администратору ⚠️";
      status.classList.add("bad");
    }
  });
}

if (localStorage.getItem(LS_NAME_KEY)) {
  state.employeeName = localStorage.getItem(LS_NAME_KEY);
  renderStart();
} else {
  renderNameEntry();
}
