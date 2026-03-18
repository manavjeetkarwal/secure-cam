/*
============================================================
SECURECAM - ACTIVITY DASHBOARD SCRIPT (activity.js)
============================================================
*/

const params = new URLSearchParams(window.location.search);
const urlCameraId = params.get("camera");
const storedCameraId = localStorage.getItem("securecam_activity_room");

let cameraId = null;

if (urlCameraId) {
  cameraId = urlCameraId;
  localStorage.setItem("securecam_activity_room", urlCameraId);
} else if (storedCameraId) {
  cameraId = storedCameraId;
}

if (!cameraId) {
  console.warn("No camera id provided");
}

const barCtx = document.getElementById("barChart");
const pieCtx = document.getElementById("pieChart");

let barChart;
let pieChart;

let alarmCount = 0;
let coverCount = 0;

let latestMotionData = [];
let lastTableUpdate = 0;

function createCharts() {
  if (!barCtx || !pieCtx) {
    console.error("Chart canvas not found");
    return;
  }

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
}

async function loadMotionData() {
  if (!cameraId || cameraId === "null" || cameraId === "undefined") return;

  try {
    const motionRes = await fetch("/api/activity/motion?camera=" + encodeURIComponent(cameraId));
    const alarmRes = await fetch("/api/activity/alarms?camera=" + encodeURIComponent(cameraId));

    if (!motionRes.ok) throw new Error("Motion API failed");
    if (!alarmRes.ok) throw new Error("Alarm API failed");

    const motionData = await motionRes.json();
    const alarmData = await alarmRes.json();

    const safeMotionData = Array.isArray(motionData) ? motionData : [];
    const alarmTimes = Array.isArray(alarmData.viewer_alarm_times) ? alarmData.viewer_alarm_times : [];
    const coverTimes = Array.isArray(alarmData.camera_cover_times) ? alarmData.camera_cover_times : [];

    alarmCount = alarmTimes.length;
    coverCount = coverTimes.length;

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

    safeMotionData.forEach(row => {
      labels.push((row.time || 0) + "s");
      motions.push(Number(row.motion) || 0);
    });

    latestMotionData = safeMotionData;

    updateBarChart(labels, motions);
    calculateRisk(latestMotionData);

    if (Date.now() - lastTableUpdate > 5000) {
      updateTable(latestMotionData, alarmTimes, coverTimes);
      lastTableUpdate = Date.now();
    }

  } catch (e) {
    console.error("Activity load error:", e);
  }
}

function updateBarChart(labels, motions) {
  if (!barChart) return;

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

  barChart.update();
}

function updateTable(data, alarmTimes = [], coverTimes = []) {
  const tbody = document.querySelector("#activityTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const maxRows = 15;
  let rows = data;

  if (rows.length > maxRows) {
    rows = rows.slice(-maxRows);
  }

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

    if (hasViewerAlarm && hasCoverAlarm) {
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
}

function calculateRisk(data) {
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

  updatePieChart(high, low, none);
  updateRiskPanel(riskLevel, color, reasons);
  updateSummary(totalMotion, riskLevel);
}

function updatePieChart(high, low, none) {
  if (!pieChart) return;
  pieChart.data.datasets[0].data = [high, low, none];
  pieChart.update();
}

function updateRiskPanel(level, color, reasons) {
  const riskElement = document.getElementById("riskLevel");
  const reasonList = document.getElementById("riskReasons");
  const actionList = document.getElementById("riskActions");

  if (!riskElement || !reasonList || !actionList) return;

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
  try {
    const res = await fetch("/api/activity/summary?camera=" + encodeURIComponent(cameraId));

    if (!res.ok) throw new Error("Summary API failed");

    const data = await res.json();

    const totalMotionValue = Number(data.total_motion) || totalMotion || 0;
    const viewerAlarms = Number(data.viewer_alarms) || 0;
    const cameraCovers = Number(data.camera_covers) || 0;
    const totalAlarms = viewerAlarms + cameraCovers;

    const summaryText = document.getElementById("summaryText");
    if (!summaryText) return;

    summaryText.innerText =
`Current Risk Level: ${riskLevel}

Total Motion Detections: ${totalMotionValue}
Viewer Alarm Triggers: ${viewerAlarms}
Camera Cover Attempts: ${cameraCovers}
Total Alarm Events: ${totalAlarms}

Risk is calculated mainly from alarm triggers and camera cover attempts.
Motion count is used as a supporting factor.`;
  } catch (e) {
    console.error("Summary fetch error:", e);
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

createCharts();
loadMotionData();
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