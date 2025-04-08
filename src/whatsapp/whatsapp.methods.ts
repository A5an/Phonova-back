import mime from "mime-types";
import { Pool } from "pg";

import NodeCache from "node-cache";
import {
  makeWASocket,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
  fetchLatestBaileysVersion,
} from "baileys";
import fetch from "node-fetch"; // Add this import
import { Boom } from "@hapi/boom";
import { File } from "formdata-node";
import logger from "./utils/logs";
import { usePostgreSQLAuthState } from "postgres-baileys";
import { getPostgreSQLConfigFromEnv } from "./utils/createConfig";
import { cleanOldIds } from "../util/cleanIds";
import { c } from "formdata-node/lib/File-cfd9c54a";

const postgreSQLConfig = getPostgreSQLConfigFromEnv();

const pool = new Pool(postgreSQLConfig);

const messageIds = new Map();

setInterval(() => {
  cleanOldIds(messageIds);
}, 60 * 60 * 1000); // each hour

const whatsappInstances = new Map();
const msgRetryCounterCache = new NodeCache();

async function decryptWhatsAppMedia(buffer: Buffer, mimeType: string) {
  const cleanedMimeType = mimeType.split(";")[0].trim();
  const extension = mime.extension(cleanedMimeType);

  // Создаем файл с использованием formdata-node
  const file = new File([buffer], `file.${extension}`, { type: mimeType });

  return file;
}

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
    pool,
    botId
  );
  const { version } = await fetchLatestBaileysVersion();
  let lastMessageId: string | null = null;

  const sock = makeWASocket({
    version,
    logger,
    browser: ["Pleep", "Chrome", "4.0.0"],
    auth: {
      //@ts-ignore
      creds: state.creds,
      /** caching makes the store faster to send/recv messages */
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    msgRetryCounterCache,
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
            (lastDisconnect?.error as Boom)?.output,
            `assistantId: ${botId}`
          );

          whatsappInstances.delete(botId);

          if ((lastDisconnect?.error as Boom)?.output?.statusCode === 440) {
            console.log(
              `Connection closed, status: connectionReplaced (440), assistantId: ${botId}`
            );
            return;
          }

          if ((lastDisconnect?.error as Boom)?.output?.statusCode === 403) {
            console.log(
              `Connection closed, status: forbidden (403) (possibly ban), assistantId: ${botId}`
            );
            return;
          }

          // reconnect if not logged out
          if (
            (lastDisconnect?.error as Boom)?.output?.statusCode !==
            DisconnectReason.loggedOut
          ) {
            if (
              (lastDisconnect?.error as Boom)?.output?.statusCode !==
                DisconnectReason.restartRequired ||
              (lastDisconnect?.error as Boom)?.output?.statusCode !==
                DisconnectReason.connectionReplaced
            ) {
              setTimeout(() => {
                if (!whatsappInstances.get(botId)) {
                  console.log(
                    `Restarting instance, assistantId: ${botId}`
                  );
                }
              }, 60000);
            }
            startSock(botId);
          } else {
            console.log("Connection closed. You are logged out.");
            try {
              // Удаляем данные сессии из БД
              await deleteSession();
              whatsappInstances.delete(botId);
              // Удаляем whatsappBot и whatsappExtensions
              deleteAfterLogout(botId);
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

          try {
            const saveBotDate = await fetch(`${process.env.N8N_URL}/webhook/addBot`, {
              method: "POST",
              body: JSON.stringify(data),
            });

            if (saveBotDate.ok) {
              console.log("Bot saved");
            } else {
              console.log("Bot not saved");
            }

          } catch (e) {
            console.log(e);
          }
          console.log("Bot connected", sock.user);
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

      //await sleep(1000);
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

async function deleteAfterLogout(instanceKey: string) {
  try {
    console.log(`Deleting WhatsApp bot after logout: ${instanceKey}`);
    
    const data = {
      botId: instanceKey,
    };

    const saveBotDate = await fetch(`${process.env.N8N_URL}/webhook/deleteBot`, {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (saveBotDate.ok) {
      console.log("Bot saved");
    } else {
      console.log("Bot not saved");
    }
    
    console.log(`WhatsApp bot ${instanceKey} successfully deleted after logout`);
  } catch (e) {
    console.error(`Error during deleteAfterLogout for ${instanceKey}:`, e);
  }
}

async function deleteBot(req, res) {
  const botId = req.body.botId;

  if (!botId) {
    return res.status(400).json({ error: "botId is required." });
  }

  try {
    const instance = whatsappInstances.get(botId);

    if (instance) {

      try {
        // Try to delete from database
        const client = await pool.connect();
        const queryResult = await client.query(
          "DELETE FROM auth_data WHERE session_key LIKE $1",
          [`%${botId}%`]
        );
        client.release();
        console.log("Deleted session from DB", queryResult.rowCount);
      } catch (dbError) {
        console.error("Error deleting from database:", dbError);
        // Don't let database errors stop the process - we've already removed from memory
      }

      await instance.logout("Logging Out!");
      instance.end(new Error("Logging Out!"));
      whatsappInstances.delete(botId);
      deleteAfterLogout(botId);

      return res.sendStatus(200);
    } else {
      return res
        .status(500)
        .send(`Whatsapp instance not found with sessionId: ${botId}`);
    }
  } catch (e) {
    console.log(e);
    return res.status(500).send("Failed to delete whatsapp bot");
  }
}

export const whatsapp = {
  addBot,
  deleteBot,
  decryptWhatsAppMedia,
  getInstanceInfo,
  deleteAfterLogout,
  restartAllSessions,
  restartSession,
  imitateTyping,
};
