/*
============================================================
SECURECAM - ACTIVITY DASHBOARD SCRIPT (activity.js)
============================================================
*/

const params = new URLSearchParams(window.location.search);
const urlCameraId = params.get("camera");
const storedCameraId = localStorage.getItem("securecam_activity_room");

console.log("=== ACTIVITY PAGE LOADED ===");
console.log("URL camera ID:", urlCameraId);
console.log("Stored camera ID:", storedCameraId);

let cameraId = null;

if (urlCameraId) {
  cameraId = urlCameraId;
  localStorage.setItem("securecam_activity_room", urlCameraId);
  console.log("Using camera ID from URL:", cameraId);
} else if (storedCameraId) {
  cameraId = storedCameraId;
  console.log("Using camera ID from storage:", cameraId);
}

if (!cameraId) {
  console.warn("NO CAMERA ID FOUND!");
}

console.log("Final cameraId:", cameraId);

const barCtx = document.getElementById("barChart");
const pieCtx = document.getElementById("pieChart");

console.log("Chart elements found:", { barCtx: !!barCtx, pieCtx: !!pieCtx });

let barChart;
let pieChart;

let alarmCount = 0;
let coverCount = 0;
let humanDetectionCount = 0;

let latestMotionData = [];
let lastTableUpdate = 0;

function createCharts() {
  console.log("=== CREATING CHARTS ===");
  if (!barCtx || !pieCtx) {
    console.error("Chart canvas not found!");
    return;
  }

  console.log("Initializing bar chart...");
  barChart = new Chart(barCtx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [{
        label: "Motion Count",
        data: [],
        backgroundColor: "#38bdf8",
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      }
    }
  });

  console.log("Initializing pie chart...");
  pieChart = new Chart(pieCtx, {
    type: "doughnut",
    data: {
      labels: ["High", "Low", "None"],
      datasets: [{
        data: [0, 0, 100],
        backgroundColor: ["red", "orange", "green"],
        borderWidth: 0
      }]
    },
    options: {
      cutout: "65%"
    }
  });

  console.log("Charts created successfully!");
}

async function loadMotionData() {
  console.log("=== LOAD MOTION DATA CALLED ===");
  console.log("cameraId:", cameraId);

  if (!cameraId || cameraId === "null" || cameraId === "undefined") {
    console.error("No camera ID - aborting!");
    updateActivityStatus("error", "No camera selected. Go to Live page first.");
    return;
  }

  updateActivityStatus("loading", "Loading activity data for camera: " + cameraId + "...");

  try {
    let motionData = [];
    let alarmData = { viewer_alarm_times: [], camera_cover_times: [] };
    let humanData = [];

    console.log("Fetching motion data...");
    try {
      const motionRes = await fetch("/api/activity/motion?camera=" + encodeURIComponent(cameraId));
      console.log("Motion API status:", motionRes.status);
      if (motionRes.ok) {
        motionData = await motionRes.json();
        console.log("Motion data received:", motionData);
      } else {
        console.error("Motion API failed with status:", motionRes.status);
      }
    } catch (e) {
      console.error("Motion API exception:", e);
    }

    console.log("Fetching alarm data...");
    try {
      const alarmRes = await fetch("/api/activity/alarms?camera=" + encodeURIComponent(cameraId));
      console.log("Alarm API status:", alarmRes.status);
      if (alarmRes.ok) {
        alarmData = await alarmRes.json();
        console.log("Alarm data received:", alarmData);
      } else {
        console.error("Alarm API failed with status:", alarmRes.status);
      }
    } catch (e) {
      console.error("Alarm API exception:", e);
    }

    console.log("Fetching human detection data...");
    try {
      const humanRes = await fetch("/api/activity/human_detections?camera=" + encodeURIComponent(cameraId));
      console.log("Human API status:", humanRes.status);
      if (humanRes.ok) {
        humanData = await humanRes.json();
        console.log("Human data received:", humanData);
      } else {
        console.error("Human API failed with status:", humanRes.status);
      }
    } catch (e) {
      console.error("Human API exception:", e);
    }

    console.log("=== PROCESSING DATA ===");
    const safeMotionData = Array.isArray(motionData) ? motionData : [];
    const alarmTimes = Array.isArray(alarmData.viewer_alarm_times) ? alarmData.viewer_alarm_times : [];
    const coverTimes = Array.isArray(alarmData.camera_cover_times) ? alarmData.camera_cover_times : [];
    const humanTimes = Array.isArray(humanData) ? humanData : [];

    alarmCount = alarmTimes.length;
    coverCount = coverTimes.length;
    humanDetectionCount = humanTimes.length;

    console.log("Processed counts:", { alarmCount, coverCount, humanDetectionCount, motionRows: safeMotionData.length });

    const totalEvents = safeMotionData.length + alarmTimes.length + coverTimes.length + humanTimes.length;
    console.log("Total events:", totalEvents);

    if (totalEvents === 0) {
      console.warn("NO EVENTS FOUND!");
      updateActivityStatus("loading", "No activity data yet. Make sure the camera is active and motion is being detected.");
    } else {
      console.log("EVENTS FOUND! Updating UI...");
      updateActivityStatus("success", "Showing " + totalEvents + " events for camera: " + cameraId);
    }

    const latestTime = safeMotionData.length
      ? Number(safeMotionData[safeMotionData.length - 1].time) || 0
      : 0;

    const windowStart = Math.max(0, latestTime - 15);

    let alarmTriggered = 0;

    alarmTimes.forEach(t => {
      const timeVal = Number(t) || 0;
      if (timeVal >= windowStart && timeVal <= latestTime) {
        alarmTriggered = 1;
      }
    });

    coverTimes.forEach(t => {
      const timeVal = Number(t) || 0;
      if (timeVal >= windowStart && timeVal <= latestTime) {
        alarmTriggered = 1;
      }
    });

    const labels = [];
    const motions = [];

    console.log("Updating bar chart with", safeMotionData.length, "data points");
    safeMotionData.forEach(row => {
      labels.push((row.time || 0) + "s");
      motions.push(Number(row.motion) || 0);
    });

    latestMotionData = safeMotionData;

    console.log("Calling updateBarChart...");
    updateBarChart(labels, motions);

    console.log("Calling calculateRisk...");
    calculateRisk(latestMotionData);

    if (Date.now() - lastTableUpdate > 5000) {
      console.log("Calling updateTable...");
      updateTable(latestMotionData, alarmTimes, coverTimes, humanTimes);
      lastTableUpdate = Date.now();
    }

    console.log("=== LOAD COMPLETE ===");

  } catch (e) {
    console.error("Activity load error:", e);
    updateActivityStatus("error", "Error loading activity data: " + e.message);
  }
}

function updateBarChart(labels, motions) {
  console.log("=== UPDATE BAR CHART ===");
  console.log("barChart exists:", !!barChart);
  console.log("Labels:", labels);
  console.log("Motions:", motions);

  if (!barChart) {
    console.error("barChart is null!");
    return;
  }

  const maxPoints = 15;

  if (labels.length > maxPoints) {
    labels = labels.slice(-maxPoints);
    motions = motions.slice(-maxPoints);
  }

  barChart.data.labels = labels;
  barChart.data.datasets[0].data = motions;
  barChart.options.scales = {
    y: {
      beginAtZero: true,
      suggestedMax: 2,
      ticks: {
        stepSize: 1
      }
    }
  };

  console.log("Calling barChart.update()...");
  barChart.update();
  console.log("Bar chart updated!");
}

function updateTable(data, alarmTimes = [], coverTimes = [], humanTimes = []) {
  console.log("=== UPDATE TABLE ===");
  console.log("Data rows:", data.length);
  console.log("Alarm times:", alarmTimes);
  console.log("Cover times:", coverTimes);
  console.log("Human times:", humanTimes);

  const tbody = document.querySelector("#activityTable tbody");
  if (!tbody) {
    console.error("Table body not found!");
    return;
  }

  tbody.innerHTML = "";

  const maxRows = 15;
  let rows = data;

  if (rows.length > maxRows) {
    rows = rows.slice(-maxRows);
  }

  console.log("Creating", rows.length, "table rows");

  rows.forEach((row) => {
    const motionValue = Number(row.motion) || 0;
    const timeValue = Number(row.time) || 0;

    let activity = "None";
    let levelClass = "none";

    if (motionValue >= 1) {
      activity = "Motion";
      levelClass = "low";
    }

    let alarmText = "No";

    const hasViewerAlarm = alarmTimes.some(t => Math.abs((Number(t) || 0) - timeValue) <= 2);
    const hasCoverAlarm = coverTimes.some(t => Math.abs((Number(t) || 0) - timeValue) <= 2);
    const hasHumanDetection = humanTimes.some(t => Math.abs((Number(t) || 0) - timeValue) <= 2);

    if (hasHumanDetection) {
      alarmText = "Human Detected";
      levelClass = "high";
      activity = "INTRUSION";
    } else if (hasViewerAlarm && hasCoverAlarm) {
      alarmText = "Viewer + Cover";
      levelClass = "high";
      activity = "Critical";
    } else if (hasViewerAlarm) {
      alarmText = "Viewer Alarm";
      levelClass = "high";
      activity = motionValue >= 1 ? "Motion + Alarm" : "Alarm";
    } else if (hasCoverAlarm) {
      alarmText = "Cover Alarm";
      levelClass = "high";
      activity = motionValue >= 1 ? "Motion + Cover" : "Cover Attempt";
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${timeValue}s</td>
      <td><span class="level ${levelClass}">${activity}</span></td>
      <td>${motionValue}</td>
      <td>${alarmText}</td>
    `;

    tbody.appendChild(tr);
  });

  console.log("Table updated with", rows.length, "rows");
}

function calculateRisk(data) {
  console.log("=== CALCULATE RISK ===");

  let totalMotion = 0;

  data.forEach(row => {
    totalMotion += Number(row.motion) || 0;
  });

  let riskScore = 0;
  let reasons = [];

  // Motion is a minor factor
  if (totalMotion >= 8) {
    riskScore += 10;
    reasons.push("Repeated motion detected");
  } else if (totalMotion >= 3) {
    riskScore += 5;
    reasons.push("Some motion detected");
  }

  // Viewer alarm is a major factor
  if (alarmCount >= 3) {
    riskScore += 45;
    reasons.push("Viewer triggered alarm multiple times");
  } else if (alarmCount >= 1) {
    riskScore += 30;
    reasons.push("Viewer triggered alarm");
  }

  // Camera cover is also a major factor
  if (coverCount >= 3) {
    riskScore += 50;
    reasons.push("Camera cover detected multiple times");
  } else if (coverCount >= 1) {
    riskScore += 35;
    reasons.push("Camera cover attempt detected");
  }

  // Human detection is the highest priority
  if (humanDetectionCount >= 1) {
    riskScore += 60;
    reasons.push("Human intrusion detected!");
  }

  let high = 0;
  let low = 0;
  let none = 0;

  let riskLevel = "No Risk";
  let color = "green";

  if (riskScore >= 50) {
    high = 100;
    riskLevel = "High Risk";
    color = "red";
  } else if (riskScore >= 15) {
    low = 100;
    riskLevel = "Low Risk";
    color = "orange";
  } else {
    none = 100;
  }

  if (reasons.length === 0) {
    reasons.push("No major suspicious activity detected");
  }

  console.log("Risk calculated:", { riskLevel, riskScore, reasons });

  updatePieChart(high, low, none);
  updateRiskPanel(riskLevel, color, reasons);
  updateSummary(totalMotion, riskLevel);
}

function updatePieChart(high, low, none) {
  console.log("=== UPDATE PIE CHART ===");
  console.log("pieChart exists:", !!pieChart);
  console.log("Data:", { high, low, none });

  if (!pieChart) {
    console.error("pieChart is null!");
    return;
  }

  pieChart.data.datasets[0].data = [high, low, none];
  pieChart.update();
}

function updateRiskPanel(level, color, reasons) {
  console.log("=== UPDATE RISK PANEL ===");
  console.log("Level:", level, "Color:", color);

  const riskElement = document.getElementById("riskLevel");
  const reasonList = document.getElementById("riskReasons");
  const actionList = document.getElementById("riskActions");

  if (!riskElement || !reasonList || !actionList) {
    console.error("Risk panel elements not found!");
    return;
  }

  riskElement.innerHTML = `<span class="dot"></span> ${level}`;
  riskElement.style.background = color + "20";

  const dot = riskElement.querySelector(".dot");
  if (dot) {
    dot.style.background = color;
  }

  reasonList.innerHTML = "";
  actionList.innerHTML = "";

  let actions = [];

  if (level === "High Risk") {
    actions.push("Check live feed immediately");
    actions.push("Inspect camera surroundings");
  } else if (level === "Low Risk") {
    actions.push("Monitor activity closely");
  } else {
    actions.push("System operating normally");
  }

  reasons.forEach(r => {
    const li = document.createElement("li");
    li.innerText = r;
    reasonList.appendChild(li);
  });

  actions.forEach(a => {
    const li = document.createElement("li");
    li.innerText = a;
    actionList.appendChild(li);
  });
}

async function updateSummary(totalMotion, riskLevel) {
  console.log("=== UPDATE SUMMARY ===");

  try {
    const res = await fetch("/api/activity/summary?camera=" + encodeURIComponent(cameraId));
    console.log("Summary API status:", res.status);

    if (!res.ok) throw new Error("Summary API failed");

    const data = await res.json();
    console.log("Summary data:", data);

    const totalMotionValue = Number(data.total_motion) || totalMotion || 0;
    const viewerAlarms = Number(data.viewer_alarms) || 0;
    const cameraCovers = Number(data.camera_covers) || 0;
    const humanDetections = Number(data.human_detections) || 0;
    const totalAlarms = viewerAlarms + cameraCovers + humanDetections;

    const summaryText = document.getElementById("summaryText");
    if (!summaryText) {
      console.error("Summary text element not found!");
      return;
    }

    summaryText.innerText =
`Current Risk Level: ${riskLevel}

Total Motion Detections: ${totalMotionValue}
Viewer Alarm Triggers: ${viewerAlarms}
Camera Cover Attempts: ${cameraCovers}
Human Intrusion Events: ${humanDetections}
Total Security Events: ${totalAlarms}

Risk is calculated from alarms, camera covers, and human detections.`;

    const summaryCard = document.querySelector(".summary");
    if (summaryCard) {
      summaryCard.style.display = "block";
    }

    console.log("Summary updated!");
  } catch (e) {
    console.error("Summary fetch error:", e);
    const summaryText = document.getElementById("summaryText");
    if (summaryText) {
      summaryText.innerText = "Unable to load summary data. Please check if the camera is active and connected.";
      summaryText.style.color = "#fda4af";
    }
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

function updateActivityStatus(status, message) {
  console.log("STATUS UPDATE:", status, "-", message);
  const statusEl = document.getElementById("activityStatus");
  const statusText = document.getElementById("statusText");
  const dot = statusEl ? statusEl.querySelector(".status-dot") : null;
  
  if (statusEl) {
    statusEl.className = "activity-status " + status;
  }
  if (statusText) {
    statusText.textContent = message;
  }
  if (dot) {
    dot.className = "status-dot " + status;
  }
}

console.log("=== STARTING ACTIVITY PAGE ===");
createCharts();
console.log("Calling initial loadMotionData...");
loadMotionData();
console.log("Setting up 5 second interval...");
setInterval(loadMotionData, 5000);

function goToLivePage() {
  if (!cameraId) {
    window.location.href = "/live";
    return;
  }

  localStorage.setItem("securecam_live_room", cameraId);
  localStorage.setItem("securecam_live_active", "1");
  window.location.href = "/live";
}
