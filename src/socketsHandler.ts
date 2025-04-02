import { Server, Socket } from "socket.io";
import { io, socketBot } from ".";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { whatsapp } from "./whatsapp/whatsapp.methods";
import { loggerparent } from "./util/logger-service";

const logger = loggerparent.child({ service: "sockets-handler" });

export function handleSocketEvents(
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
) {

  socket.on("createWhatsappBot", (data) => {
    io.emit("createWhatsappBot", data);
  });

  socket.on("whatsappQR", (data) => {
    io.emit("whatsappQR", data);
  });

  socket.on("connect_error", (error) => {
    logger.error(new Error(`Connection error: ${error}`));
  });

  socket.on("error", (error) => {
    logger.error(new Error(`Socket error: ${error}`));
  });
}
