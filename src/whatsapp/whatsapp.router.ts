import { Request, Response } from "express";
import { whatsapp } from "./whatsapp.methods";

import express from "express";
const router = express.Router();

router.post("/addBot", async (req: Request, res: Response) => {
  return whatsapp.addBot(req, res);
});

router.post("/deleteBot", async (req: Request, res: Response) => {
  return whatsapp.deleteBot(req, res);
});

router.get("/status", async (req: Request, res: Response) => {
  const { botId } = req.query;

  if (!botId) {
    res.status(400).send({ error: "Missing required param: botId" });
    return;
  }

  try {
    const instanceData = await whatsapp.getInstanceInfo(botId as string);
    res.status(200).send({ connected: !!instanceData?.id });
    return
  } catch (error) {
    res.status(500).send({ error: "Failed to retrieve instance info" });
    return
  }
});

router.post("/restart", async (req: Request, res: Response) => {
  const botId = req.body.botId;

  if (!botId) {
    res.status(400).send({ error: "Missing required param: botId" });
    return;
  }

  try {
    const result = await whatsapp.restartSession(botId as string);
    res.status(result.success ? 200 : 500).send({ success: result.success });
    return
  } catch (error) {
    res.status(500).send({ error: "Failed to restart session" });
    return
  }
});

router.post("/typing", async (req: Request, res: Response) => {

  const botId = req.body.botId;
  const chatId = req.body.chatId;

  if (!botId || !chatId) {
    res.status(400).send({ error: "Missing required param: botId or chatId" });
    return;
  }

  try {
    await whatsapp.imitateTyping(botId as string, chatId as string);
    res.status(200).send({ success: "Success" });
    return
  } catch (error) {
    res.status(500).send({ error: "Failed to restart session" });
    return
  }

});

export const whatsapp_router = router;
