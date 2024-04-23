window.addEventListener("DOMContentLoaded", main);
function main() {
  const btnLocalVideo = document.getElementById("btnLocalVideo");
  const btnRtpCapabilities = document.getElementById("btnRtpCapabilities");
  const btnDevice = document.getElementById("btnDevice");
  const btnCreateSendTransport = document.getElementById(
    "btnCreateSendTransport"
  );
  const btnConnectSendTransport = document.getElementById(
    "btnConnectSendTransport"
  );

  const btnRecvSendTransport = document.getElementById("btnRecvSendTransport");
  const btnConnectRecvTransport = document.getElementById(
    "btnConnectRecvTransport"
  );

  const localVideo = document.getElementById("localVideo");
  const io = require("socket.io-client");
  const mediasoupClient = require("mediasoup-client");
  const socket = io("/mediasoup");

  socket.on("connect", () => {
    console.log("Connected to socket.io server");
  });

  socket.on("connection-success", ({ socketId }) => {
    console.log(`Connected with socket id: ${socketId}`);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from socket.io server");
  });
  //   const socket = io("/mediasoup");
  //   socket.on("connection-success", ({ socketId }) => {
  //     console.log(`Connected with socket id: ${socketId}`);
  //   });
  let params;
  let rtpCapabilities;
  let device;
  let producerTransport;
  let producer;
  let consumerTransport;
  let consumer;
  function getLocalStream() {
    navigator.getUserMedia(
      {
        audio: false,
        video: {
          width: {
            min: 640,
            max: 1920,
          },
          height: {
            min: 400,
            max: 1080,
          },
        },
      },
      streamSuccess,
      (error) => {
        console.log(error.message);
      }
    );
  }
  const streamSuccess = async (stream) => {
    localVideo.srcObject = stream;
    const track = stream.getVideoTracks()[0];
    params = {
      track,
      ...params,
    };
    console.log(params);
  };

  function getRtpCapabilities() {
    socket.emit("getRtpCapabilities", (data) => {
      console.log("Received RTP capabilities:", data.rtpCapabilities);
      rtpCapabilities = data.rtpCapabilities;
    });
  }
  async function createDevice() {
    try {
      device = new mediasoupClient.Device();
      await device.load({
        routerRtpCapabilities: rtpCapabilities,
      });
      console.log("Device loaded:", device);
    } catch (error) {
      console.log(error);
      if (error.name === "UnsupportedError")
        console.warn("browser not supported");
    }
  }
  async function createSendTransport() {
    socket.emit("createWebRtcTransport", { sender: true }, ({ params }) => {
      if (params.error) {
        console.log("Create webrtc transport failed", params.error);
        return;
      }
      producerTransport = device.createSendTransport(params);
      console.log("Create webrtc transport success", producerTransport);
      producerTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errBack) => {
          // emit transport-connect event
          await socket.emit("transport-connect", {
            dtlsParameters,
          });
          callback();
        }
      );
      producerTransport.on("produce", async (parameters, callback, errBack) => {
        // emit transport-produce event
        await socket.emit(
          "transport-produce",
          {
            kind: parameters.kind,
            rtpParameters: parameters.rtpParameters,
            appData: parameters.appData,
          },
          ({ id }) => {
            callback({ id });
          }
        );
      });
    });
  }
  const connectSendTransport = async () => {
    producer = await producerTransport.produce(params);

    producer.on("trackended", () => {
      console.log("track ended");

      // close video track
    });

    producer.on("transportclose", () => {
      console.log("transport ended");

      // close video track
    });
  };
  const createRecvTransport = async () => {
    await socket.emit(
      "createWebRtcTransport",
      { sender: false },
      ({ params }) => {
        if (params.error) {
          console.log("Create recv transport failed", params.error);
          return;
        }
        console.log("recv transport created", params);
        consumerTransport = device.createRecvTransport(params);
        // this will give
        // connect
        // event listener when it connects
        consumerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errBack) => {
            // emit transport-recv-connect even
            await socket.emit("transport-recv-connect", {
              dtlsParameters,
            });
            callback();
          }
        );
      }
    );
  };
  const connectRecvTransport = async () => {
    await socket.emit(
      "consume",
      { rtpCapabilities: device.rtpCapabilities },
      async ({ params }) => {
        if (params.error) {
          console.log("Cannot consume the media", params.error);
          return;
        }
        consumer = await consumerTransport.consume(params);
        const { track } = consumer;
        const remoteVideo = document.getElementById("remoteVideo");
        remoteVideo.srcObject = new MediaStream([track]);
        socket.emit("consumer-resume");
      }
    );
  };

  btnLocalVideo.addEventListener("click", getLocalStream);
  btnRtpCapabilities.addEventListener("click", getRtpCapabilities);
  btnDevice.addEventListener("click", createDevice);
  btnCreateSendTransport.addEventListener("click", createSendTransport);
  btnConnectSendTransport.addEventListener("click", connectSendTransport);
  btnRecvSendTransport.addEventListener("click", createRecvTransport);
  btnConnectRecvTransport.addEventListener("click", connectRecvTransport);
}
