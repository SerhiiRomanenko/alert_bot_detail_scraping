require("dotenv").config();

const { Telegraf } = require("telegraf");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");
const Groq = require("groq-sdk");
const { GoogleGenAI } = require("@google/genai");
const express = require("express");
const { Redis } = require("@upstash/redis");

// ============================================================
// ⚙️ CONFIG
// ============================================================

const {
  BOT_TOKEN,

  GROQ_API_KEY,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  OPENROUTER_API_KEY,

  API_ID,
  API_HASH,
  PORT,
  SESSION,

  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,

  WAR_SOURCE_CHANNEL,
  WAR_TARGET_CHANNEL,
  WAR_CHECK_INTERVAL,
} = process.env;

// ============================================================
// 🤖 AI CONFIG
// ============================================================

const AI_TIMEOUT = 15000;
const FREE_GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];
const ACTIVE_GEMINI_MODEL =
  FREE_GEMINI_MODELS.includes(GEMINI_MODEL)
    ? GEMINI_MODEL
    : FREE_GEMINI_MODELS[0];

// Скільки разів дозволяємо повторити повідомлення,
// якщо ВСІ AI недоступні.
const MAX_AI_RETRIES = 3;

// Скільки повідомлень брати з каналу.
// Збільшено, щоб не втрачати повідомлення між перевірками.
const WAR_MESSAGES_LIMIT = 20;

// ============================================================
// OPENROUTER
// ============================================================

// OpenRouter сам обирає модель із поточного безкоштовного пулу.
const OPENROUTER_MODELS = [
  "openrouter/free",
];

// Використовуємо лише моделі, для яких Groq показує ліміти Free Plan.
const FREE_GROQ_MODELS = [
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
];

// ============================================================
// TELEGRAM BOT
// ============================================================

if (!BOT_TOKEN) {
  console.log("❌ BOT_TOKEN не заданий");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ============================================================
// GROQ
// ============================================================

const groq = GROQ_API_KEY
  ? new Groq({
      apiKey: GROQ_API_KEY,
    })
  : null;

const gemini = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    })
  : null;

// Поточна модель Groq
let GROQ_MODEL = null;

// Доступні моделі Groq
let GROQ_MODELS = [];

// Індекс поточної моделі
let groqModelIndex = 0;

// Моделі, які вже тимчасово не працюють
const groqBadModels = new Set();

// ============================================================
let geminiDisabled = false;

// ============================================================
// OPENROUTER
// ============================================================

let openRouterDisabled = false;

// ============================================================
// REDIS
// ============================================================

const redis =
  UPSTASH_REDIS_REST_URL &&
  UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: UPSTASH_REDIS_REST_URL,
        token: UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// ============================================================
// WAR CONFIG
// ============================================================

const SOURCE_CHAT =
  WAR_SOURCE_CHANNEL || "kpszsu";

let TARGET_CHAT =
  WAR_TARGET_CHANNEL || "xybc_live";

// Автоматично додаємо @ до username,
// якщо користувач вказав просто xybc_live.
function normalizeTargetChat(value) {
  const text = String(value || "").trim();

  if (!text) {
    return text;
  }

  // numeric chat id
  if (/^-?\d+$/.test(text)) {
    return text;
  }

  // @username
  if (text.startsWith("@")) {
    return text;
  }

  // t.me/username
  if (text.includes("t.me/")) {
    const parts = text.split("t.me/");

    return `@${parts[1].replace("/", "").trim()}`;
  }

  return `@${text}`;
}

TARGET_CHAT =
  normalizeTargetChat(TARGET_CHAT);

const CHECK_INTERVAL =
  Number(WAR_CHECK_INTERVAL) || 60;

// ============================================================
// STATE
// ============================================================

let tgClient = null;

let monitorRunning = false;

let targetChatReady = false;

const aiRetryMap = new Map();

// ============================================================
// LOG CONFIG
// ============================================================

console.log("======================================");
console.log("🤖 AI CONFIG");

console.log(
  "GROQ KEY:",
  GROQ_API_KEY ? "Є" : "НЕМАЄ"
);

console.log(
  "GEMINI KEY:",
  GEMINI_API_KEY ? "Є" : "НЕМАЄ"
);

console.log(
  "OPENROUTER KEY:",
  OPENROUTER_API_KEY ? "Є" : "НЕМАЄ"
);

if (GEMINI_MODEL && !FREE_GEMINI_MODELS.includes(GEMINI_MODEL)) {
  console.log(
    `[GEMINI] Модель ${GEMINI_MODEL} не в безкоштовному списку; використовую ${ACTIVE_GEMINI_MODEL}`
  );
}

console.log(
  "REDIS:",
  redis ? "Є" : "НЕМАЄ"
);

console.log("======================================");

// ============================================================
// 🧠 WAR SYSTEM PROMPT
// ============================================================

const WAR_SYSTEM_PROMPT = `
Ти модеруєш попереджувальний канал для Білоцерківського району.
Визнач, чи повідомлення містить важливу інформацію про повітряну ціль або загрозу для району.

Відповідай YES, якщо є хоча б одна умова:
1. Загроза, ціль, рух БпЛА/ракети/авіації, вибухи або робота ППО в Білоцерківському районі, Білій Церкві чи будь-якій громаді/населеному пункті району.
2. Ціль прямо рухається в напрямку району, через район або до Білої Церкви.
3. Активна повітряна ціль зафіксована в суміжному напрямку: Фастівський чи Обухівський райони Київщини; Уманський чи Звенигородський райони Черкащини; Вінницький район Вінниччини; Бердичівський чи Житомирський райони Житомирщини. Враховуй також назви міст і громад у цих районах. Така ціль може становити потенційну загрозу для Білоцерківського району, навіть якщо його назва ще не згадана.
4. Загроза йде із суміжної області/району в напрямку Київщини або через географічно можливий маршрут до Білоцерківського району.
5. Повідомлення про дорозвідку, відбій або наслідки стосується саме Білоцерківського району чи зазначеної суміжної цілі.

Для суміжних районів оцінюй напрямок і контекст. Не відхиляй повідомлення лише через те, що в ньому згадано Фастів, Васильків, Обухів, Умань, Звенигородку, Вінницю, Бердичів або Житомир. Також не вважай кожну ціль у цих районах автоматично загрозою: якщо повідомлення прямо вказує рух в інший бік або на віддалене місто без можливого маршруту до Білоцерківщини — відповідай NO.

Загальні повідомлення на кшталт «БпЛА в Київській області», «ППО на Київщині», тривога в іншій області, загальноукраїнська балістична загроза без локального напрямку, а також цілі на Київ, Славутич, Бровари, Бориспіль, Ірпінь, Бучу чи Вишгород самі по собі — NO.
Якщо згадано лише сусідню локацію без повітряної цілі, військової загрози чи пов'язаного статусу — NO.

Не вигадуй траєкторію, напрямок чи підтвердження тривоги. Не пояснюй відповідь.
Відповідай РІВНО YES або NO.
`;

// ============================================================
// ⏱️ TIMEOUT
// ============================================================

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,

    new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Timeout ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
    }),
  ]);
}

// ============================================================
// 🧹 YES / NO PARSER
// ============================================================

function parseYesNo(value) {
  if (!value) {
    return null;
  }

  let text = String(value)
    .trim()
    .toUpperCase();

  // Видаляємо think блоки
  text = text.replace(
    /<THINK>[\s\S]*?<\/THINK>/gi,
    " "
  );

  // Видаляємо markdown
  text = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim();

  // Прибираємо лапки
  text = text.replace(
    /[“”"']/g,
    ""
  );

  // Нормалізація пробілів
  text = text.replace(
    /\s+/g,
    " "
  );

  if (text === "YES") {
    return "YES";
  }

  if (text === "NO") {
    return "NO";
  }

  // Якщо модель дала пояснення,
  // шукаємо фінальне рішення.
  const matches =
    text.match(/\b(YES|NO)\b/g);

  if (
    matches &&
    matches.length
  ) {
    return matches[
      matches.length - 1
    ];
  }

  // Українські варіанти
  if (
    /\bТАК\b/i.test(text) &&
    !/\bНІ\b/i.test(text)
  ) {
    return "YES";
  }

  if (
    /\bНІ\b/i.test(text) &&
    !/\bТАК\b/i.test(text)
  ) {
    return "NO";
  }

  return null;
}

// ============================================================
// 🚫 LOCAL HARD FILTER
// ============================================================
//
// Це НЕ замінює AI.
// Він лише відсікає очевидно нерелевантні повідомлення.
// Це захищає від помилок маленьких моделей.
// ============================================================

const LOCAL_POSITIVE_TERMS = [
  "біла церква",
  "білої церкви",
  "білою церквою",
  "білоцерків",
  "білоцерківський",
  "білоцерківська",
  "білоцерківського",
  "білоцерківському",
  "білоцерківщин",
  "білоцерківськ",

];

// Відомі населені пункти/локації,
// які для цього каналу мають значення.
const LOCAL_AREA_TERMS = [
  "сквира",
  "сквир",
  "тараща",
  "таращан",
  "тетієв",
  "тетіїв",
  "узин",
  "володар",
  "гребінк",
  "рокитн",
  "ставищ",
  "ковалів",
  "ковалівк",
  "мала вільшанк",
  "маловільшанк",
  "медвин",
  "медвинськ",
  "пилипч",
  "сидор",
  "скребиш",
  "храпач",
  "фурсів",
  "вільна тарасів",
  "володимирівк",
  "гайок",
  "глибоч",
  "городищ",
  "мазепинц",
  "терезине",
  "фурси",
  "шкарівка",
  "дрозди",
  "пищана",
  "піщана",
  "глушки",
  "сухоліси",
  "томилівка",
  "генеральське",
  "саварка",
];

// Суміжні райони та найближчі населені пункти.
// Їхні повідомлення проходять до AI для оцінки потенційного напрямку загрози.
const NEARBY_RISK_TERMS = [
  "фастівськ",
  "фастів",
  "боярк",
  "глевах",
  "калинів",
  "томашів",
  "чабан",
  "обухівськ",
  "обухів",
  "васильків",
  "кагарлик",
  "ржищів",
  "українк",
  "богуслав",
  "миронів",
  "уманськ",
  "уман",
  "жашків",
  "монастирищ",
  "звенигород",
  "лисянк",
  "шпол",
  "черкаськ",
  "черкащин",
  "вінницьк",
  "вінниччин",
  "вінниц",
  "погребищ",
  "оратів",
  "бердичівськ",
  "бердичів",
  "житомирськ",
  "житомирщин",
  "житомир",
  "попільн",
  "ружин",
];

const THREAT_TERMS = [
  "бпла",
  "бпл",
  "дрон",
  "шахед",
  "ракета",
  "ракет",
  "баліст",
  "авіа",
  "літак",
  "винищ",
  "ппо",
  "вибух",
  "загроз",
  "ціл",
  "тривог",
  "дорозвід",
  "відбій",
  "чисто",
];

const AIR_TARGET_TERMS = [
  "бпла",
  "бпл",
  "дрон",
  "шахед",
  "ракета",
  "ракет",
  "баліст",
  "авіа",
  "літак",
  "винищ",
  "ппо",
  "вибух",
  "тривог",
  "ціл",
  "об'єкт",
  "обʼєкт",
];

// Очевидно інші напрямки.
// Вони самі по собі не означають NO,
// якщо в повідомленні одночасно є
// пряма траєкторія на Білу Церкву.
const OTHER_LOCATIONS = [
  "київ",
  "києва",
  "києві",
  "славутич",
  "бровари",
  "бориспіль",
  "ірпінь",
  "буча",
  "вишгород",
  "обухів",
  "фастів",
];

// ============================================================
// Нормалізація українського тексту
// ============================================================

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hasNearbyRiskArea(text) {
  const normalized = normalizeText(text);

  return NEARBY_RISK_TERMS.some((term) => normalized.includes(term));
}

function hasThreatSignal(text) {
  const normalized = normalizeText(text);

  return THREAT_TERMS.some((term) => normalized.includes(term));
}

function hasAirTargetSignal(text) {
  const normalized = normalizeText(text);

  return AIR_TARGET_TERMS.some((term) => normalized.includes(term));
}

function extractBilaTserkvaLines(text) {
  if (!text) return "";

  const cleaned = text.replace(/\r\n/g, "\n");
  // Повідомлення Повітряних сил часто містить кілька цілей окремими рядками.
  const blocks = cleaned.split(/\n+/g);
  const matchedBlocks = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lower = normalizeText(trimmed);
    const isLocal = hasDirectBilaTserkva(lower) || hasLocalArea(lower);
    const isNearbyThreat = hasNearbyRiskArea(lower) && hasThreatSignal(lower);
    const hasRegionalRoute =
      hasRegionalRouteContext(lower) && hasThreatSignal(lower);

    if (!isLocal && !isNearbyThreat && !hasRegionalRoute) continue;

    // Залишаємо вихідний текст без переписування назв і напрямків.
    const cleanBlock = trimmed.replace(/^🅿️\s*/, "");
    const isRecon = /дорозвід|відбій|чисто/i.test(lower);
    const isNearbyOnly =
      !isLocal &&
      (hasNearbyRiskArea(lower) || hasRegionalRouteContext(lower));

    let prefix = "📍 ";
    if (isNearbyOnly) {
      prefix = "⚠️ Суміжний напрямок: ";
    } else if (isRecon) {
      prefix = /відбій|чисто/i.test(lower) ? "🟢 " : "🔍 ";
    } else if (/баліст/i.test(lower)) {
      prefix = "🚨 ";
    } else if (/реактив|сікер/i.test(lower)) {
      prefix = "❗️ ";
    } else if (/бпла|бпл|дрон/i.test(lower)) {
      prefix = "🛵 ";
    }

    matchedBlocks.push(`${prefix}${cleanBlock}`);
  }

  return matchedBlocks.join("\n\n");
}
// ============================================================
// Чи є пряма згадка Білої Церкви
// ============================================================

function hasDirectBilaTserkva(text) {
  const normalized =
    normalizeText(text);

  return LOCAL_POSITIVE_TERMS.some(
    (term) =>
      normalized.includes(term)
  );
}

// ============================================================
// Чи є локальна локація
// ============================================================

function hasLocalArea(text) {
  const normalized =
    normalizeText(text);

  return LOCAL_AREA_TERMS.some(
    (term) =>
      normalized.includes(term)
  );
}

function hasRegionalRouteContext(text) {
  const normalized = normalizeText(text);
  const hasMovement = /(курс|напрям|руха|летить|пряму|через|у бік|в бік)/i.test(
    normalized
  );
  const hasKyivRegion =
    normalized.includes("київська область") ||
    normalized.includes("київщин") ||
    normalized.includes("київщину");

  const hasLikelyApproachOrigin =
    hasNearbyRiskArea(normalized) ||
    /(?:з|зі|із)\s+(?:південн|західн|південно-західн|південно-східн)/i.test(
      normalized
    );

  return hasMovement && hasKyivRegion && hasLikelyApproachOrigin;
}

// ============================================================
// Жорсткі нерелевантні фрази
// ============================================================

const HARD_NO_PATTERNS = [
  /бпла\s+на\s+славутич/i,
  /бпла\s+на\s+київ/i,
  /бпла\s+на\s+бровари/i,
  /бпла\s+на\s+бориспіль/i,
  /бпла\s+на\s+вишгород/i,
  /бпла\s+на\s+обухів/i,

  /бпла.*славутич/i,
  /дрони.*славутич/i,
  /дрон.*славутич/i,

  /ракети.*на\s+київ/i,
  /ракета.*на\s+київ/i,

];

// ============================================================
// Чи є пряма траєкторія на Білу Церкву
// ============================================================

function hasDirectThreatToBilaTserkva(text) {
  const normalized =
    normalizeText(text);

  if (
    !hasDirectBilaTserkva(
      normalized
    )
  ) {
    return false;
  }

  return hasThreatSignal(normalized);
}

// ============================================================
// LOCAL PRECHECK
// ============================================================

function localPrecheck(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return {
      decision: null,
      reason: "empty",
    };
  }

  // ----------------------------------------------------------
  const isLocal =
    hasDirectBilaTserkva(normalized) || hasLocalArea(normalized);
  const isNearby = hasNearbyRiskArea(normalized);
  const hasThreat = hasThreatSignal(normalized);
  const isReconOrClear = /дорозвід|відбій|чисто/i.test(normalized);

  // Відбій/дорозвідку публікуємо лише для району або перевіряємо AI
  // для суміжної локації. Загальноукраїнські статуси не проходять.
  if (isReconOrClear) {
    if (isLocal) {
      return {
        decision: "YES",
        reason: "local recon/clear status",
      };
    }

    if (isNearby && hasAirTargetSignal(normalized)) {
      return {
        decision: null,
        reason: "nearby-area status candidate",
      };
    }

    return {
      decision: "NO",
      reason: "status without local area",
    };
  }

  // Пряма ціль у районі — надсилаємо без AI.
  if (hasDirectThreatToBilaTserkva(normalized)) {
    return {
      decision: "YES",
      reason: "direct threat to Bila Tserkva district",
    };
  }

  // ----------------------------------------------------------
  // 2. Явна локальна локація
  // ----------------------------------------------------------
  if (isLocal) {
    return {
      decision: null,
      reason: "mentions Bila Tserkva district location",
    };
  }

  // Загрози у суміжних районах/громадах не відкидаємо автоматично.
  // AI вирішує, чи може напрямок становити ризик для Білоцерківщини.
  if (isNearby && hasThreat) {
    return {
      decision: null,
      reason: "nearby-area threat candidate",
    };
  }

  // Транскордонний вектор із суміжного регіону на Київщину оцінює AI.
  if (hasThreat && hasRegionalRouteContext(normalized)) {
    return {
      decision: null,
      reason: "regional approach route candidate",
    };
  }

  // ----------------------------------------------------------
  // 3. Очевидні false positive
  // ----------------------------------------------------------
  for (const pattern of HARD_NO_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        decision: "NO",
        reason: "hard irrelevant location",
      };
    }
  }

  // ----------------------------------------------------------
  // 4. Якщо є тільки загальна Київщина (для звичайних БпЛА/ракет)
  // ----------------------------------------------------------
  const hasKyivRegion =
    normalized.includes("київська область") ||
    normalized.includes("київщин");

  if (hasKyivRegion && hasThreat) {
    return {
      decision: null,
      reason: "Kyiv region threat candidate",
    };
  }

  // ----------------------------------------------------------
  // 5. Інша локація без Білої Церкви
  // ----------------------------------------------------------
  const hasOtherLocation = OTHER_LOCATIONS.some((term) =>
    normalized.includes(term)
  );

  if (hasOtherLocation && hasThreat) {
    return {
      decision: "NO",
      reason: "other location threat",
    };
  }

  // ----------------------------------------------------------
  // Все інше передаємо AI
  // ----------------------------------------------------------
  return {
    decision: null,
    reason: "send to AI",
  };
}

// ============================================================
// 🤖 GROQ MODEL DISCOVERY
// ============================================================

async function initGroqModels() {
  if (!GROQ_API_KEY || !groq) {
    console.log(
      "[GROQ] API key відсутній"
    );

    return false;
  }

  try {
    console.log(
      "[GROQ] Отримуємо список доступних моделей..."
    );

    const response =
      await groq.models.list();

    const models =
      response?.data || [];

    const ids = models
      .map(
        (model) =>
          model?.id
      )
      .filter(Boolean);

    console.log(
      "[GROQ] Доступні моделі:",
      ids.join(", ")
    );

    // Додаємо лише відомі моделі Free Plan, у визначеному порядку.
    const selected = FREE_GROQ_MODELS.filter(
      (model) => ids.includes(model)
    );

    GROQ_MODELS =
      selected;

    if (
      GROQ_MODELS.length === 0
    ) {
      console.log(
        "❌ [GROQ] Немає придатних моделей"
      );

      return false;
    }

    groqModelIndex = 0;

    GROQ_MODEL =
      GROQ_MODELS[
        groqModelIndex
      ];

    console.log(
      `✅ [GROQ] Основна модель: ${GROQ_MODEL}`
    );

    return true;
  } catch (e) {
    console.log(
      `[ERROR] [GROQ] Список моделей: ${e.message}`
    );

    return false;
  }
}

// ============================================================
// 🔄 GROQ NEXT MODEL
// ============================================================

function switchGroqModel() {
  if (
    GROQ_MODELS.length === 0
  ) {
    return null;
  }

  // Поточну модель позначаємо поганою
  if (GROQ_MODEL) {
    groqBadModels.add(
      GROQ_MODEL
    );
  }

  // Шукаємо наступну
  for (
    let i = 0;
    i < GROQ_MODELS.length;
    i++
  ) {
    const index =
      (groqModelIndex + 1 + i) %
      GROQ_MODELS.length;

    const candidate =
      GROQ_MODELS[index];

    if (
      !groqBadModels.has(
        candidate
      )
    ) {
      const previous =
        GROQ_MODEL;

      groqModelIndex =
        index;

      GROQ_MODEL =
        candidate;

      console.log(
        `[GROQ] Перемикаємося з ${previous} → ${GROQ_MODEL}`
      );

      return GROQ_MODEL;
    }
  }

  // Якщо всі моделі вже помічені,
  // починаємо цикл заново.
  groqBadModels.clear();

  groqModelIndex =
    (groqModelIndex + 1) %
    GROQ_MODELS.length;

  GROQ_MODEL =
    GROQ_MODELS[
      groqModelIndex
    ];

  console.log(
    `[GROQ] Усі моделі перевірені. Нове коло: ${GROQ_MODEL}`
  );

  return GROQ_MODEL;
}

// ============================================================
// 🤖 GROQ CLASSIFICATION
// ============================================================

async function classifyWithGroq(
  text
) {
  if (
    !GROQ_API_KEY ||
    !groq ||
    !GROQ_MODEL
  ) {
    return null;
  }

  const model =
    GROQ_MODEL;

  try {
    console.log(
      `[AI] Groq (${model}) — запит...`
    );

    const request = {
      model,

      messages: [
        {
          role: "system",
          content:
            WAR_SYSTEM_PROMPT,
        },

        {
          role: "user",
          content:
            `Повідомлення для перевірки:\n\n${text}`,
        },
      ],

      temperature: 0,

      max_completion_tokens: 64,

      stream: false,
    };

    // --------------------------------------------------------
    // GPT-OSS
    // --------------------------------------------------------
    //
    // Groq офіційно дозволяє include_reasoning:false.
    // Це важливо, бо саме GPT-OSS у тебе повертав
    // порожній content.
    // --------------------------------------------------------

    if (
      model ===
        "openai/gpt-oss-20b" ||
      model ===
        "openai/gpt-oss-120b"
    ) {
      request.include_reasoning =
        false;

      request.reasoning_effort =
        "low";
    }

    // --------------------------------------------------------
    // Qwen
    // --------------------------------------------------------

    if (
      model.startsWith(
        "qwen/"
      )
    ) {
      // Для qwen не передаємо
      // include_reasoning.
    }

    const completion =
      await withTimeout(
        groq.chat.completions.create(
          request
        ),
        AI_TIMEOUT
      );

    const message =
      completion?.choices?.[0]
        ?.message;

    let answer =
      message?.content
        ?.trim() || "";

    // --------------------------------------------------------
    // Додатковий fallback на reasoning.
    // --------------------------------------------------------

    if (
      !answer &&
      message?.reasoning
    ) {
      answer =
        String(
          message.reasoning
        ).trim();
    }

    const parsed =
      parseYesNo(answer);

    console.log(
      "[AI] Groq відповідь:",
      answer || "(порожньо)"
    );

    if (parsed) {
      return parsed;
    }

    throw new Error(
      `Некоректна відповідь: ${
        answer || "(порожньо)"
      }`
    );
  } catch (e) {
    console.log(
      `[ERROR] Groq (${model}): ${e.message}`
    );

    return null;
  }
}

// ============================================================
// 🤖 GROQ WITH AUTOMATIC FALLBACK
// ============================================================

async function classifyWithGroqFallback(
  text
) {
  if (
    !groq ||
    !GROQ_API_KEY ||
    GROQ_MODELS.length === 0
  ) {
    return null;
  }

  const attempts =
    GROQ_MODELS.length;

  for (
    let i = 0;
    i < attempts;
    i++
  ) {
    const result =
      await classifyWithGroq(
        text
      );

    if (
      result === "YES" ||
      result === "NO"
    ) {
      return result;
    }

    // Перемикаємо модель
    // тільки якщо поточна не відповіла.
    switchGroqModel();
  }

  console.log(
    "[GROQ] Усі доступні моделі не дали коректної відповіді"
  );

  return null;
}

// ============================================================
// 🤖 GEMINI
// ============================================================

async function classifyWithGemini(text) {
  if (!gemini || geminiDisabled) {
    return null;
  }

  try {
    console.log(
      `[AI] Gemini (${ACTIVE_GEMINI_MODEL}) — запит...`
    );

    const response = await withTimeout(
      gemini.models.generateContent({
        model: ACTIVE_GEMINI_MODEL,
        contents: `Повідомлення для перевірки:\n\n${text}`,
        config: {
          systemInstruction: WAR_SYSTEM_PROMPT,
          maxOutputTokens: 32,
        },
      }),
      AI_TIMEOUT
    );

    const answer = response?.text?.trim() || "";
    const parsed = parseYesNo(answer);

    console.log(
      "[AI] Gemini відповідь:",
      answer || "(порожньо)"
    );

    if (parsed) {
      return parsed;
    }

    throw new Error(
      `Некоректна відповідь: ${answer || "(порожньо)"}`
    );
  } catch (e) {
    const status = Number(e?.status || e?.code);

    if ([401, 403, 404].includes(status)) {
      geminiDisabled = true;
      console.log(
        "[GEMINI] Вимкнено до перезапуску через помилку ключа або моделі"
      );
    }

    console.log(
      `[ERROR] Gemini (${ACTIVE_GEMINI_MODEL}): ${e.message}`
    );

    return null;
  }
}

// ============================================================
// 🌐 OPENROUTER ONE MODEL
// ============================================================

async function classifyWithOpenRouterModel(
  text,
  model
) {
  if (
    !OPENROUTER_API_KEY ||
    openRouterDisabled
  ) {
    return null;
  }

  try {
    console.log(
      `[AI] OpenRouter (${model}) — запит...`
    );

    const response =
      await withTimeout(
        fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${OPENROUTER_API_KEY}`,

              "HTTP-Referer":
                "https://localhost",

              "X-Title":
                "Bila Tserkva War Monitor",
            },

            body: JSON.stringify({
              model,

              messages: [
                {
                  role: "system",
                  content:
                    WAR_SYSTEM_PROMPT,
                },

                {
                  role: "user",
                  content:
                    `Повідомлення для перевірки:\n\n${text}`,
                },
              ],

              temperature: 0,

              max_tokens: 64,
            }),
          }
        ),
        AI_TIMEOUT
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      // 401/402 — OpenRouter
      // немає сенсу продовжувати.
      if (
        response.status === 401 ||
        response.status === 402
      ) {
        openRouterDisabled =
          true;

        console.log(
          "[OPENROUTER] Вимкнено до перезапуску"
        );

        return null;
      }

      throw new Error(
        `HTTP ${response.status}: ${errorText}`
      );
    }

    const data =
      await response.json();

    const message =
      data?.choices?.[0]
        ?.message;

    console.log(
      "[DEBUG] OpenRouter message:",
      JSON.stringify(
        message || {},
        null,
        2
      )
    );

    let answer =
      message?.content
        ?.trim() || "";

    if (
      !answer &&
      message?.reasoning
    ) {
      answer =
        String(
          message.reasoning
        ).trim();
    }

    const parsed =
      parseYesNo(answer);

    console.log(
      "[AI] OpenRouter відповідь:",
      answer || "(порожньо)"
    );

    if (parsed) {
      return parsed;
    }

    throw new Error(
      `Некоректна відповідь: ${
        answer || "(порожньо)"
      }`
    );
  } catch (e) {
    console.log(
      `[ERROR] OpenRouter (${model}): ${e.message}`
    );

    return null;
  }
}

// ============================================================
// 🌐 OPENROUTER FALLBACK
// ============================================================

async function classifyWithOpenRouter(
  text
) {
  if (
    !OPENROUTER_API_KEY ||
    openRouterDisabled
  ) {
    return null;
  }

  for (
    const model of OPENROUTER_MODELS
  ) {
    const result =
      await classifyWithOpenRouterModel(
        text,
        model
      );

    if (
      result === "YES" ||
      result === "NO"
    ) {
      return result;
    }

    console.log(
      `[OPENROUTER] ${model} не спрацював`
    );
  }

  return null;
}

// ============================================================
// 🤖 AI CLASSIFICATION
// ============================================================

async function classifyWarMessage(
  text
) {
  console.log(
    "[AI] Починаємо класифікацію"
  );

  // ==========================================================
  // 0. LOCAL PRECHECK
  // ==========================================================

  const local =
    localPrecheck(text);

  console.log(
    `[LOCAL] ${local.reason}`
  );

  if (
    local.decision === "NO"
  ) {
    console.log(
      "[LOCAL] Результат: NO"
    );

    return "NO";
  }

  if (
    local.decision === "YES"
  ) {
    console.log(
      "[LOCAL] Результат: YES"
    );

    return "YES";
  }

  // ==========================================================
  // 1. GROQ
  // ==========================================================

  if (
    GROQ_API_KEY &&
    GROQ_MODELS.length > 0
  ) {
    const result =
      await classifyWithGroqFallback(
        text
      );

    if (
      result === "YES" ||
      result === "NO"
    ) {
      console.log(
        `[AI] Результат від Groq: ${result}`
      );

      return result;
    }
  } else {
    console.log(
      "[AI] Groq пропущено — недоступний"
    );
  }

  // ==========================================================
  // 2. GEMINI
  // ==========================================================

  if (gemini && !geminiDisabled) {
    const result = await classifyWithGemini(text);

    if (result === "YES" || result === "NO") {
      console.log(
        `[AI] Результат від Gemini: ${result}`
      );

      return result;
    }
  } else {
    console.log(
      "[AI] Gemini пропущено — ключ відсутній/вимкнений"
    );
  }

  // ==========================================================
  // 3. OPENROUTER
  // ==========================================================

  if (
    OPENROUTER_API_KEY &&
    !openRouterDisabled
  ) {
    const result =
      await classifyWithOpenRouter(
        text
      );

    if (
      result === "YES" ||
      result === "NO"
    ) {
      console.log(
        `[AI] Результат від OpenRouter: ${result}`
      );

      return result;
    }
  } else {
    console.log(
      "[AI] OpenRouter пропущено — недоступний"
    );
  }

  // Не втрачаємо повідомлення про ціль у суміжному районі/напрямку,
  // якщо всі безкоштовні AI недоступні. Пост буде позначений як суміжний напрямок.
  if (
    local.reason === "nearby-area threat candidate" ||
    local.reason === "nearby-area status candidate" ||
    local.reason === "regional approach route candidate"
  ) {
    console.log(
      "[LOCAL] AI недоступні — обережно публікуємо ціль із суміжного району"
    );

    return "YES";
  }

  console.log(
    "[ERROR] Всі доступні AI недоступні"
  );

  return null;
}

// ============================================================
// 💾 REDIS
// ============================================================

async function warGetLastId() {
  if (!redis) {
    console.log(
      "[REDIS] Redis не налаштований — lastId = 0"
    );

    return 0;
  }

  try {
    const val =
      await redis.get(
        "war_monitor:last_message_id"
      );

    const id =
      val !== null &&
      val !== undefined
        ? Number(val)
        : 0;

    console.log(
      `[REDIS] lastId = ${id}`
    );

    return Number.isFinite(id)
      ? id
      : 0;
  } catch (e) {
    console.log(
      `[ERROR] Redis read: ${e.message}`
    );

    return 0;
  }
}

// ============================================================

async function warSaveLastId(
  id
) {
  if (!redis) {
    return;
  }

  try {
    await redis.set(
      "war_monitor:last_message_id",
      Number(id)
    );

    console.log(
      `[REDIS] Збережено lastId = ${id}`
    );
  } catch (e) {
    console.log(
      `[ERROR] Redis write: ${e.message}`
    );
  }
}

// ============================================================
// 🧹 HTML ESCAPE
// ============================================================

function escapeHtml(text) {
  return String(text || "")
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    );
}

// ============================================================
// 🖼 GET IMAGES
// ============================================================

async function getImages(
  client,
  messages
) {
  const images = [];

  for (
    const msg of messages
  ) {
    try {
      let media = null;

      if (msg.photo) {
        media =
          msg.photo;
      } else if (
        msg.media?.photo
      ) {
        media =
          msg.media.photo;
      } else if (
        msg.media?.document
      ) {
        const mime =
          msg.media.document
            .mimeType || "";

        if (
          mime.startsWith(
            "image/"
          )
        ) {
          media =
            msg.media.document;
        }
      }

      if (media) {
        const buffer =
          await client.downloadMedia(
            media
          );

        if (buffer) {
          images.push(
            buffer
          );
        }
      }
    } catch (e) {
      console.log(
        `[ERROR] Download media: ${e.message}`
      );
    }
  }

  return images;
}

// ============================================================
// 📤 PUBLISH — ПУБЛІКАЦІЯ ТІЛЬКИ ЧИСТОГО ТЕКСТУ
// ============================================================

async function warPublish(msg) {
  try {
    let sourceText = msg.message || "";

    // 1. Очищення від футера
    sourceText = sourceText
      .replace(/\s*📡\s*Моніторинг загроз\s*\(\s*https?:\/\/t\.me\/war_monitor\s*\)\s*•[\s\S]*$/i, "")
      .trim();

    // 2. Витягуємо цілісні блоки, що стосуються Білої Церкви
    const extractedText = extractBilaTserkvaLines(sourceText);

    // Страховка: якщо з якоїсь причини екстракція повернула порожній рядок
    const finalText = extractedText || sourceText;

    const safeText = escapeHtml(finalText);

    if (!safeText) {
      console.log("[PUBLISH] Порожній текст після очищення — пропуск");
      return false;
    }

    // 3. Відправка в Telegram
    await bot.telegram.sendMessage(TARGET_CHAT, safeText, {
      parse_mode: "HTML",
    });

    console.log("[PUBLISH] Text posted to", TARGET_CHAT);
    return true;

  } catch (e) {
    console.log(`[ERROR] Telegram publish: ${e.message}`);
    return false;
  }
}

// ============================================================
// 🔎 CHECK TARGET CHAT
// ============================================================

async function checkTargetChat() {
  console.log(
    "======================================"
  );

  console.log(
    `[TELEGRAM] Перевіряємо цільовий чат: ${TARGET_CHAT}`
  );

  try {
    const chat =
      await bot.telegram.getChat(
        TARGET_CHAT
      );

    console.log(
      "✅ [TELEGRAM] Цільовий чат знайдено"
    );

    console.log(
      `[TELEGRAM] Назва: ${
        chat?.title ||
        chat?.username ||
        "без назви"
      }`
    );

    console.log(
      `[TELEGRAM] ID: ${chat?.id}`
    );

    if (
      chat?.type ===
      "channel"
    ) {
      console.log(
        "✅ [TELEGRAM] Це канал"
      );
    } else {
      console.log(
        `[TELEGRAM] Тип: ${chat?.type}`
      );
    }

    targetChatReady =
      true;

    // --------------------------------------------------------
    // Перевіряємо права бота.
    // --------------------------------------------------------

    try {
      const me =
        await bot.telegram.getMe();

      const member =
        await bot.telegram.getChatMember(
          chat.id,
          me.id
        );

      console.log(
        `[TELEGRAM] Bot status: ${member?.status}`
      );

      if (
        member?.status ===
          "left" ||
        member?.status ===
          "kicked"
      ) {
        targetChatReady =
          false;

        console.log(
          "❌ Бот не є учасником цільового каналу"
        );
      }

      if (
        member?.status ===
        "administrator"
      ) {
        console.log(
          "✅ Бот є адміністратором каналу"
        );
      }

      if (
        member?.status ===
        "creator"
      ) {
        console.log(
          "✅ Бот є власником каналу"
        );
      }
    } catch (e) {
      console.log(
        `[WARN] Не вдалося перевірити статус бота: ${e.message}`
      );

      // Сам getChat вже успішний,
      // тому залишаємо ready.
    }

    return targetChatReady;
  } catch (e) {
    targetChatReady =
      false;

    console.log(
      `[ERROR] [TELEGRAM] Target chat: ${e.message}`
    );

    console.log(
      `❌ Перевірте ${TARGET_CHAT}`
    );

    console.log(
      "❌ Бот повинен бути доданий у канал і мати право публікувати"
    );

    return false;
  }
}

// ============================================================
// 🔎 WAR MONITOR
// ============================================================

async function runWarMonitor() {
  if (monitorRunning) {
    console.log(
      "[WAR] Попередня перевірка ще працює — пропуск"
    );

    return;
  }

  if (!tgClient) {
    console.log(
      "[WAR] Telegram client ще не готовий"
    );

    return;
  }

  monitorRunning =
    true;

  console.log(
    "======================================"
  );

  console.log(
    "[WAR] ▶ Початок перевірки"
  );

  try {
    // ========================================================
    // LAST ID
    // ========================================================

    const lastId =
      await warGetLastId();

    console.log(
      "[WAR] 1. Останній ID:",
      lastId
    );

    // ========================================================
    // ENTITY
    // ========================================================

    console.log(
      "[WAR] 2. Отримуємо entity:",
      SOURCE_CHAT
    );

    const entity =
      await tgClient.getEntity(
        SOURCE_CHAT
      );

    console.log(
      "[WAR] 3. Entity отримано"
    );

    // ========================================================
    // MESSAGES
    // ========================================================

    console.log(
      "[WAR] 4. Отримуємо повідомлення..."
    );

    const messages =
      await tgClient.getMessages(
        entity,
        {
          limit:
            WAR_MESSAGES_LIMIT,
        }
      );

    console.log(
      "[WAR] 5. Отримано повідомлень:",
      messages.length
    );

    // ========================================================
    // OLD → NEW
    // ========================================================

    const sortedMessages =
      messages
        .filter(Boolean)
        .sort(
          (a, b) =>
            Number(a.id) -
            Number(b.id)
        );

    for (
      const msg of sortedMessages
    ) {
      try {
        const msgId =
          Number(msg.id);

        if (
          !Number.isFinite(
            msgId
          )
        ) {
          continue;
        }

        // ====================================================
        // OLD
        // ====================================================

        if (
          msgId <= lastId
        ) {
          continue;
        }

        console.log("");
        console.log(
          `[WAR] Нове повідомлення #${msgId}`
        );

        const textForAI =
          msg.message || "";

        // ====================================================
        // EMPTY MESSAGE
        // ====================================================

        if (
          !textForAI ||
          !textForAI.trim()
        ) {
          console.log(
            `[SKIP] #${msgId} немає тексту`
          );

          // Якщо це просто порожнє повідомлення
          // без media — можна зберегти.
          const hasMedia =
            !!msg.photo ||
            !!msg.video ||
            !!msg.media?.photo ||
            !!msg.media?.document;

          if (!hasMedia) {
            await warSaveLastId(
              msgId
            );
          }

          continue;
        }

        // ====================================================
        // RETRY
        // ====================================================

        const retryCount =
          aiRetryMap.get(
            msgId
          ) || 0;

        console.log(
          `[AI] #${msgId} Спроба ${
            retryCount + 1
          }/${MAX_AI_RETRIES}`
        );

        // ====================================================
        // CLASSIFY
        // ====================================================

        const result =
          await classifyWarMessage(
            textForAI
          );

        // ====================================================
        // YES
        // ====================================================

        if (
          result === "YES"
        ) {
          console.log(
            `[AI] #${msgId} Результат: YES`
          );

          const published =
            await warPublish(
              msg
            );

          if (
            published
          ) {
            await warSaveLastId(
              msgId
            );

            aiRetryMap.delete(
              msgId
            );

            console.log(
              `[WAR] #${msgId} Опубліковано`
            );
          } else {
            // ------------------------------------------------
            // ВАЖЛИВО:
            // НЕ зберігаємо lastId.
            // Повідомлення буде повторно перевірене.
            // ------------------------------------------------

            console.log(
              `[WAR] #${msgId} Не вдалося опублікувати — залишаємо для повтору`
            );
          }

          continue;
        }

        // ====================================================
        // NO
        // ====================================================

        if (
          result === "NO"
        ) {
          console.log(
            `[AI] #${msgId} Результат: NO`
          );

          console.log(
            `[SKIP] #${msgId} Не стосується Білої Церкви`
          );

          await warSaveLastId(
            msgId
          );

          aiRetryMap.delete(
            msgId
          );

          continue;
        }

        // ====================================================
        // AI ERROR
        // ====================================================

        const nextRetry =
          retryCount + 1;

        if (
          nextRetry >=
          MAX_AI_RETRIES
        ) {
          console.log(
            `[ERROR] #${msgId} AI не відповів ${MAX_AI_RETRIES} рази`
          );

          console.log(
            `[SKIP] #${msgId} Пропускаємо після ліміту повторів`
          );

          await warSaveLastId(
            msgId
          );

          aiRetryMap.delete(
            msgId
          );
        } else {
          aiRetryMap.set(
            msgId,
            nextRetry
          );

          console.log(
            `[RETRY] #${msgId} AI недоступні. Повторимо наступною перевіркою.`
          );
        }

        // ====================================================
        // SMALL DELAY
        // ====================================================

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              500
            )
        );
      } catch (e) {
        console.log(
          `[ERROR] Обробка повідомлення #${msg?.id}: ${e.message}`
        );
      }
    }

    console.log(
      "[WAR] ✔ Перевірка завершена"
    );
  } catch (e) {
    console.log(
      `[ERROR] WAR MONITOR: ${e.message}`
    );
  } finally {
    monitorRunning =
      false;
  }
}

// ============================================================
// 🌐 EXPRESS SERVER
// ============================================================

const app =
  express();

app.get(
  "/",
  (req, res) => {
    res.send(
      "Бот працює 🚀"
    );
  }
);

app.listen(
  PORT || 3000,
  () => {
    console.log(
      `🌐 Server started on port ${
        PORT || 3000
      }`
    );
  }
);

// ============================================================
// ▶️ START
// ============================================================

(async () => {
  try {
    // ========================================================
    // CHECK ENV
    // ========================================================

    if (
      !API_ID ||
      !API_HASH
    ) {
      throw new Error(
        "API_ID або API_HASH не задані"
      );
    }

    // ========================================================
    // TELEGRAM USER CLIENT
    // ========================================================

    const client =
      new TelegramClient(
        new StringSession(
          SESSION || ""
        ),
        Number(API_ID),
        API_HASH,
        {
          connectionRetries: 5,
        }
      );

    await client.start({
      phoneNumber:
        async () =>
          await input.text(
            "📱 Phone: "
          ),

      password:
        async () =>
          await input.text(
            "🔐 2FA: "
          ),

      phoneCode:
        async () =>
          await input.text(
            "📩 Code: "
          ),

      onError:
        (err) =>
          console.log(
            "❌ Telegram:",
            err
          ),
    });

    tgClient =
      client;

    console.log(
      "✅ Telegram connected"
    );

    console.log(
      "✅ Telegram session loaded"
    );

    // ========================================================
    // GROQ MODELS
    // ========================================================

    await initGroqModels();

    // ========================================================
    // AI STATUS
    // ========================================================

    console.log(
      "======================================"
    );

    console.log(
      "🤖 AI STATUS"
    );

    console.log(
      "Groq:",
      GROQ_MODEL
        ? `READY (${GROQ_MODEL})`
        : "OFF"
    );

    console.log(
      "Groq models:",
      GROQ_MODELS.length
        ? GROQ_MODELS.join(
            ", "
          )
        : "NONE"
    );

    console.log(
      "Gemini:",
      gemini && !geminiDisabled
        ? `READY (${ACTIVE_GEMINI_MODEL})`
        : "OFF"
    );

    console.log(
      "OpenRouter:",
      OPENROUTER_API_KEY
        ? "READY (fallback)"
        : "OFF"
    );

    console.log(
      "Redis:",
      redis
        ? "READY"
        : "OFF"
    );

    console.log(
      "======================================"
    );

    // ========================================================
    // TARGET CHAT CHECK
    // ========================================================

    await checkTargetChat();

    // ========================================================
    // WAR MONITOR
    // ========================================================

    if (
      WAR_SOURCE_CHANNEL &&
      WAR_TARGET_CHANNEL
    ) {
      console.log(
        "[WAR] Монітор запущено"
      );

      console.log(
        `[WAR] Джерело: ${SOURCE_CHAT}`
      );

      console.log(
        `[WAR] Призначення: ${TARGET_CHAT}`
      );

      console.log(
        `[WAR] Інтервал: ${CHECK_INTERVAL}с`
      );

      console.log(
        "======================================"
      );

      // Перша перевірка
      await runWarMonitor();

      // Наступні
      setInterval(
        runWarMonitor,
        CHECK_INTERVAL *
          1000
      );
    } else {
      console.log(
        "[WAR] ❌ WAR_SOURCE_CHANNEL або WAR_TARGET_CHANNEL не задано"
      );
    }
  } catch (e) {
    console.log(
      `[FATAL] ${e.message}`
    );
  }
})();
