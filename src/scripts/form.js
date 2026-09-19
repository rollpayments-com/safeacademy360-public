// Enrollment form: validation, live price estimate, honeypot and timing check, real success state.
import { PRICE_ACADEMY_MONTHLY, PRICE_COACH_MONTHLY, money } from "./config.js";

const form = document.getElementById("enroll-form");
if (form) {
  // A regular form service. Web3Forms: data-endpoint="https://api.web3forms.com/submit" plus data-access-key.
  // Formspree: data-endpoint="https://formspree.io/f/<id>" and no key. Anything that accepts JSON and returns 2xx works.
  const ENDPOINT = form.dataset.endpoint || "";
  const ACCESS_KEY = form.dataset.accessKey || "";
  const MIN_SECONDS = 4;
  const loadedAt = Date.now();
  const status = document.getElementById("form-status");
  const success = document.getElementById("form-success");
  const coaches = form.querySelector("#coaches");
  const estimate = form.querySelector("[data-estimate]");
  const submitBtn = form.querySelector("button[type=submit]");

  const updateEstimate = () => {
    const n = Math.max(0, parseInt(coaches.value, 10) || 0);
    estimate.textContent = `${money(PRICE_ACADEMY_MONTHLY + n * PRICE_COACH_MONTHLY)} per month for ${n} certified ${n === 1 ? "coach" : "coaches"}. No setup fee.`;
  };
  coaches.addEventListener("input", updateEstimate);
  updateEstimate();

  const setError = (field, msg) => {
    const el = form.querySelector(`#${field.id}-error`);
    field.setAttribute("aria-invalid", msg ? "true" : "false");
    if (el) el.textContent = msg || "";
    field.closest(".field")?.classList.toggle("has-error", Boolean(msg));
  };
  const validators = {
    academy: (v) => (v.trim().length < 2 ? "Enter the academy's name." : ""),
    contact: (v) => (v.trim().length < 2 ? "Enter your name." : ""),
    role: (v) => (v ? "" : "Choose your role."),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? "" : "Enter an email address we can reply to."),
    phone: (v) => (v.replace(/\D/g, "").length >= 10 ? "" : "Enter a phone number with area code."),
    city: (v) => (v.trim() ? "" : "Enter the city."),
    state: (v) => (v ? "" : "Choose the state."),
    website: (v) => (!v.trim() || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(v.trim()) ? "" : "Enter a web address, or leave it blank."),
    coaches: (v) => (/^\d+$/.test(v) && Number(v) >= 1 ? "" : "How many coaches will be certified? At least 1."),
    minors: (v) => (/^\d+$/.test(v) ? "" : "Enter a number. 0 is fine."),
    consent: (_, el) => (el.checked ? "" : "Tick the box so we can contact you about enrollment."),
  };

  const validate = () => {
    let first = null;
    for (const [id, fn] of Object.entries(validators)) {
      const el = form.querySelector(`#${id}`);
      if (!el) continue;
      const msg = fn(el.value, el);
      setError(el, msg);
      if (msg && !first) first = el;
    }
    return first;
  };
  for (const id of Object.keys(validators)) {
    const el = form.querySelector(`#${id}`);
    el?.addEventListener("blur", () => setError(el, validators[id](el.value, el)));
    el?.addEventListener("change", () => setError(el, validators[id](el.value, el)));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "";
    const first = validate();
    if (first) { status.textContent = "Some fields need attention."; first.focus(); return; }

    // Spam checks: a hidden field that people never fill, and a form that took human time.
    const honey = form.querySelector("#company_website");
    const elapsed = (Date.now() - loadedAt) / 1000;
    if ((honey && honey.value) || elapsed < MIN_SECONDS) {
      // Fail quietly for bots: show the success state without sending anything.
      showSuccess();
      return;
    }

    const payload = Object.fromEntries(new FormData(form).entries());
    delete payload.company_website;
    payload.estimate_monthly = PRICE_ACADEMY_MONTHLY + (parseInt(payload.coaches, 10) || 0) * PRICE_COACH_MONTHLY;
    payload.submitted_at = new Date().toISOString();
    payload.page = location.href;
    if (ACCESS_KEY) {
      payload.access_key = ACCESS_KEY;
      payload.subject = `Safe Academy 360 enrollment request: ${payload.academy}`;
      payload.from_name = "safeacademy360.com";
      payload.replyto = payload.email;
    }

    if (!ENDPOINT) {
      status.innerHTML = `Enrollment submissions are not open yet. Email <a href="mailto:support@rollpay.co?subject=Enroll%3A%20${encodeURIComponent(payload.academy)}">support@rollpay.co</a> with the details above and we will reply.`;
      return;
    }

    submitBtn.disabled = true;
    status.textContent = "Sending…";
    try {
      const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(String(r.status));
      showSuccess(payload);
    } catch {
      submitBtn.disabled = false;
      status.innerHTML = `That did not send. Try again, or email <a href="mailto:support@rollpay.co">support@rollpay.co</a>.`;
    }
  });

  function showSuccess(p = {}) {
    status.textContent = "";
    form.hidden = true;
    success.hidden = false;
    success.querySelector("[data-academy]").textContent = p.academy || "your academy";
    success.querySelector("[data-email]").textContent = p.email || "the address you gave";
    success.focus();
  }
}
