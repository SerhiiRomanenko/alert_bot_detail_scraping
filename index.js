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

// ======================
// ⚙️ CONFIG
// ======================

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

const bot = new Telegraf(BOT_TOKEN);

const groq = GROQ_API_KEY
  ? new Groq({
      apiKey: GROQ_API_KEY,
    })
  : null;

const redis =
  UPSTASH_REDIS_REST_URL &&
  UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: UPSTASH_REDIS_REST_URL,
        token: UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const SOURCE_CHAT =
  WAR_SOURCE_CHANNEL || "war_monitor";

const TARGET_CHAT =
  WAR_TARGET_CHANNEL || "xybc_live";

const CHECK_INTERVAL =
  Number(WAR_CHECK_INTERVAL) || 60;

// Скільки разів максимум повторювати AI
// для одного повідомлення після повного падіння всіх AI.
const MAX_AI_RETRIES = 3;

// Таймаут одного AI-запиту.
const AI_TIMEOUT = 15000;

let tgClient;

// Повідомлення, для яких зараз виконується AI.
// Захищає від паралельного запуску setInterval.
let monitorRunning = false;

// Лічильник невдалих AI-спроб для конкретних повідомлень.
const aiRetryMap = new Map();

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

// ======================
// 📡 TELEGRAM CLIENT
// ======================

async function initClient() {
  const client = new TelegramClient(
    new StringSession(SESSION || ""),
    Number(API_ID),
    API_HASH,
    {
      connectionRetries: 5,
    }
  );

  await client.start({
    phoneNumber: async () =>
      await input.text("📱 Phone: "),

    password: async () =>
      await input.text("🔐 2FA: "),

    phoneCode: async () =>
      await input.text("📩 Code: "),

    onError: (err) =>
      console.log(
        "❌ Telegram:",
        err
      ),
  });

  console.log("✅ Telegram connected");
  console.log("✅ Telegram session loaded");

  return client;
}

// ======================
// 🖼 MEDIA
// ======================

async function getImages(client, messages) {
  const images = [];

  for (const msg of messages) {
    try {
      let media = null;

      if (msg.photo) {
        media = msg.photo;
      } else if (msg.media?.photo) {
        media = msg.media.photo;
      } else if (msg.media?.document) {
        const mime =
          msg.media.document.mimeType || "";

        if (mime.startsWith("image/")) {
          media = msg.media.document;
        }
      }

      if (media) {
        const buffer =
          await client.downloadMedia(media);

        if (buffer) {
          images.push(buffer);
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

// ======================
// ⚠️ WAR SYSTEM PROMPT
// ======================

const WAR_SYSTEM_PROMPT = `
Ти модератор локального Telegram-каналу Білої Церкви.

Твоє завдання — визначити, чи стосується надане повідомлення безпосередньо Білої Церкви, Білоцерківської громади, Білоцерківського району або безпосередньої загрози для Білої Церкви.

Вважати релевантним (YES):

- Біла Церква
- Білоцерківська громада
- Білоцерківський район
- Події безпосередньо у Білій Церкві
- Повітряні тривоги у Білій Церкві
- Вибухи у Білій Церкві
- Робота ППО над Білою Церквою
- Ракети/БпЛА, що рухаються на Білу Церкву
- Безпосередня загроза для Білої Церкви
- Наслідки ударів у Білій Церкві
- Події, що безпосередньо стосуються мешканців Білої Церкви
- Населені пункти Білоцерківської громади/району, якщо подія стосується їх

НЕ вважати релевантним (NO):

- Київ загалом
- Київська область загалом без конкретного зв'язку з Білою Церквою
- Україна загалом
- Інші міста/райони Київської області
- "ППО працює в Київській області" без згадки Білої Церкви
- "Тривога по всій Київській області" без конкретики

Відповідай ТІЛЬКИ одним словом: YES або NO.
`;

// ======================
// ⏱️ AI TIMEOUT
// ======================

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

// ======================
// 🤖 GROQ
// ======================

async function classifyWithGroq(text) {
  if (!GROQ_API_KEY || !groq) {
    console.log(
      "[AI] Groq: API key відсутній"
    );

    return null;
  }

  try {
    console.log(
      "[AI] 1/3 Groq — запит..."
    );

    const completion =
      await withTimeout(
        groq.chat.completions.create({
          model:
            "llama-3.3-70b-versatile",

          messages: [
            {
              role: "system",
              content:
                WAR_SYSTEM_PROMPT,
            },

            {
              role: "user",
              content: text,
            },
          ],

          temperature: 0.1,
          max_tokens: 8,
        }),
        AI_TIMEOUT
      );

    const answer =
      completion.choices?.[0]?.message?.content
        ?.trim()
        ?.toUpperCase();

    console.log(
      "[AI] Groq відповідь:",
      answer || "(порожньо)"
    );

    if (
      answer === "YES" ||
      answer === "NO"
    ) {
      return answer;
    }

    throw new Error(
      `Некоректна відповідь: ${answer || "(порожньо)"}`
    );
  } catch (e) {
    console.log(
      `[ERROR] Groq: ${e.message}`
    );

    return null;
  }
}

// ======================
// 🤖 XAI / GROK
// ======================

async function classifyWithXAI(text) {
  if (!XAI_API_KEY) {
    console.log(
      "[AI] xAI: API key відсутній"
    );

    return null;
  }

  try {
    console.log(
      "[AI] 2/3 xAI/Grok — запит..."
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
              model: "grok-3-mini",

              messages: [
                {
                  role: "system",
                  content:
                    WAR_SYSTEM_PROMPT,
                },

                {
                  role: "user",
                  content: text,
                },
              ],

              temperature: 0.1,
              max_tokens: 8,
            }),
          }
        ),
        AI_TIMEOUT
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      throw new Error(
        `HTTP ${response.status}: ${errorText}`
      );
    }

    const data =
      await response.json();

    const answer =
      data.choices?.[0]?.message?.content
        ?.trim()
        ?.toUpperCase();

    console.log(
      "[AI] xAI/Grok відповідь:",
      answer || "(порожньо)"
    );

    if (
      answer === "YES" ||
      answer === "NO"
    ) {
      return answer;
    }

    throw new Error(
      `Некоректна відповідь: ${answer || "(порожньо)"}`
    );
  } catch (e) {
    console.log(
      `[ERROR] xAI/Grok: ${e.message}`
    );

    return null;
  }
}

// ======================
// 🌐 OPENROUTER
// ======================

async function classifyWithOpenRouter(text) {
  if (!OPENROUTER_API_KEY) {
    console.log(
      "[AI] OpenRouter: API key відсутній"
    );

    return null;
  }

  try {
    console.log(
      "[AI] 3/3 OpenRouter — запит..."
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
              model:
                "meta-llama/llama-3.3-70b-instruct",

              messages: [
                {
                  role: "system",
                  content:
                    WAR_SYSTEM_PROMPT,
                },

                {
                  role: "user",
                  content: text,
                },
              ],

              temperature: 0.1,
              max_tokens: 8,
            }),
          }
        ),
        AI_TIMEOUT
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      throw new Error(
        `HTTP ${response.status}: ${errorText}`
      );
    }

    const data =
      await response.json();

    const answer =
      data.choices?.[0]?.message?.content
        ?.trim()
        ?.toUpperCase();

    console.log(
      "[AI] OpenRouter відповідь:",
      answer || "(порожньо)"
    );

    if (
      answer === "YES" ||
      answer === "NO"
    ) {
      return answer;
    }

    throw new Error(
      `Некоректна відповідь: ${answer || "(порожньо)"}`
    );
  } catch (e) {
    console.log(
      `[ERROR] OpenRouter: ${e.message}`
    );

    return null;
  }
}

// ======================
// 🤖 AI CLASSIFICATION
// ======================

async function classifyWarMessage(text) {
  console.log(
    "[AI] Починаємо класифікацію"
  );

  // ----------------------
  // 1. GROQ
  // ----------------------

  let result =
    await classifyWithGroq(text);

  if (
    result === "YES" ||
    result === "NO"
  ) {
    console.log(
      `[AI] Результат від Groq: ${result}`
    );

    return result;
  }

  // ----------------------
  // 2. XAI / GROK
  // ----------------------

  result =
    await classifyWithXAI(text);

  if (
    result === "YES" ||
    result === "NO"
  ) {
    console.log(
      `[AI] Результат від xAI/Grok: ${result}`
    );

    return result;
  }

  // ----------------------
  // 3. OPENROUTER
  // ----------------------

  result =
    await classifyWithOpenRouter(text);

  if (
    result === "YES" ||
    result === "NO"
  ) {
    console.log(
      `[AI] Результат від OpenRouter: ${result}`
    );

    return result;
  }

  console.log(
    "[ERROR] Всі AI недоступні"
  );

  return null;
}

// ======================
// 💾 REDIS
// ======================

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

    return val
      ? Number(val)
      : 0;
  } catch (e) {
    console.log(
      `[ERROR] Redis read: ${e.message}`
    );

    return 0;
  }
}

async function warSaveLastId(id) {
  if (!redis) {
    return;
  }

  try {
    await redis.set(
      "war_monitor:last_message_id",
      id
    );
  } catch (e) {
    console.log(
      `[ERROR] Redis write: ${e.message}`
    );
  }
}

// ======================
// 📤 PUBLISH
// ======================

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function warPublish(msg) {
  try {
    const sourceText =
      msg.message || "";

    const timestamp =
      new Date(
        msg.date * 1000
      ).toLocaleString(
        "uk-UA",
        {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      );

    const safeText =
      escapeHtml(sourceText);

    const footer =
      `\n\n📡 <a href="https://t.me/war_monitor">Моніторинг загроз</a> • ${timestamp}`;

    const fullText =
      safeText
        ? `${safeText}${footer}`
        : `📡 <a href="https://t.me/war_monitor">Моніторинг загроз</a> • ${timestamp}`;

    // ======================
    // 🎥 ВІДЕО
    // ======================

    if (msg.video) {
      try {
        const video =
          await tgClient.downloadMedia(
            msg.video
          );

        await bot.telegram.sendVideo(
          TARGET_CHAT,
          {
            source: video,
          },
          {
            caption: fullText,
            parse_mode: "HTML",
          }
        );

        console.log(
          "[PUBLISH] Video posted to",
          TARGET_CHAT
        );

        return true;
      } catch (e) {
        console.log(
          `[ERROR] Video publish: ${e.message}`
        );
      }
    }

    // ======================
    // 🖼 ФОТО
    // ======================

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
          caption: fullText,
          parse_mode: "HTML",
        }
      );

      console.log(
        "[PUBLISH] Photo posted to",
        TARGET_CHAT
      );

      return true;
    }

    // ======================
    // 🖼🖼 КІЛЬКА ФОТО
    // ======================

    if (images.length > 1) {
      const mediaGroup =
        images.map(
          (img, i) => ({
            type: "photo",

            media: {
              source: img,
            },

            caption:
              i === 0
                ? fullText
                : undefined,

            parse_mode:
              i === 0
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

    // ======================
    // 📝 ТЕКСТ
    // ======================

    await bot.telegram.sendMessage(
      TARGET_CHAT,
      fullText,
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

// ======================
// 🔎 WAR MONITOR
// ======================

async function runWarMonitor() {
  if (monitorRunning) {
    console.log(
      "[WAR] Попередня перевірка ще працює — пропуск"
    );

    return;
  }

  monitorRunning = true;

  console.log(
    "[WAR] ▶ Початок перевірки"
  );

  try {
    console.log(
      "[WAR] 1. Читаємо останній ID..."
    );

    const lastId =
      await warGetLastId();

    console.log(
      "[WAR] 2. Останній ID:",
      lastId
    );

    console.log(
      "[WAR] 3. Отримуємо entity:",
      SOURCE_CHAT
    );

    const entity =
      await tgClient.getEntity(
        SOURCE_CHAT
      );

    console.log(
      "[WAR] 4. Entity отримано"
    );

    console.log(
      "[WAR] 5. Отримуємо повідомлення..."
    );

    const messages =
      await tgClient.getMessages(
        entity,
        {
          limit: 10,
        }
      );

    console.log(
      "[WAR] 6. Отримано повідомлень:",
      messages.length
    );

    // Старі → нові
    const sortedMessages =
      messages
        .filter(Boolean)
        .sort(
          (a, b) =>
            Number(a.id) -
            Number(b.id)
        );

    for (const msg of sortedMessages) {
      try {
        const msgId =
          Number(msg.id);

        if (msgId <= lastId) {
          continue;
        }

        console.log(
          `[WAR] Нове повідомлення #${msgId}`
        );

        const textForAI =
          msg.message || "";

        // ----------------------
        // Порожнє повідомлення
        // ----------------------

        if (
          !textForAI ||
          textForAI.trim().length === 0
        ) {
          console.log(
            `[SKIP] #${msgId} немає тексту`
          );

          await warSaveLastId(
            msgId
          );

          continue;
        }

        // ----------------------
        // AI RETRY
        // ----------------------

        const retryCount =
          aiRetryMap.get(msgId) || 0;

        console.log(
          `[AI] #${msgId} Спроба ${retryCount + 1}/${MAX_AI_RETRIES}`
        );

        const result =
          await classifyWarMessage(
            textForAI
          );

        // ----------------------
        // YES
        // ----------------------

        if (result === "YES") {
          console.log(
            `[AI] #${msgId} Результат: YES`
          );

          const published =
            await warPublish(msg);

          if (published) {
            await warSaveLastId(
              msgId
            );

            aiRetryMap.delete(
              msgId
            );
          }

          continue;
        }

        // ----------------------
        // NO
        // ----------------------

        if (result === "NO") {
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

        // ----------------------
        // AI ERROR
        // ----------------------

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
            `[RETRY] #${msgId} Повторимо наступною перевіркою`
          );

          // ВАЖЛИВО:
          // Не зберігаємо ID, щоб спробувати знову.
        }

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              1500
            )
        );

      } catch (e) {
        console.log(
          `[ERROR] Обробка повідомлення: ${e.message}`
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
    monitorRunning = false;
  }
}

// ======================
// 🌐 SERVER
// ======================

const app = express();

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
      `🌐 Server started on port ${PORT || 3000}`
    );
  }
);

// ======================
// ▶️ START
// ======================

(async () => {
  try {
    tgClient =
      await initClient();

    if (
      WAR_SOURCE_CHANNEL &&
      WAR_TARGET_CHANNEL
    ) {
      console.log(
        "[WAR] Монітор запущено"
      );

      console.log(
        `[WAR] Джерело: ${WAR_SOURCE_CHANNEL}`
      );

      console.log(
        `[WAR] Призначення: ${WAR_TARGET_CHANNEL}`
      );

      console.log(
        `[WAR] Інтервал: ${CHECK_INTERVAL}с`
      );

      // Перша перевірка одразу
      await runWarMonitor();

      // Наступні перевірки
      setInterval(
        runWarMonitor,
        CHECK_INTERVAL * 1000
      );

    } else {
      console.log(
        "[WAR] Помилка: WAR_SOURCE_CHANNEL або WAR_TARGET_CHANNEL не задано"
      );
    }

  } catch (e) {
    console.log(
      `[FATAL] ${e.message}`
    );
  }
})();