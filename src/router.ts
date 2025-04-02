import { Router } from "express"
import { whatsapp_router } from "./whatsapp/whatsapp.router"

const router = Router();

router.use("/whatsapp/bot", whatsapp_router);

router.get("/", (_, res) => {
  res.status(200).send("Socket server is working")
})

export { router as RootRouter }
