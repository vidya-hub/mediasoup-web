const express = require("express");
var { createServer } = require("httpolyglot");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const mediasoup = require("mediasoup");
const { RecvRtpHeaderExtensions } = require("mediasoup/node/lib/fbs/transport");

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
let producerTransport;
let consumerTransport;
let producer;
let consumer;

const createWorker = async () => {
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  });
};

createWorker();
const createWebRtcTransport = async (callback) => {
  try {
    const webRtcTransport_options = {
      listenIps: [
        {
          ip: "0.0.0.0", // replace with relevant IP address
          announcedIp: "127.0.0.1",
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    };

    let transport = await router.createWebRtcTransport(webRtcTransport_options);
    console.log(transport);
    const tpParams = {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
    console.log(`Created transport ${tpParams}`);
    transport.on("close", () => {
      console.log(`Transport ${transport.id} closed`);
    });
    transport.on("dltsstatechage", (dltsstate) => {
      if (dltsstate === "closed") {
        transport.close();
      }
    });
    callback({
      params: tpParams,
    });
    return transport;
  } catch (error) {
    console.error(error);
    callback({
      params: {
        error: error.message,
      },
    });
  }
};
peers.on("connection", async (socket) => {
  console.log(socket.id);
  socket.emit("connection-success", {
    socketId: socket.id,
  });
  router = await worker.createRouter(mediaCodecs);
  socket.on("disconnect", () => {
    // do some cleanup
    console.log("peer disconnected");
  });
  socket.on("getRtpCapabilities", (callback) => {
    const rtpCapabilities = router.rtpCapabilities;
    callback({ rtpCapabilities });
  });
  socket.on("createWebRtcTransport", async ({ sender }, callback) => {
    if (sender) {
      producerTransport = await createWebRtcTransport(callback);
    } else {
      consumerTransport = await createWebRtcTransport(callback);
    }
  });
  socket.on("transport-connect", async ({ dtlsParameters }) => {
    console.log("Transport connected ", dtlsParameters);
    await producerTransport.connect({ dtlsParameters });
  });
  socket.on(
    "transport-produce",
    async ({ kind, rtpParameters, appData }, callback) => {
      producer = await producerTransport.produce({
        kind,
        rtpParameters,
      });
      producer.on("transportclose", () => {
        console.log("Transport closed");
        producer.close();
      });
      callback({ id: producer.id });
    }
  );
  socket.on("transport-recv-connect", async ({ dtlsParameters }) => {
    await consumerTransport.connect({ dtlsParameters });
  });
  socket.on("consume", async ({ rtpCapabilities }, callback) => {
    try {
      if (
        router.canConsume({
          producerId: producer.id,
          rtpCapabilities,
        })
      ) {
        consumer = await consumerTransport.consume({
          producerId: producer.id,
          rtpCapabilities,
          paused: true,
        });

        consumer.on("transportclose", () => {
          console.log("transport close from consumer");
        });

        consumer.on("producerclose", () => {
          console.log("producer of consumer closed");
        });
        const params = {
          id: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        };

        // send the parameters to the client
        callback({ params });
      }
    } catch (error) {}
  });
  socket.on("consumer-resume", async () => {
    console.log("consumer resume");
    await consumer.resume();
  });
});
