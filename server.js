const express = require("express");
var { createServer } = require("httpolyglot");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const mediasoup = require("mediasoup");

const app = express();
const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

var options = {
  key: fs.readFileSync("certs/server.key"),
  cert: fs.readFileSync("certs/server.crt"),
};

app.use("/sfu", express.static(path.join(__dirname, "public")));

// Create HTTPS server
const server = createServer(options, app).listen(
  9000,
  "localhost",
  function () {
    console.log("listening on port 9000");
  }
);

const socketIo = new Server(server, {
  path: "/socket.io", // Set the path for socket.io
});

const peers = socketIo.of("/mediasoup");
let worker;
let router;

const createWorker = async () => {
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  });
};

createWorker();

peers.on("connection", async (socket) => {
  console.log(socket.id);
  socket.emit("connection-success", {
    socketId: socket.id,
  });
  socket.on("disconnect", () => {
    // do some cleanup
    console.log("peer disconnected");
  });
  socket.on("getRouterCapabilities", (callback) => {
    const rtpCapabilities = router.rtpCapabilities;
    callback({ rtpCapabilities });
  });
  router = await worker.createRouter(mediaCodecs);
  console.log(worker, router);
});
