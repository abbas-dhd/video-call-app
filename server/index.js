const { Server } = require("socket.io");
const { AudioContext, AudioBuffer } = require("web-audio-api");

const io = new Server({
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  },
});

const audioContext = new AudioContext();

function processAudio(audioData) {
  // Example: Amplify the audio
  const gain = 1;
  return audioData.map((sample) => Math.min(1, Math.max(-1, sample * gain)));
}

io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userId) => {
    console.log("room joined", roomId);
    socket.join(roomId);
    socket.broadcast.to(roomId).emit("user-connected", userId);

    socket.on("audio-data", (audioData) => {
      const processedAudio = processAudio(audioData);
      socket.broadcast.to(roomId).emit("processed-audio", processedAudio);
    });

    socket.on("call-offer", (userId, offer) => {
      socket.broadcast.to(roomId).emit("user-offer", userId, offer);
      console.log("call-offer:", userId);
    });

    socket.on("call-answer", (userId, offer) => {
      socket.broadcast.to(roomId).emit("user-answer", userId, offer);
      console.log("call-answer:", userId);
    });

    socket.on("new-icecandidate", (candidate) => {
      socket.broadcast.to(roomId).emit("new-icecandidate", candidate);
      console.log("call-icecandidate:", roomId);
    });

    socket.on("disconnect", () => {
      socket.broadcast.to(roomId).emit("user-disconnected", userId);
      console.log("disconnect:", userId);
    });
  });
});

io.listen(3000);
