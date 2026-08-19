// require("dotenv").config();

// const { Telegraf } = require("telegraf");
// const { TelegramClient } = require("telegram");
// const { StringSession } = require("telegram/sessions");
// const input = require("input");
// const Groq = require("groq-sdk");
// const express = require("express");
// const { Redis } = require("@upstash/redis");

// const {
//   BOT_TOKEN,
//   GROQ_API_KEY,
//   OPENROUTER_API_KEY,
//   API_ID,
//   API_HASH,
//   PORT,
//   SESSION,
//   UPSTASH_REDIS_REST_URL,
//   UPSTASH_REDIS_REST_TOKEN,
//   WAR_SOURCE_CHANNEL,
//   WAR_TARGET_CHANNEL,
//   WAR_CHECK_INTERVAL,
// } = process.env;

// const bot = new Telegraf(BOT_TOKEN);
// const groq = new Groq({ apiKey: GROQ_API_KEY });

// const redis = new Redis({
//   url: UPSTASH_REDIS_REST_URL,
//   token: UPSTASH_REDIS_REST_TOKEN,
// });
// console.log("GROQ KEY:", process.env.GROQ_API_KEY ? "Є" : "НЕМАЄ");
// let tgClient;

// // ======================
// // 📡 TELEGRAM CLIENT
// // ======================

// async function initClient() {
//   const client = new TelegramClient(
//     new StringSession(SESSION || ""),
//     Number(API_ID),
//     API_HASH,
//     {
//       connectionRetries: 5,
//     }
//   );

//   await client.start({
//     phoneNumber: async () => await input.text("📱 Phone: "),
//     password: async () => await input.text("🔐 2FA: "),
//     phoneCode: async () => await input.text("📩 Code: "),
//     onError: (err) => console.log("❌ Telegram:", err),
//   });

//   console.log("✅ Telegram connected");
// console.log("✅ Telegram session loaded");

//   return client;
// }

// // ======================
// // 🖼 MEDIA
// // ======================

// async function getImages(client, messages) {
//   const images = [];

//   for (const msg of messages) {
//     try {
//       let media;

//       if (msg.photo) {
//         media = msg.photo;
//       } else if (msg.media?.photo) {
//         media = msg.media.photo;
//       } else if (msg.media?.document) {
//         const mime = msg.media.document.mimeType || "";

//         if (mime.startsWith("image/")) {
//           media = msg.media.document;
//         }
//       }

//       if (media) {
//         const buffer = await client.downloadMedia(media);

//         if (buffer) {
//           images.push(buffer);
//         }
//       }
//     } catch (e) {
//       console.log(`[ERROR] Download media: ${e.message}`);
//     }
//   }

//   return images;
// }

// // ======================
// // ⚠️ WAR MONITOR
// // ======================

// const SOURCE_CHAT = WAR_SOURCE_CHANNEL || "war_monitor";
// const TARGET_CHAT = WAR_TARGET_CHANNEL || "xybc_live";

// const WAR_SYSTEM_PROMPT = `
// Ти модератор локального Telegram-каналу Білої Церкви.

// Твоє завдання — визначити, чи стосується надане повідомлення безпосередньо Білої Церкви, Білоцерківської громади, Білоцерківського району або безпосередньої загрози для Білої Церкви.

// Вважати релевантним (YES):

// - Біла Церква
// - Білоцерківська громада
// - Білоцерківський район
// - Події безпосередньо у Білій Церкві
// - Повітряні тривоги у Білій Церкві
// - Вибухи у Білій Церкві
// - Робота ППО над Білою Церквою
// - Ракети/БпЛА, що рухаються на Білу Церкву
// - Безпосередня загроза для Білої Церкви
// - Наслідки ударів у Білій Церкві
// - Події, що безпосередньо стосуються мешканців Білої Церкви
// - Населені пункти Білоцерківської громади/району, якщо подія стосується їх

// НЕ вважати релевантним (NO):

// - Київ загалом
// - Київська область загалом без конкретного зв'язку з Білою Церквою
// - Україна загалом
// - Інші міста/райони Київської області
// - "ППО працює в Київській області" без згадки Білої Церкви
// - "Тривога по всій Київській області" без конкретики

// Відповідай ТІЛЬКИ одним словом: YES або NO.
// `;

// // ======================
// // 🤖 AI CLASSIFICATION
// // ======================

// async function classifyWarMessage(text) {
//   // ======================
//   // 🤖 GROQ — ОСНОВНИЙ
//   // ======================

//   console.log(
//     "[AI] GROQ_API_KEY:",
//     GROQ_API_KEY ? "Є" : "НЕМАЄ"
//   );

//   if (GROQ_API_KEY) {
//     try {
//       console.log("[AI] Запит до Groq...");

//       const completion = await groq.chat.completions.create({
//         model: "llama-3.3-70b-versatile",

//         messages: [
//           {
//             role: "system",
//             content: WAR_SYSTEM_PROMPT,
//           },
//           {
//             role: "user",
//             content: text,
//           },
//         ],

//         temperature: 0.1,
//         max_tokens: 8,
//       });

//       const answer =
//         completion.choices?.[0]?.message?.content
//           ?.trim()
//           ?.toUpperCase();

//       console.log("[AI] Groq відповідь:", answer);

//       if (answer === "YES" || answer === "NO") {
//         return answer;
//       }

//       console.log(
//         "[AI] Groq повернув не YES/NO — переходимо на OpenRouter"
//       );

//     } catch (e) {
//       console.log(
//         "[ERROR] Groq:",
//         e.message
//       );

//       if (e.response?.data) {
//         console.log(
//           "[ERROR] Groq details:",
//           e.response.data
//         );
//       }
//     }
//   } else {
//     console.log(
//       "[AI] GROQ_API_KEY відсутній — переходимо на OpenRouter"
//     );
//   }

//   // ======================
//   // 🌐 OPENROUTER — FALLBACK
//   // ======================

//   if (OPENROUTER_API_KEY) {
//     try {
//       console.log(
//         "[AI] Запит до OpenRouter..."
//       );

//       const response = await fetch(
//         "https://openrouter.ai/api/v1/chat/completions",
//         {
//           method: "POST",

//           headers: {
//             "Content-Type": "application/json",
//             Authorization:
//               `Bearer ${OPENROUTER_API_KEY}`,
//           },

//           body: JSON.stringify({
//             model:
//               "meta-llama/llama-3.3-70b-instruct",

//             messages: [
//               {
//                 role: "system",
//                 content: WAR_SYSTEM_PROMPT,
//               },
//               {
//                 role: "user",
//                 content: text,
//               },
//             ],

//             temperature: 0.1,
//             max_tokens: 8,
//           }),
//         }
//       );

//       if (!response.ok) {
//         const errorText = await response.text();

//         throw new Error(
//           `HTTP ${response.status}: ${errorText}`
//         );
//       }

//       const data = await response.json();

//       const answer =
//         data.choices?.[0]?.message?.content
//           ?.trim()
//           ?.toUpperCase();

//       console.log(
//         "[AI] OpenRouter відповідь:",
//         answer
//       );

//       if (answer === "YES" || answer === "NO") {
//         return answer;
//       }

//     } catch (e) {
//       console.log(
//         "[ERROR] OpenRouter:",
//         e.message
//       );
//     }
//   }

//   console.log(
//     "[ERROR] Обидва AI недоступні"
//   );

//   return null;
// }

// // ======================
// // 💾 REDIS
// // ======================

// async function warGetLastId() {
//   try {
//     const val = await redis.get("war_monitor:last_message_id");

//     return val ? Number(val) : 0;
//   } catch (e) {
//     console.log(`[ERROR] Redis read: ${e.message}`);

//     return 0;
//   }
// }

// async function warSaveLastId(id) {
//   try {
//     await redis.set("war_monitor:last_message_id", id);
//   } catch (e) {
//     console.log(`[ERROR] Redis write: ${e.message}`);
//   }
// }

// // ======================
// // 📤 PUBLISH
// // ======================

// async function warPublish(msg) {
//   try {
//     const sourceText = msg.message || "";

//     const timestamp = new Date(msg.date * 1000).toLocaleString(
//       "uk-UA",
//       {
//         day: "2-digit",
//         month: "2-digit",
//         year: "numeric",
//         hour: "2-digit",
//         minute: "2-digit",
//       }
//     );

//     const footer =
//       `\n\n📡 <a href="https://t.me/war_monitor">Моніторинг загроз</a> • ${timestamp}`;

//     const fullText = sourceText
//       ? `${sourceText}${footer}`
//       : `📡 <a href="https://t.me/war_monitor">Моніторинг загроз</a> • ${timestamp}`;

//     // ======================
//     // 🎥 ВІДЕО
//     // ======================

//     if (msg.video) {
//       try {
//         const video = await tgClient.downloadMedia(msg.video);

//         await bot.telegram.sendVideo(
//           TARGET_CHAT,
//           {
//             source: video,
//           },
//           {
//             caption: fullText,
//             parse_mode: "HTML",
//           }
//         );

//         console.log(
//           "[PUBLISH] Video posted to",
//           TARGET_CHAT
//         );

//         return true;
//       } catch (e) {
//         console.log(
//           `[ERROR] Video publish: ${e.message}`
//         );
//       }
//     }

//     // ======================
//     // 🖼 ФОТО
//     // ======================

//     const images = await getImages(tgClient, [msg]);

//     if (images.length === 1) {
//       await bot.telegram.sendPhoto(
//         TARGET_CHAT,
//         {
//           source: images[0],
//         },
//         {
//           caption: fullText,
//           parse_mode: "HTML",
//         }
//       );

//       console.log(
//         "[PUBLISH] Photo posted to",
//         TARGET_CHAT
//       );

//       return true;
//     }

//     // ======================
//     // 🖼🖼 КІЛЬКА ФОТО
//     // ======================

//     if (images.length > 1) {
//       const mediaGroup = images.map((img, i) => ({
//         type: "photo",
//         media: {
//           source: img,
//         },
//         caption: i === 0 ? fullText : undefined,
//         parse_mode: "HTML",
//       }));

//       await bot.telegram.sendMediaGroup(
//         TARGET_CHAT,
//         mediaGroup
//       );

//       console.log(
//         "[PUBLISH] MediaGroup posted to",
//         TARGET_CHAT
//       );

//       return true;
//     }

//     // ======================
//     // 📝 ТІЛЬКИ ТЕКСТ
//     // ======================

//     await bot.telegram.sendMessage(
//       TARGET_CHAT,
//       fullText,
//       {
//         parse_mode: "HTML",
//       }
//     );

//     console.log(
//       "[PUBLISH] Text posted to",
//       TARGET_CHAT
//     );

//     return true;
//   } catch (e) {
//     console.log(
//       `[ERROR] Telegram publish: ${e.message}`
//     );

//     return false;
//   }
// }

// // ======================
// // 🔎 WAR MONITOR
// // ======================

// async function runWarMonitor() {
//   console.log("[WAR] ▶ Початок перевірки");

//   try {
//     console.log("[WAR] 1. Читаємо останній ID...");

//     const lastId = await warGetLastId();

//     console.log(
//       "[WAR] 2. Останній ID:",
//       lastId
//     );

//     console.log(
//       "[WAR] 3. Отримуємо entity:",
//       SOURCE_CHAT
//     );

//     const entity = await tgClient.getEntity(
//       SOURCE_CHAT
//     );

//     console.log("[WAR] 4. Entity отримано");

//     console.log(
//       "[WAR] 5. Отримуємо повідомлення..."
//     );

//     const messages = await tgClient.getMessages(
//       entity,
//       {
//         limit: 10,
//       }
//     );

//     console.log(
//       "[WAR] 6. Отримано повідомлень:",
//       messages.length
//     );

//     for (const msg of messages.filter(Boolean)) {
//       try {
//         const msgId = Number(msg.id);

//         console.log(
//           `[WAR] Повідомлення #${msgId}`
//         );

//         if (msgId <= lastId) {
//           console.log(
//             `[WAR] #${msgId} старіше або дорівнює lastId ${lastId} — пропуск`
//           );

//           continue;
//         }

//         const textForAI = msg.message || "";

//         console.log(
//           `[WAR] #${msgId} текст:`,
//           textForAI.substring(0, 200)
//         );

//         if (
//           !textForAI ||
//           textForAI.trim().length === 0
//         ) {
//           console.log(
//             `[SKIP] #${msgId} немає тексту`
//           );

//           await warSaveLastId(msgId);

//           continue;
//         }

//         console.log(
//           `[AI] #${msgId} Перевіряємо через Groq...`
//         );

//         const result =
//           await classifyWarMessage(
//             textForAI
//           );

//         console.log(
//           `[AI] #${msgId} Результат:`,
//           result
//         );

//         if (result === "YES") {
//           console.log(
//             `[PUBLISH] #${msgId} → ${TARGET_CHAT}`
//           );

//           const published =
//             await warPublish(msg);

//           if (published) {
//             await warSaveLastId(msgId);
//           }
//         } else if (result === "NO") {
//           console.log(
//             `[SKIP] #${msgId} Не стосується Білої Церкви`
//           );

//           await warSaveLastId(msgId);
//         } else {
//           console.log(
//             `[SKIP] #${msgId} AI не відповів — ID НЕ зберігаємо`
//           );
//         }

//         await new Promise((resolve) =>
//           setTimeout(resolve, 1500)
//         );

//       } catch (e) {
//         console.log(
//           `[ERROR] Обробка повідомлення: ${e.message}`
//         );
//       }
//     }

//     console.log(
//       "[WAR] ✔ Перевірка завершена"
//     );

//   } catch (e) {
//     console.log(
//       "[ERROR] WAR MONITOR:",
//       e.message
//     );
//   }
// }

// // ======================
// // 🌐 SERVER
// // ======================

// const app = express();

// app.get("/", (req, res) => {
//   res.send("Бот працює 🚀");
// });

// app.listen(PORT || 3000, () => {
//   console.log(
//     `🌐 Server started on port ${PORT || 3000}`
//   );
// });

// // ======================
// // ▶️ START
// // ======================

// (async () => {
//   try {
//     tgClient = await initClient();

//     // ЄДИНИЙ режим роботи:
//     // моніторинг обстрілів / військових загроз

//     if (
//       WAR_SOURCE_CHANNEL &&
//       WAR_TARGET_CHANNEL
//     ) {
//       const interval =
//         Number(WAR_CHECK_INTERVAL) || 60;

//       console.log(
//         "[WAR] Монітор запущено"
//       );

//       console.log(
//         `[WAR] Джерело: ${WAR_SOURCE_CHANNEL}`
//       );

//       console.log(
//         `[WAR] Призначення: ${WAR_TARGET_CHANNEL}`
//       );

//       console.log(
//         `[WAR] Інтервал: ${interval}с`
//       );

//       // Перша перевірка одразу після запуску
//       await runWarMonitor();

//       // Наступні перевірки
//       setInterval(
//         runWarMonitor,
//         interval * 1000
//       );
//     } else {
//       console.log(
//         "[WAR] Помилка: WAR_SOURCE_CHANNEL або WAR_TARGET_CHANNEL не задано"
//       );
//     }
//   } catch (e) {
//     console.log(
//       `[FATAL] ${e.message}`
//     );
//   }
// })();














require("dotenv").config();

const { Telegraf } = require("telegraf");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");
const Groq = require("groq-sdk");
const express = require("express");
const { Redis } = require("@upstash/redis");

// ============================================================
// ⚙️ CONFIG
// ============================================================

const {
  BOT_TOKEN,

  GROQ_API_KEY,
  XAI_API_KEY,
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

// Скільки разів дозволяємо повторити повідомлення,
// якщо ВСІ AI недоступні.
const MAX_AI_RETRIES = 3;

// Скільки повідомлень брати з каналу.
// Збільшено, щоб не втрачати повідомлення між перевірками.
const WAR_MESSAGES_LIMIT = 20;

// ============================================================
// OPENROUTER
// ============================================================

// Не використовуємо десятки випадкових моделей.
// OpenRouter — останній резерв.
const OPENROUTER_MODELS = [
  "openrouter/free",
  "openai/gpt-oss-20b:free",
  "google/gemma-4-26b-a4b-it:free",
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

// Поточна модель Groq
let GROQ_MODEL = null;

// Доступні моделі Groq
let GROQ_MODELS = [];

// Індекс поточної моделі
let groqModelIndex = 0;

// Моделі, які вже тимчасово не працюють
const groqBadModels = new Set();

// ============================================================
// XAI
// ============================================================

let xaiDisabled = false;

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
  WAR_SOURCE_CHANNEL || "war_monitor";

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
  "XAI KEY:",
  XAI_API_KEY ? "Є" : "НЕМАЄ"
);

console.log(
  "OPENROUTER KEY:",
  OPENROUTER_API_KEY ? "Є" : "НЕМАЄ"
);

console.log(
  "REDIS:",
  redis ? "Є" : "НЕМАЄ"
);

console.log("======================================");

// ============================================================
// 🧠 WAR SYSTEM PROMPT
// ============================================================

const WAR_SYSTEM_PROMPT = `
Ти дуже суворий модератор локального Telegram-каналу Білої Церкви.

Твоє завдання — визначити ТІЛЬКИ одне:

YES
або
NO

YES ТІЛЬКИ якщо повідомлення безпосередньо стосується:

1. Білої Церкви.
2. Білоцерківської громади.
3. Білоцерківського району.
4. Населених пунктів Білоцерківської громади/району.
5. Безпосередньої загрози для Білої Церкви.
6. Ракети/БпЛА/авіації, які прямо рухаються НА Білу Церкву.
7. Повітряної тривоги саме в Білій Церкві.
8. Вибухів саме в Білій Церкві.
9. ППО саме над Білою Церквою.
10. Наслідків ударів у Білій Церкві.
11. Подій, які прямо впливають на мешканців Білої Церкви.

ВАЖЛИВО ЩОДО ТРАЄКТОРІЇ:

Якщо написано:

"БпЛА рухається на Білу Церкву"
→ YES

"ракета у напрямку Білої Церкви"
→ YES

"БпЛА через Фастів у напрямку Білої Церкви"
→ YES

"БпЛА в напрямку Білоцерківського району"
→ YES

Але:

"БпЛА на Славутич"
→ NO

"БпЛА від Славутича у напрямку Київщини"
→ NO

"БпЛА на Київ"
→ NO

"ракети на Київ"
→ NO

"ППО Київська область"
→ NO

"тривога по Київській області"
→ NO

"БпЛА в Київській області"
→ NO

"вибухи в Києві"
→ NO

"ППО працює в Київській області"
→ NO

Сам факт згадки:

"Київщина"
"Київська область"
"БпЛА"
"ракети"
"ППО"
"тривога"

НЕ означає YES.

Потрібен конкретний зв'язок із Білою Церквою.

Інші міста Київської області НЕ вважай Білою Церквою.

Наприклад:

Славутич → NO
Київ → NO
Бровари → NO
Бориспіль → NO
Ірпінь → NO
Буча → NO
Вишгород → NO
Обухів → NO
Фастів → NO

Якщо немає чіткого зв'язку з Білою Церквою —
відповідай NO.

НЕ пояснюй.

Відповідь повинна бути РІВНО:

YES

або

NO
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
  "узин",
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
  "васильків",
  "саварка",
  "володарка",
  "ставище",
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
  "біла церква",
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

  /ппо.*київська\s+область/i,
  /тривога.*київська\s+область/i,
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

  const threatWords = [
    "бпла",
    "бпл",
    "дрон",
    "дрони",
    "ракета",
    "ракети",
    "шахед",
    "авіа",
    "реактив",
    "літак",
    "винищувач",
    "ппо",
    "вибух",
    "вибухи",
    "тривога",
    "загроза",
    "летить",
    "рухається",
    "рухаються",
    "напрямку",
    "курс",
  ];

  const hasThreatWord =
    threatWords.some(
      (word) =>
        normalized.includes(word)
    );

  if (hasThreatWord) {
    return true;
  }

  return false;
}

// ============================================================
// LOCAL PRECHECK
// ============================================================

function localPrecheck(text) {
  const normalized =
    normalizeText(text);

  if (!normalized) {
    return {
      decision: null,
      reason: "empty",
    };
  }

  // ----------------------------------------------------------
  // 1. Прямий зв'язок із Білою Церквою + загроза
  // ----------------------------------------------------------

  if (
    hasDirectThreatToBilaTserkva(
      normalized
    )
  ) {
    return {
      decision: "YES",
      reason:
        "direct threat to Bila Tserkva",
    };
  }

  // ----------------------------------------------------------
  // 2. Явна локальна локація
  // ----------------------------------------------------------

  if (
    hasDirectBilaTserkva(
      normalized
    )
  ) {
    // Якщо прямо згадується Біла Церква,
    // віддаємо AI для остаточного рішення.
    return {
      decision: null,
      reason:
        "mentions Bila Tserkva",
    };
  }

  if (
    hasLocalArea(normalized)
  ) {
    return {
      decision: null,
      reason:
        "mentions local area",
    };
  }

  // ----------------------------------------------------------
  // 3. Очевидні false positive
  // ----------------------------------------------------------

  for (
    const pattern of HARD_NO_PATTERNS
  ) {
    if (
      pattern.test(normalized)
    ) {
      return {
        decision: "NO",
        reason:
          "hard irrelevant location",
      };
    }
  }

  // ----------------------------------------------------------
  // 4. Якщо є тільки загальна Київщина
  // ----------------------------------------------------------

  const hasKyivRegion =
    normalized.includes(
      "київська область"
    ) ||
    normalized.includes(
      "київщин"
    );

  const threatWords = [
    "бпла",
    "бпл",
    "дрон",
    "дрони",
    "ракета",
    "ракети",
    "шахед",
    "ппо",
    "тривога",
    "вибух",
  ];

  const hasThreat =
    threatWords.some(
      (word) =>
        normalized.includes(word)
    );

  if (
    hasKyivRegion &&
    hasThreat
  ) {
    // Загальна Київщина без Білої Церкви
    // НЕ проходить як YES.
    return {
      decision: "NO",
      reason:
        "general Kyiv region threat",
    };
  }

  // ----------------------------------------------------------
  // 5. Інша локація без Білої Церкви
  // ----------------------------------------------------------

  const hasOtherLocation =
    OTHER_LOCATIONS.some(
      (term) =>
        normalized.includes(term)
    );

  if (
    hasOtherLocation &&
    hasThreat
  ) {
    return {
      decision: "NO",
      reason:
        "other location threat",
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

    // --------------------------------------------------------
    // Моделі, які НЕ використовуємо
    // --------------------------------------------------------

    const excluded = [
      "whisper",
      "orpheus",
      "prompt-guard",
      "safeguard",
    ];

    // --------------------------------------------------------
    // Пріоритет
    // --------------------------------------------------------

    const preferred = [
      "openai/gpt-oss-20b",
      "openai/gpt-oss-120b",
      "qwen/qwen3.6-27b",
      "allam-2-7b",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
    ];

    const selected = [];

    // Спочатку preferred
    for (
      const model of preferred
    ) {
      if (
        ids.includes(model) &&
        !selected.includes(model)
      ) {
        selected.push(model);
      }
    }

    // Потім інші придатні
    for (
      const model of ids
    ) {
      const lower =
        model.toLowerCase();

      if (
        excluded.some(
          (word) =>
            lower.includes(word)
        )
      ) {
        continue;
      }

      if (
        !selected.includes(model)
      ) {
        selected.push(model);
      }
    }

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
// 🤖 XAI / GROK
// ============================================================

async function classifyWithXAI(
  text
) {
  if (
    !XAI_API_KEY ||
    xaiDisabled
  ) {
    return null;
  }

  try {
    console.log(
      "[AI] xAI/Grok — запит..."
    );

    const response =
      await withTimeout(
        fetch(
          "https://api.x.ai/v1/chat/completions",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${XAI_API_KEY}`,
            },

            body: JSON.stringify({
              model:
                "grok-3-mini",

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

              max_tokens: 32,
            }),
          }
        ),
        AI_TIMEOUT
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      if (
        response.status === 401
      ) {
        xaiDisabled = true;
      }

      throw new Error(
        `HTTP ${response.status}: ${errorText}`
      );
    }

    const data =
      await response.json();

    const answer =
      data?.choices?.[0]
        ?.message?.content
        ?.trim() || "";

    const parsed =
      parseYesNo(answer);

    console.log(
      "[AI] xAI відповідь:",
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
      `[ERROR] xAI/Grok: ${e.message}`
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
  // 2. XAI
  // ==========================================================

  if (
    XAI_API_KEY &&
    !xaiDisabled
  ) {
    const result =
      await classifyWithXAI(
        text
      );

    if (
      result === "YES" ||
      result === "NO"
    ) {
      console.log(
        `[AI] Результат від xAI: ${result}`
      );

      return result;
    }
  } else {
    console.log(
      "[AI] xAI пропущено — API key відсутній/вимкнений"
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
    // ========================================================
    // 📝 ОРИГІНАЛЬНИЙ ТЕКСТ
    // ========================================================

    let sourceText = msg.message || "";

    // ========================================================
    // 🧹 ВИДАЛЯЄМО СТАРИЙ ФУТЕР
    //
    // 📡 Моніторинг загроз (https://t.me/war_monitor) • дата
    // ========================================================

    sourceText = sourceText
      .replace(
        /\s*📡\s*Моніторинг загроз\s*\(\s*https?:\/\/t\.me\/war_monitor\s*\)\s*•[\s\S]*$/i,
        ""
      )
      .trim();

    // ========================================================
    // 🧹 ПРИБИРАЄМО ЗАЙВІ ПУСТІ РЯДКИ
    // ========================================================

    sourceText = sourceText
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // ========================================================
    // 🛡 HTML ESCAPE
    // ========================================================

    const safeText =
      escapeHtml(sourceText);

    // ========================================================
    // 🎥 VIDEO
    // ========================================================

    if (msg.video) {
      try {
        const video =
          await tgClient.downloadMedia(
            msg.video
          );

        if (video) {
          await bot.telegram.sendVideo(
            TARGET_CHAT,
            {
              source: video,
            },
            {
              caption: safeText || undefined,
              parse_mode: "HTML",
            }
          );

          console.log(
            "[PUBLISH] Video posted to",
            TARGET_CHAT
          );

          return true;
        }
      } catch (e) {
        console.log(
          `[ERROR] Video publish: ${e.message}`
        );
      }
    }

    // ========================================================
    // 🖼 PHOTO
    // ========================================================

    const images =
      await getImages(
        tgClient,
        [msg]
      );

    if (images.length === 1) {
      await bot.telegram.sendPhoto(
        TARGET_CHAT,
        {
          source: images[0],
        },
        {
          caption: safeText || undefined,
          parse_mode: "HTML",
        }
      );

      console.log(
        "[PUBLISH] Photo posted to",
        TARGET_CHAT
      );

      return true;
    }

    // ========================================================
    // 🖼🖼 MEDIA GROUP
    // ========================================================

    if (images.length > 1) {
      const mediaGroup =
        images.map(
          (img, i) => ({
            type: "photo",

            media: {
              source: img,
            },

            caption:
              i === 0 && safeText
                ? safeText
                : undefined,

            parse_mode:
              i === 0 && safeText
                ? "HTML"
                : undefined,
          })
        );

      await bot.telegram.sendMediaGroup(
        TARGET_CHAT,
        mediaGroup
      );

      console.log(
        "[PUBLISH] MediaGroup posted to",
        TARGET_CHAT
      );

      return true;
    }

    // ========================================================
    // 📝 TEXT
    // ========================================================

    if (!safeText) {
      console.log(
        "[PUBLISH] Порожній текст — пропуск"
      );

      return false;
    }

    await bot.telegram.sendMessage(
      TARGET_CHAT,
      safeText,
      {
        parse_mode: "HTML",
      }
    );

    console.log(
      "[PUBLISH] Text posted to",
      TARGET_CHAT
    );

    return true;

  } catch (e) {
    console.log(
      `[ERROR] Telegram publish: ${e.message}`
    );

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
      "xAI:",
      XAI_API_KEY
        ? "READY"
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