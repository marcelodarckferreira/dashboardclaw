import { initAuth } from "./auth.js";
import { initNav } from "./nav.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initAuth();
  initNav();
});
