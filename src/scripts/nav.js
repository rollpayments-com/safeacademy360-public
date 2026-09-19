// Masthead: mobile menu toggle and current page marking. No dependencies.
const masthead = document.getElementById("masthead");
const toggle = masthead?.querySelector(".nav-toggle");
const nav = document.getElementById("nav");

if (masthead && toggle && nav) {
  const setOpen = (open) => {
    masthead.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector("span:last-child").textContent = open ? "Close" : "Menu";
  };
  toggle.addEventListener("click", () => setOpen(!masthead.classList.contains("is-open")));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && masthead.classList.contains("is-open")) { setOpen(false); toggle.focus(); }
  });
  document.addEventListener("click", (e) => {
    if (masthead.classList.contains("is-open") && !masthead.contains(e.target)) setOpen(false);
  });
  const mq = window.matchMedia("(min-width: 64em)");
  mq.addEventListener("change", () => { if (mq.matches) setOpen(false); });
}

// aria-current on the matching nav link, so the same partial serves every page.
const here = location.pathname.replace(/\/+$/, "") || "/";
for (const a of document.querySelectorAll(".nav a, .utility a")) {
  const href = a.getAttribute("href").replace(/\/+$/, "") || "/";
  if (href !== "/" && here.startsWith(href)) a.setAttribute("aria-current", "page");
}
