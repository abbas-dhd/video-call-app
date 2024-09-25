import { socket } from "./socket";
import { pc } from "./webrtc";
import { v4 as uuidv4 } from "uuid";

let remoteStream: MediaStream | null = null;

let callId = new URLSearchParams(window.location.search).get("id");
let userId = uuidv4();

if (!callId) {
  callId = uuidv4();
  window.history.pushState("", "", `/?id=${callId}`);
}

// Video elements
const webcamVideo: HTMLVideoElement | null =
  document.querySelector("#webcam-video");
const remoteVideo: HTMLVideoElement | null =
  document.querySelector("#remote-video");

webcamVideo && (webcamVideo.muted = true);

navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: true,
  })
  .then(async (localStream) => {
    remoteStream = new MediaStream();

    const videoTrack = localStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];

    pc.addTrack(videoTrack);

    // Send audio to server for processing
    const audioContext = new AudioContext();
    const sourceNode = audioContext.createMediaStreamSource(
      new MediaStream([audioTrack])
    );
    const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);

    sourceNode.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

    scriptNode.onaudioprocess = (audioProcessingEvent) => {
      const inputBuffer = audioProcessingEvent.inputBuffer;
      const inputData = inputBuffer.getChannelData(0);
      socket.emit("audio-data", Array.from(inputData));
    };

    pc.ontrack = (event) => {
      remoteStream?.addTrack(event.track);
      console.log(event);
    };

    if (webcamVideo) webcamVideo.srcObject = localStream;
    if (remoteVideo) remoteVideo.srcObject = remoteStream;

    socket.emit("join-room", callId, userId);
  });

socket.on("user-connected", async () => {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("call-offer", userId, offer);
});

socket.on("user-offer", async (uid, offer) => {
  pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("call-answer", userId, answer);
});

socket.on("user-answer", async (uid, answer) => {
  const remoteDesc = new RTCSessionDescription(answer);
  await pc.setRemoteDescription(remoteDesc);
});

socket.on("user-disconnected", () => {
  remoteStream = new MediaStream();

  if (remoteVideo) remoteVideo.srcObject = remoteStream;
});

socket.on("new-icecandidate", async (candidate) => {
  await pc.addIceCandidate(candidate);
});

pc.addEventListener("icecandidate", (event) => {
  if (event.candidate) {
    socket.emit("new-icecandidate", event.candidate);
  }
});

socket.on("processed-audio", (processedAudioData) => {
  console.log(processedAudioData);
  const audioContext = new AudioContext();
  const buffer = audioContext.createBuffer(
    1,
    processedAudioData.length,
    audioContext.sampleRate
  );
  buffer.getChannelData(0).set(processedAudioData);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();
});
