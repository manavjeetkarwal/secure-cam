const socket = io();

let localStream = null;
let peerConnections = {};
let cameraId = null;

let viewers = {};

let motionTimer = null;
let motionStartTime = null;

let currentFacingMode = "environment";

// 
let humanDetectionEnabled = false;
let humanDetectionModel = null;
let humanDetectionTimer = null;
let humanStableHits = 0;
let lastHumanAlertTime = 0;
let humanDetectionBusy = false;

const video = document.getElementById("localVideo");
const viewerList = document.getElementById("viewerList");
const viewerSelect = document.getElementById("viewerSelect");
const viewerCount = document.getElementById("viewerCount");

const alarmSound = document.getElementById("alarmSound");

const coverCanvas = document.getElementById("coverCanvas");
const coverCtx = coverCanvas.getContext("2d");

let coverTimer = null;
let darkFrames = 0;
let lastCoverTriggerTime = 0;

const alertOverlay = document.getElementById("alertOverlay");
let locationTimer = null;

const CAMERA_STATE_KEY = "securecam_camera_state";

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "securecam1",
      credential: "securecam1"
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "securecam1",
      credential: "securecam1"
    },
    {
      urls: "turn:global.relay.metered.ca:443?transport=tcp",
      username: "securecam1",
      credential: "securecam1"
    }
  ]
};

async function loadHumanDetectionModel() {
  if (humanDetectionModel) return humanDetectionModel;

  try {
    humanDetectionModel = await cocoSsd.load();
    console.log("Human detection model loaded");
    return humanDetectionModel;
  } catch (e) {
    console.error("Human detection model load error:", e);
    throw e;
  }
}

async function toggleHumanDetection() {
  const btn = document.getElementById("humanDetectBtn");

  if (!localStream || !cameraId) {
    alert("Start camera first");
    return;
  }

  if (!humanDetectionEnabled) {
    try {
      if (btn) btn.innerText = "Human Detection: Loading...";
      await loadHumanDetectionModel();

      humanDetectionEnabled = true;
      humanStableHits = 0;
      lastHumanAlertTime = 0;

      if (btn) btn.innerText = "Human Detection: ON";
      startHumanDetection();
    } catch (e) {
      if (btn) btn.innerText = "Human Detection: OFF";
      alert("Failed to load human detection model");
    }
  } else {
    stopHumanDetection();
    if (btn) btn.innerText = "Human Detection: OFF";
  }
}


function toggleMenu() {
  const menu = document.getElementById("sideMenu");
  if (!menu) return;

  if (menu.style.right === "0px") {
    menu.style.right = "-300px";
  } else {
    menu.style.right = "0px";
  }
}

function generateId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function saveCameraState() {
  if (!cameraId) return;

  sessionStorage.setItem(CAMERA_STATE_KEY, JSON.stringify({
    active: true,
    cameraId: cameraId,
    facingMode: currentFacingMode
  }));
}

function clearCameraState() {
  sessionStorage.removeItem(CAMERA_STATE_KEY);
}

function loadCameraState() {
  try {
    const raw = sessionStorage.getItem(CAMERA_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function getElapsedSessionTime() {
  if (!motionStartTime) return 0;
  return Math.max(0, Math.floor((Date.now() - motionStartTime) / 1000));
}

function stopLocalStream() {
  if (localStream) {
    localStream.getTracks().forEach(track => {
      try { track.stop(); } catch (e) {}
    });
    localStream = null;
  }

  if (video) {
    video.srcObject = null;
  }
}

function closeAllPeerConnections() {
  Object.keys(peerConnections).forEach(id => {
    try { peerConnections[id].close(); } catch (e) {}
  });
  peerConnections = {};
}

function closePeerConnection(viewerId) {
  if (peerConnections[viewerId]) {
    try { peerConnections[viewerId].close(); } catch (e) {}
    delete peerConnections[viewerId];
  }
}

async function getCameraStreamByFacingMode(facingMode, withAudio = true) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: facingMode } },
      audio: withAudio
    });
  } catch (e1) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode },
        audio: withAudio
      });
    } catch (e2) {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: withAudio
      });
    }
  }
}

async function startCamera(savedCameraId = null, silent = false) {
  try {
    const errorBox = document.getElementById("cameraError");
    if (errorBox) {
      errorBox.innerText = "";
    }

    stopLocalStream();
    closeAllPeerConnections();

    viewers = {};
    updateViewerUI();

    if (savedCameraId) {
      cameraId = savedCameraId;
    } else if (!cameraId) {
      cameraId = generateId();
    }

    document.getElementById("cameraId").innerText = cameraId;

    const devices = await navigator.mediaDevices.enumerateDevices();
const videoDevices = devices.filter(d => d.kind === "videoinput");

if (videoDevices.length === 0) {
  throw new Error("No camera found");
}

let selectedStream = null;

try {
  selectedStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { exact: currentFacingMode } },
    audio: true
  });
} catch (e1) {
  try {
    selectedStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode },
      audio: true
    });
  } catch (e2) {
    selectedStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: videoDevices[0].deviceId } },
      audio: true
    });
  }
}

localStream = selectedStream;

    video.srcObject = localStream;

    await new Promise(resolve => {
      video.onloadedmetadata = () => resolve();
    });

    motionStartTime = Date.now();

    socket.emit("join", {
      room: cameraId,
      role: "camera"
    });

    startLocationUpdates();
    startCoverDetection();
    startMotionDetection();
    saveCameraState();

  } catch (err) {
    console.error("Camera start error:", err);
    clearCameraState();

    if (silent) {
      return;
    }

    if (err.name === "NotReadableError") {
      alert("Camera busy. Close other apps or refresh.");
    } else if (err.name === "NotAllowedError") {
      alert("Please allow camera permission.");
    } else if (err.name === "NotFoundError") {
      alert("No camera device found.");
    } else {
      alert("Camera failed to start.");
    }
  }
}

async function switchCamera() {
  if (!localStream) {
    alert("Start camera first");
    return;
  }

  try {
    document.getElementById("cameraError").innerText = "";

    currentFacingMode =
      currentFacingMode === "environment" ? "user" : "environment";

    const oldVideoTrack = localStream.getVideoTracks()[0];
    const oldAudioTrack = localStream.getAudioTracks()[0];

    if (oldVideoTrack) {
      try { oldVideoTrack.stop(); } catch (e) {}
    }

    let newVideoStream;

    try {
      newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: currentFacingMode } },
        audio: false
      });
    } catch (err) {
      newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingMode },
        audio: false
      });
    }

    const newVideoTrack = newVideoStream.getVideoTracks()[0];

    let finalStream;

    if (oldAudioTrack) {
      finalStream = new MediaStream([newVideoTrack, oldAudioTrack]);
    } else {
      finalStream = new MediaStream([newVideoTrack]);
    }

    video.srcObject = finalStream;

    Object.values(peerConnections).forEach(pc => {
      const videoSender = pc.getSenders().find(
        s => s.track && s.track.kind === "video"
      );
      if (videoSender && newVideoTrack) {
        videoSender.replaceTrack(newVideoTrack);
      }

      const audioSender = pc.getSenders().find(
        s => s.track && s.track.kind === "audio"
      );
      if (audioSender && oldAudioTrack) {
        audioSender.replaceTrack(oldAudioTrack);
      }
    });

    localStream = finalStream;
    saveCameraState();

  } catch (e) {
    console.error("Switch camera error:", e);
    document.getElementById("cameraError").innerText =
      "Unable to switch camera on this device.";
  }
}

function stopCamera() {
    stopHumanDetection();

  const btn = document.getElementById("humanDetectBtn");
  if (btn) {
    btn.innerText = "Human Detection: OFF";
  }

  stopLocalStream();
  closeAllPeerConnections();

  viewers = {};
  updateViewerUI();

  if (motionTimer) {
    clearInterval(motionTimer);
    motionTimer = null;
  }

  if (coverTimer) {
    clearInterval(coverTimer);
    coverTimer = null;
  }

  if (locationTimer) {
    clearInterval(locationTimer);
    locationTimer = null;
  }

  motionStartTime = null;
  darkFrames = 0;
  lastCoverTriggerTime = 0;

  stopAlarm();
  clearCameraState();

  document.getElementById("cameraId").innerText = "Stopped";
  cameraId = null;
}

function stopAlarm() {
  try {
    alarmSound.pause();
    alarmSound.currentTime = 0;
  } catch (e) {}

  alertOverlay.style.display = "none";
}

function startCoverDetection() {
  if (coverTimer) return;

  coverTimer = setInterval(() => {
    try {
      if (!video || !video.videoWidth || !video.videoHeight || !cameraId) return;

      coverCanvas.width = video.videoWidth;
      coverCanvas.height = video.videoHeight;

      coverCtx.drawImage(video, 0, 0, coverCanvas.width, coverCanvas.height);

      const frame = coverCtx.getImageData(
        0,
        0,
        coverCanvas.width,
        coverCanvas.height
      );

      const pixels = frame.data;
      let brightness = 0;

      for (let i = 0; i < pixels.length; i += 4) {
        brightness += pixels[i];
        brightness += pixels[i + 1];
        brightness += pixels[i + 2];
      }

      brightness = brightness / (pixels.length / 4) / 3;

      if (brightness < 20) {
        darkFrames++;

        if (darkFrames >= 4) {
          const now = Date.now();

          if (now - lastCoverTriggerTime > 8000) {
            triggerAlarm("Camera may be covered!");

            socket.emit("camera_cover_event", {
              room: cameraId,
              time: getElapsedSessionTime()
            });

            lastCoverTriggerTime = now;
          }

          darkFrames = 0;
        }
      } else {
        darkFrames = 0;
      }

    } catch (e) {
      console.warn("Cover detection error:", e);
    }
  }, 1500);
}

function triggerAlarm(message) {
  try {
    alarmSound.currentTime = 0;
    alarmSound.play().catch(() => {});
  } catch (e) {}

  alertOverlay.style.display = "flex";

  setTimeout(() => {
    alertOverlay.style.display = "none";
  }, 5000);
}

function startLocationUpdates() {
  if (locationTimer) return;

  locationTimer = setInterval(() => {
    if (!cameraId) return;
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        socket.emit("camera_location", {
          room: cameraId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: "gps"
        });
      },
      () => {},
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 10000
      }
    );
  }, 5000);
}

socket.on("connect", () => {
  if (localStream && cameraId) {
    socket.emit("join", {
      room: cameraId,
      role: "camera"
    });
  }
});

socket.on("viewer_ready", async (data) => {
  if (data.room !== cameraId) return;
  if (!localStream) return;

  const viewerId = data.sid;

  if (!viewers[viewerId]) {
    viewers[viewerId] = "Viewer";
    updateViewerUI();
  }

  if (peerConnections[viewerId]) {
    closePeerConnection(viewerId);
  }

  const pc = new RTCPeerConnection(config);
  peerConnections[viewerId] = pc;

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", {
        room: cameraId,
        target: viewerId,
        candidate: event.candidate
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (
      pc.connectionState === "failed" ||
      pc.connectionState === "closed" ||
      pc.connectionState === "disconnected"
    ) {
      closePeerConnection(viewerId);
    }
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("offer", {
      room: cameraId,
      target: viewerId,
      offer: offer
    });
  } catch (e) {
    console.error("Offer creation error:", e);
  }
});

socket.on("viewer_joined", (data) => {
  const viewerId = data.sid;
  const username = data.username || "Viewer";

  viewers[viewerId] = username;
  viewerCount.innerText = data.count;
  updateViewerUI();
});

socket.on("viewer_left", (data) => {
  const viewerId = data.sid;

  if (viewers[viewerId]) {
    delete viewers[viewerId];
  }

  closePeerConnection(viewerId);
  updateViewerUI();
});

function updateViewerUI() {
  viewerList.innerHTML = "";
  viewerSelect.innerHTML = '<option value="">Select viewer</option>';

  const ids = Object.keys(viewers);
  viewerCount.innerText = ids.length;

  ids.forEach(id => {
    const name = viewers[id];

    const li = document.createElement("li");
    li.innerText = name;
    viewerList.appendChild(li);

    const option = document.createElement("option");
    option.value = id;
    option.text = name;
    viewerSelect.appendChild(option);
  });
}

socket.on("answer", async (data) => {
  const pc = peerConnections[data.sid];
  if (!pc) return;

  try {
    await pc.setRemoteDescription(
      new RTCSessionDescription(data.answer)
    );
  } catch (e) {
    console.warn("Answer error:", e);
  }
});

socket.on("candidate", async (data) => {
  const pc = peerConnections[data.sid];
  if (!pc) return;

  try {
    await pc.addIceCandidate(
      new RTCIceCandidate(data.candidate)
    );
  } catch (e) {
    console.warn("ICE candidate error:", e);
  }
});

function sendChat() {
  const input = document.getElementById("chatInput");
  const msg = input.value.trim();
  const viewerId = viewerSelect.value;

  if (!viewerId) {
    alert("Select viewer first");
    return;
  }

  if (!msg) return;

  socket.emit("chat_message", {
    target: viewerId,
    sender: "Camera",
    message: msg
  });

  appendMessage("Camera", msg);
  input.value = "";
}

socket.on("chat_message", (data) => {
  appendMessage(data.sender, data.message);
});

function appendMessage(sender, msg) {
  const box = document.getElementById("messages");

  const p = document.createElement("p");
  p.innerHTML = "<b>" + sender + ":</b> " + msg;

  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
}

socket.on("manual_alarm", (data) => {
  if (data.room !== cameraId) return;
  triggerAlarm("⚠️ ALARM TRIGGERED BY VIEWER");
});

function startHumanDetection() {
  if (humanDetectionTimer) {
    clearInterval(humanDetectionTimer);
  }

  humanDetectionTimer = setInterval(async () => {
    if (humanDetectionBusy) return;
    humanDetectionBusy = true;

    try {
      if (!humanDetectionEnabled) return;
      if (!humanDetectionModel) return;
      if (!video || !video.videoWidth || !video.videoHeight) return;
      if (!cameraId) return;

      const predictions = await humanDetectionModel.detect(video);

      const persons = predictions.filter(p =>
        p.class === "person" && (p.score || 0) >= 0.66
      );

      if (persons.length > 0) {
        humanStableHits++;
      } else {
        humanStableHits = 0;
      }

      const now = Date.now();

      if (humanStableHits >= 2 && now - lastHumanAlertTime > 10000) {
        triggerAlarm("Human detected!");

        socket.emit("human_detected", {
          room: cameraId,
          time: getElapsedSessionTime(),
          count: persons.length
        });

        lastHumanAlertTime = now;
        humanStableHits = 0;
      }

    } catch (e) {
      console.warn("Human detection error:", e);
    } finally {
      humanDetectionBusy = false;
    }
  }, 1200);
}

function stopHumanDetection() {
  humanDetectionEnabled = false;
  humanStableHits = 0;
  humanDetectionBusy = false;

  if (humanDetectionTimer) {
    clearInterval(humanDetectionTimer);
    humanDetectionTimer = null;
  }
}
window.addEventListener("load", () => {
  const saved = loadCameraState();
  if (saved && saved.active && saved.cameraId) {
    currentFacingMode = saved.facingMode || "environment";
    startCamera(saved.cameraId, true);
  }
});