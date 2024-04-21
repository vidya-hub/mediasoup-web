window.addEventListener("DOMContentLoaded", main);
function main() {
  const btnLocalVideo = document.getElementById("btnLocalVideo");
  const btnRtpCapabilities = document.getElementById("btnRtpCapabilities");
  const localVideo = document.getElementById("localVideo");
  const io = require("socket.io-client");

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
    socket.emit("getRtpCapabilities", params, (data) => {
      console.log("Received RTP capabilities:", data);
      rtpCapabilities = data;
    });
  }
  btnLocalVideo.addEventListener("click", getLocalStream);
  btnRtpCapabilities.addEventListener("click", getRtpCapabilities);
  // btnDevice.addEventListener('click', createDevice)
  // btnCreateSendTransport.addEventListener('click', createSendTransport)
  // btnConnectSendTransport.addEventListener('click', connectSendTransport)
  // btnRecvSendTransport.addEventListener('click', createRecvTransport)
  // btnConnectRecvTransport.addEventListener('click', connectRecvTransport)
}
