import { socket } from "./socket";
import { pc } from "./webrtc";
import { v4 as uuidv4 } from "uuid";
import * as lamejs from "@breezystack/lamejs";

let remoteStream: MediaStream;
let localStream: MediaStream;

let callId = new URLSearchParams(window.location.search).get("id");
let userId = uuidv4();

let intervalId: number;

let isHelpOn = false;

if (!callId) {
  callId = uuidv4();
  window.history.pushState("", "", `/?id=${callId}`);
}

// Video elements
const webcamVideo: HTMLVideoElement | null =
  document.querySelector("#webcam-video");
const remoteVideo: HTMLVideoElement | null =
  document.querySelector("#remote-video");

const helpToggle: HTMLButtonElement | null =
  document.querySelector("#help-toggle");

webcamVideo && (webcamVideo.muted = true);

// Add a reference to the mute button
const muteButton: HTMLButtonElement | null =
  document.querySelector("#mute-button");

let recordedAudioChunk: number[] = [];
// Function to toggle the microphone
function toggleMicrophone() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    if (muteButton) {
      muteButton.textContent = audioTrack.enabled ? "Mute" : "Unmute";
    }

    if (audioTrack.enabled) {
      // start recording
      const audioTrack = localStream.getAudioTracks()[0];
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
        recordedAudioChunk = recordedAudioChunk.concat(Array.from(inputData));
      };
    } else {
      const SAMPLE_RATE = 44100; // Adjust this to match your audio context's sample rate
      if (recordedAudioChunk.length > 0) {
        // Convert float audio data to 16-bit PCM
        const pcmData = new Int16Array(recordedAudioChunk.length);
        for (let i = 0; i < recordedAudioChunk.length; i++) {
          pcmData[i] =
            Math.max(-1, Math.min(1, recordedAudioChunk[i])) * 0x7fff;
        }

        // Initialize MP3 encoder
        const mp3encoder = new lamejs.Mp3Encoder(1, SAMPLE_RATE, 128);

        // Encode to MP3
        const mp3Data = mp3encoder.encodeBuffer(pcmData);

        // Finalize the encoding
        const mp3Final = mp3encoder.flush();

        // Combine the encoded data
        const mp3Blob = new Blob([mp3Data, mp3Final], { type: "audio/mp3" });

        // Convert Blob to ArrayBuffer
        mp3Blob.arrayBuffer().then((buffer) => {
          // Send the MP3 data to the server
          socket.emit("audio-data", {
            roomId: callId,
            userId,
            audioData: buffer,
          });
          console.log("Emitted 'audio-data'", buffer.byteLength, "bytes");
        });

        recordedAudioChunk = []; // Clear the chunk after sending
      }
    }
  }
}

if (helpToggle) {
  helpToggle.textContent = isHelpOn ? "Turn off Help" : "Turn on Help";
}

function toggleHelp() {
  isHelpOn = !isHelpOn;
  if (helpToggle) {
    helpToggle.textContent = isHelpOn ? "Turn off Help" : "Turn on Help";
  }

  if (isHelpOn) {
    sendAudioData((buffer) => {
      socket.emit("help-request", {
        roomId: callId,
        userId,
        audioData: buffer,
      });
      console.log("Emitted 'help-request'", buffer.byteLength, "bytes");
    });
  } else {
    clearInterval(intervalId);
  }
}

// Attach event listener to the mute button
if (muteButton) {
  muteButton.addEventListener("click", toggleMicrophone);
}

if (helpToggle) {
  helpToggle.addEventListener("click", toggleHelp);
}

function sendAudioData(callback: (audioData: ArrayBuffer) => void) {
  console.log("mp3 setup started");
  // Send audio to server for processing

  // const audioTrack = localStream.getAudioTracks()[0];
  // const audioContext = new AudioContext();
  // const sourceNode = audioContext.createMediaStreamSource(
  //   new MediaStream([audioTrack])
  // );
  // const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);

  // sourceNode.connect(scriptNode);
  // scriptNode.connect(audioContext.destination);

  // let audioChunk: number[] = [];
  const CHUNK_DURATION = 10000; // 10 seconds in milliseconds
  const SAMPLE_RATE = 44100; // Adjust this to match your audio context's sample rate

  // scriptNode.onaudioprocess = (audioProcessingEvent) => {
  //   const inputBuffer = audioProcessingEvent.inputBuffer;
  //   const inputData = inputBuffer.getChannelData(0);
  //   audioChunk = audioChunk.concat(Array.from(inputData));
  // };

  intervalId = setInterval(() => {
    let audioChunk: number[] = recordedAudioChunk;
    console.log("interval running");
    if (audioChunk.length > 0) {
      // Convert float audio data to 16-bit PCM
      const pcmData = new Int16Array(audioChunk.length);
      for (let i = 0; i < audioChunk.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, audioChunk[i])) * 0x7fff;
      }

      // Initialize MP3 encoder
      const mp3encoder = new lamejs.Mp3Encoder(1, SAMPLE_RATE, 128);

      // Encode to MP3
      const mp3Data = mp3encoder.encodeBuffer(pcmData);

      // Finalize the encoding
      const mp3Final = mp3encoder.flush();

      // Combine the encoded data
      const mp3Blob = new Blob([mp3Data, mp3Final], { type: "audio/mp3" });

      // Convert Blob to ArrayBuffer
      mp3Blob.arrayBuffer().then((buffer) => {
        // Send the MP3 data to the server
        callback(buffer);
      });
      // download the blob
      const url = URL.createObjectURL(mp3Blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = "audio.mp3";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      audioChunk = []; // Clear the chunk after sending
    }
  }, CHUNK_DURATION);
}

// Function to initialize the peer connection
function initializePeerConnection() {
  // No need to reassign pc, just configure it
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("new-icecandidate", event.candidate);
      console.log("Emitted 'new-icecandidate'");
    }
  };

  pc.ontrack = (event) => {
    remoteStream?.addTrack(event.track);
    console.log("Received track:", event.track);

    if (event.track.kind === "video") {
      const videoTrack = event.track as MediaStreamTrack;

      // Create a new ImageCapture object
      const imageCapture = new (window as any).ImageCapture(videoTrack);

      // Function to check for video data
      const checkVideoData = async () => {
        try {
          const imageBitmap = await imageCapture.grabFrame();
          console.log(
            "Received video data. Frame size:",
            imageBitmap.width,
            "x",
            imageBitmap.height
          );
          // If we successfully grab a frame, we're receiving video data
        } catch (error) {
          console.log("No video data received yet:", error);
          // If we can't grab a frame, try again after a short delay
          setTimeout(checkVideoData, 1000);
        }
      };

      // Start checking for video data
      checkVideoData();
    }

    // Ensure the remote video element is updated
    if (remoteVideo) {
      remoteVideo.srcObject = remoteStream;
      console.log("Updated remote video srcObject");
    }
  };
}

// Function to start the call
async function startCall() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

  // Mute the microphone by default
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = false;
  if (muteButton) {
    muteButton.textContent = "Unmute";
  }

  remoteStream = new MediaStream();

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  if (webcamVideo) webcamVideo.srcObject = localStream;
  if (remoteVideo) remoteVideo.srcObject = remoteStream;

  socket.emit("join-room", callId, userId);
  console.log(`Emitted 'join-room' with callId: ${callId}, userId: ${userId}`);

  // sendAudioData((buffer) => {
  //   socket.emit("audio-data", {
  //     roomId: callId,
  //     userId,
  //     audioData: buffer,
  //   });
  //   console.log("Emitted 'audio-data'", buffer.byteLength, "bytes");
  // });
}

// Initialize the peer connection and start the call
initializePeerConnection();
startCall();

socket.on("user-connected", async () => {
  console.log("Received 'user-connected' event");
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("call-offer", userId, offer);
  console.log(`Emitted 'call-offer' for userId: ${userId}`);
});

socket.on("user-offer", async (uid, offer) => {
  console.log(`Received 'user-offer' from userId: ${uid}`);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("call-answer", userId, answer);
  console.log(`Emitted 'call-answer' for userId: ${userId}`);
});

socket.on("user-answer", async (uid, answer) => {
  console.log(`Received 'user-answer' from userId: ${uid}`);
  const remoteDesc = new RTCSessionDescription(answer);
  await pc.setRemoteDescription(remoteDesc);

  // Ensure the remote video element is updated
  if (remoteVideo) {
    remoteVideo.srcObject = remoteStream;
    console.log("Updated remote video srcObject after answer");
  }
});

socket.on("user-disconnected", () => {
  console.log("Received 'user-disconnected' event");
  remoteStream = new MediaStream();

  if (remoteVideo) remoteVideo.srcObject = remoteStream;
});

socket.on("new-icecandidate", async (candidate) => {
  console.log("Received 'new-icecandidate' event");
  await pc.addIceCandidate(candidate);

  // Ensure the remote video element is updated
  if (remoteVideo) {
    remoteVideo.srcObject = remoteStream;
    console.log("Updated remote video srcObject after new ICE candidate");
  }
});

socket.on("processed-audio", (processedAudioData) => {
  console.log("Received 'processed-audio' event", processedAudioData);
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

socket.on("help-response", (helpResponse) => {
  console.log("Received 'help-response' event", helpResponse);
});
