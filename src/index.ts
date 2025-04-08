import http from "http"
import express, { Request } from "express"
import { Server } from "socket.io"
import bodyParser from "body-parser"
import cors from "cors"
import { io as ioClient } from "socket.io-client"
import { handleSocketEvents } from "./socketsHandler"
import { RootRouter } from "./router"
import { whatsapp } from "./whatsapp/whatsapp.methods"

const PORT = process.env.PORT || 3000

const app = express()
export const socketBot = ioClient(process.env.BASE_URL!)
const httpServer = http.createServer(app)

export const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
})
// io.on("connection", (socket) => {
//   handleSocketEvents(socket)
// })

app.use(
  cors({
    origin: "*",
  }),
)
app.use(bodyParser.urlencoded({ extended: false }))
app.use(
  express.json({
    limit: "50mb",
    verify: function (req: Request, res, buffer) {
      req.rawBody = buffer
    },
  }),
)
app.use((err, req, res, next) => {
  console.error("An error occurred:", err.message)
  console.error(err.stack)
  res.status(500).send({ error: "Server error occurred" })
})
app.use(RootRouter)

httpServer.listen(PORT, async () => {
  console.log(`Server is listening on port ${PORT}`)
  whatsapp.restartAllSessions();
})

process.on("uncaughtException", (err, origin) => {
  console.error("Uncaught exception:", err)
  console.error("Exception origin:", origin)
})
