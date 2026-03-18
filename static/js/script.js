/*
============================================================
SECURECAM - HOMEPAGE SCRIPT (script.js)
============================================================
*/

const hero = document.getElementById("hero");

const images = [
  "https://images.unsplash.com/photo-1581091870622-2c8c59d6a07b",
  "https://images.unsplash.com/photo-1600267165301-4b63d5a0bdf7",
  "https://images.unsplash.com/photo-1598970434795-0c54fe7c0648",
  "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04"
];

let index = 0;

function changeBackground() {
  if (!hero) return;
  hero.style.backgroundImage = `url(${images[index]})`;
  index = (index + 1) % images.length;
}

changeBackground();
setInterval(changeBackground, 4000);

function toggleMenu() {
  const menu = document.getElementById("sideMenu");
  if (!menu) return;

  if (menu.style.right === "0px") {
    menu.style.right = "-300px";
  } else {
    menu.style.right = "0px";
  }
}