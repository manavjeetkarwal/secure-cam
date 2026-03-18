async function loadVideos() {
  const grid = document.getElementById("videoGrid");
  grid.innerHTML = "<p>Loading videos...</p>";

  try {
    const res = await fetch("/api/videos");
    const data = await res.json();

    grid.innerHTML = "";

    if (!Array.isArray(data) || data.length === 0) {
      grid.innerHTML = "<p>No videos recorded yet.</p>";
      return;
    }

    data.forEach(video => {
      const card = document.createElement("div");
      card.className = "video-card";

      const durationText = formatDuration(video.duration);

      card.innerHTML = `
        <video controls preload="metadata">
          <source src="${video.path}" type="video/webm">
          Your browser does not support video playback.
        </video>

        <div class="video-info">
          <p>Date: ${video.date || "-"}</p>
          <p>Time: ${video.time || "-"}</p>
          <p>Duration: ${durationText}</p>
        </div>

        <div class="video-buttons">
          <button onclick="downloadVideo(${video.seq})">
            Download
          </button>

          <button onclick="deleteVideo(${video.seq})">
            Delete
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

  } catch (error) {
    console.error("Video load error:", error);
    grid.innerHTML = "<p>Failed to load videos.</p>";
  }
}

function formatDuration(seconds) {
  const totalSeconds = Number(seconds) || 0;

  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

function downloadVideo(seq) {
  window.location.href = "/download/video/" + seq;
}

async function deleteVideo(seq) {
  if (!confirm("Delete this video?")) return;

  try {
    const res = await fetch("/delete/video/" + seq, {
      method: "DELETE"
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Failed to delete video");
      return;
    }

    loadVideos();

  } catch (error) {
    console.error("Delete video error:", error);
    alert("Failed to delete video");
  }
}

function toggleMenu() {
  const menu = document.getElementById("sideMenu");

  if (menu.style.right === "0px") {
    menu.style.right = "-300px";
  } else {
    menu.style.right = "0px";
  }
}

loadVideos();