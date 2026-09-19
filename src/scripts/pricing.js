// Pricing calculator. Coaches in, monthly total out. No email, no discounts, no network.
import { PRICE_ACADEMY_MONTHLY, PRICE_COACH_MONTHLY, money } from "./config.js";

const form = document.getElementById("calc");
if (form) {
  const input = form.querySelector("#coaches");
  const coachesLabel = form.querySelector("[data-coaches-label]");
  const coachesCost = form.querySelector("[data-coaches-cost]");
  const total = form.querySelector("[data-total]");
  const yearly = form.querySelector("[data-yearly]");
  const live = form.querySelector("[data-live]");
  const clamp = (n) => Math.min(500, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));

  const update = () => {
    const n = clamp(parseInt(input.value, 10));
    if (String(n) !== input.value) input.value = String(n);
    const coaches = n * PRICE_COACH_MONTHLY;
    const month = PRICE_ACADEMY_MONTHLY + coaches;
    coachesLabel.textContent = `${n} ${n === 1 ? "coach" : "coaches"} × ${money(PRICE_COACH_MONTHLY)}`;
    coachesCost.textContent = money(coaches);
    total.textContent = money(month);
    yearly.textContent = money(month * 12);
    live.textContent = `${money(month)} per month for an academy with ${n} certified ${n === 1 ? "coach" : "coaches"}.`;
  };

  input.addEventListener("input", update);
  input.addEventListener("blur", update);
  for (const b of form.querySelectorAll("[data-step]")) {
    b.addEventListener("click", () => { input.value = String(clamp(parseInt(input.value, 10) + Number(b.dataset.step))); update(); input.focus(); });
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); update(); });
  update();
}
