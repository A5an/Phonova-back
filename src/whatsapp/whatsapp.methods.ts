import { Pool } from "pg";
import {
  makeWASocket,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import Boom from "@hapi/boom";
import { socketBot } from "..";
import logger from "./utils/logs";
import { usePostgreSQLAuthState } from "postgres-baileys";
import { getPostgreSQLConfigFromEnv } from "./utils/createConfig";
import { sleep } from "./utils/helpers";
import QRCode from 'qrcode';

const postgreSQLConfig = getPostgreSQLConfigFromEnv();

const pool = new Pool(postgreSQLConfig);

const whatsappInstances = new Map();

async function getInstanceInfo(instanceKey: string) {
  try {
    const instance = whatsappInstances.get(instanceKey);

    if (instance) {
      return instance.user;
    } else {
      logger.error("Error: Failed to get instance info");
    }
  } catch (e) {
    logger.error("Error:", e);
  }
}

const imitateTyping = async (botId: string, chatId: string) => {
  const sock = whatsappInstances.get(botId);
  if (sock) {
    try {
      sock.sendPresenceUpdate("composing", chatId);
      // await sleep(5000)
      // sock.sendPresenceUpdate("available", chatId);
      console.log("typing")
      return
    } catch (error) {
      console.log("Error while imitating typing", error)
      // sock.sendPresenceUpdate("available", chatId);
      return
    }
  }
}

const startSock = async (botId: string) => {
  const { state, saveCreds, deleteSession } = await usePostgreSQLAuthState(
    postgreSQLConfig,
    botId
  );
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    browser: ["Phonova", "Chrome", "4.0.0"],
    auth: {
      creds: state.creds,
      /** caching makes the store faster to send/recv messages */
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: true,
    // ignore all broadcast messages -- to receive the same
    // comment the line below out
    shouldIgnoreJid: (jid) => isJidBroadcast(jid),
    // implement to handle retries & poll updates
    defaultQueryTimeoutMs: undefined,
    keepAliveIntervalMs: 15000,
    syncFullHistory: false,
  });

  // the process function lets you process all events that just occurred
  // efficiently in a batch
  sock.ev.process(
    // events is a map for event name => event data
    async (events) => {
      // something about the connection changed
      // maybe it closed, or we received all offline message or connection opened
      if (events["connection.update"]) {
        const update = events["connection.update"];
        const { connection, lastDisconnect, qr } = update;

        if (connection === "close") {
          console.log(
            (lastDisconnect?.error as any)?.output,
            `botId: ${botId}`
          );

          if ((lastDisconnect?.error as any)?.output?.statusCode === 440) {
            console.log(
              `Connection closed, status: connectionReplaced (440), botId: ${botId}`
            );
            return;
          }

          if ((lastDisconnect?.error as any)?.output?.statusCode === 403) {
            console.log(
              `Connection closed, status: forbidden (403) (possibly ban), botId: ${botId}`
            );
            return;
          }

          // reconnect if not logged out
          if (
            (lastDisconnect?.error as any)?.output?.statusCode !==
            DisconnectReason.loggedOut
          ) {
            startSock(botId);
          } else {
            console.log("Connection closed. You are logged out.");
            try {
              // Удаляем данные сессии из БД
              await deleteSession();
              //await deleteAuthKey(botId);
              whatsappInstances.delete(botId);
              const deleteBotDate = await fetch(`${process.env.N8N_URL}/webhook-test/deleteBot`, {
                method: "POST",
                body: JSON.stringify({ botId }),
              });

              if (deleteBotDate.ok) {
                console.log("Bot deleted");
              } else {
                console.log("Bot not deleted");
              }

            } catch (error) {
              console.error(
                "Error while deleting auth key or local session data:",
                error
              );
            }
          }
        }

        if (connection === "open") {
          console.log(update);
          whatsappInstances.set(botId, sock);

          const data = {
            user: sock.user,
            instance_key: botId,
          };

          const saveBotDate = await fetch(`${process.env.N8N_URL}/webhook-test/addBot`, {
            method: "POST",
            body: JSON.stringify(data),
          });

          if (saveBotDate.ok) {
            console.log("Bot saved");
          } else {
            console.log("Bot not saved");
          }
        
        }

        if (qr) {
          console.log("QR RECEIVED");
          try {
            // Convert the QR code to a URL format that WhatsApp expects
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
            console.log("\nScan this QR code in WhatsApp:");
            console.log(qrUrl);
            console.log("\nOr use this code directly in WhatsApp Web:");
            console.log(qr);
          } catch (error) {
            console.error("Error processing QR code:", error);
            console.log("Raw QR code data:", qr);
          }
        }
      }

      // credentials updated -- save them
      if (events["creds.update"]) {
        await saveCreds();
      }

      // received a new message
      // if (events["messages.upsert"]) {
      //   const m = events["messages.upsert"];

      //   console.log(m.type);
      //   console.log("MESSAGE LIST: ", m.messages);

      //   for (const msg of m.messages) {
      //     //temporary solution
      //     if (
      //       msg.messageStubParameters &&
      //       msg.messageStubParameters[0] === "Message absent from node"
      //     ) {
      //       msg.message = {};
      //       msg.message.conversation = "Начни диалог";
      //     }

      //     if (!msg.message) return;

      //     const messageType = Object.keys(msg.message)[0];
      //     if (
      //       ["protocolMessage", "senderKeyDistributionMessage"].includes(
      //         messageType
      //       )
      //     ) {
      //       console.log(JSON.stringify(msg.message));
      //       return;
      //     }

      //     if (msg?.message?.reactionMessage) return;

      //     console.log(msg);
      //     const receivedMessageId: string = msg.key.id as string;
      //     const chatId: string = msg.key.remoteJid as string;
      //     const quotedMessage =
      //       msg.message.extendedTextMessage?.contextInfo?.quotedMessage
      //         ?.conversation;

      //     const originalText: string =
      //       msg?.message?.conversation ||
      //       (msg?.message?.extendedTextMessage?.text as string) ||
      //       (msg?.message?.imageMessage?.caption as string) ||
			// 			(msg?.message?.documentMessage?.caption as string) ||
			// 			(msg?.message?.documentWithCaptionMessage?.message?.documentMessage?.caption as string) ||
      //       (msg?.message?.ephemeralMessage?.message?.conversation as string);

      //     const text = quotedMessage
      //       ? `[Reply to message: "${quotedMessage}"]\n${originalText}`
      //       : originalText;

      //     console.log(`Text: ${text}`);
      //     const username: string = msg.pushName || "Неизвестный";
      //     const number = chatId.split("@")[0];

      //     if (lastMessageId === receivedMessageId) return;
      //     lastMessageId = receivedMessageId;

      //     if (
      //       sock.user &&
      //       !chatId.includes("@g.us") &&
      //       !chatId.includes("@broadcast")
      //     ) {
      //       const userId: string = sock.user.id.replace(/:\d+@/, "@");

      //       if (!msg.key.fromMe) {
      //         const messageData = {
      //           message: msg,
      //           chatId,
      //           botId: userId,
      //           receivedMessageId,
      //           username,
      //           number,
      //           instanceKey: botId,
      //         };

      //         // whatsapp.enqueueMessage(text, messageData);
      //       } 
      //     }
      //   }
      // }
    }
  );

  return sock;
};

async function restartAllSessions() {
  try {
    const client = await pool.connect(); // Подключаемся к базе данных
    const res = await client.query(
      "SELECT * FROM auth_data WHERE session_key LIKE '%auth_creds'"
    ); // Выполняем SQL-запрос
    client.release(); // Закрываем соединение

    const sessions = res.rows;
    console.log("Сессии:", sessions);

    for (const s of sessions) {
      // Используем for...of для последовательной обработки
      const id = s.session_key.split(":")[0];

      const cachedInstance = whatsappInstances.get(id);

      if (cachedInstance) {
        await cachedInstance.end(new Error("Restart"));
      } else {
        const instance = await startSock(id);
        whatsappInstances.set(id, instance);
      }

      await sleep(3000);
    }
  } catch (err) {
    console.error("Ошибка при выполнении запроса", err);
  }
}

async function restartSession(id: string) {
  try {
    const cachedInstance = whatsappInstances.get(id);

    if (cachedInstance) {
      await cachedInstance.end(new Error("Restart"));
    } else {
      const instance = await startSock(id);
      whatsappInstances.set(id, instance);
    }

    return {
      success: true,
    };
  } catch (err) {
    console.error("Ошибка при выполнении запроса", err);
    return {
      success: false,
    };
  }
}

async function addBot(req, res) {
  const botId = req.body.botId;

  if (!botId) {
    return res.status(400).json({ error: "botId is required." });
  }

  try {
    await startSock(botId);

    return res.sendStatus(200);
  } catch (e) {
    console.log(e);
    return res.status(500).send("Failed to create whatsapp bot");
  }
}

async function deleteBot(req, res) {
  const assistantId = req.body.assistantId;

  if (!assistantId) {
    return res.status(400).json({ error: "assistantId is required." });
  }

  try {
    const instance = whatsappInstances.get(assistantId);

    if (instance) {
      await instance.logout("Logging Out!");
      instance.end(new Error("Logging Out!"));

      return res.sendStatus(200);
    } else {
      return res
        .status(500)
        .send(`Whatsapp instance not found with sessionId: ${req}`);
    }
  } catch (e) {
    console.log(e);
    return res.status(500).send("Failed to delete whatsapp bot");
  }
}

export const whatsapp = {
  addBot,
  restartAllSessions,
  restartSession,
  getInstanceInfo,
  deleteBot,
  imitateTyping
};
