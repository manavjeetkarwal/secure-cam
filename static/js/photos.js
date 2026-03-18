/*
============================================================
SECURECAM - STORED PHOTOS SCRIPT (photos.js)
============================================================
*/

async function loadPhotos() {
  const grid = document.getElementById("photoGrid");
  grid.innerHTML = "<p>Loading photos...</p>";

  try {
    const res = await fetch("/api/photos");
    const data = await res.json();

    grid.innerHTML = "";

    if (!Array.isArray(data) || data.length === 0) {
      grid.innerHTML = "<p>No photos available.</p>";
      return;
    }

    data.forEach(photo => {
      const card = document.createElement("div");
      card.className = "photo-card";

      card.innerHTML = `
        <img src="${photo.path}" class="photo-preview" alt="Stored Photo">

        <div class="photo-info">
          <p>Date: ${photo.date || "-"}</p>
          <p>Time: ${photo.time || "-"}</p>
        </div>

        <div class="photo-buttons">
          <button onclick="downloadPhoto(${photo.seq})">
            Download
          </button>

          <button onclick="deletePhoto(${photo.seq})">
            Delete
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

  } catch (error) {
    console.error("Photo load error:", error);
    grid.innerHTML = "<p>Failed to load photos.</p>";
  }
}

function downloadPhoto(seq) {
  window.location.href = "/download/photo/" + seq;
}

async function deletePhoto(seq) {
  if (!confirm("Delete this photo?")) return;

  try {
    const res = await fetch("/delete/photo/" + seq, {
      method: "DELETE"
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Failed to delete photo");
      return;
    }

    loadPhotos();

  } catch (error) {
    console.error("Delete photo error:", error);
    alert("Failed to delete photo");
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

loadPhotos();