// Certificate lookup. Client side against /data/academies.json. Three explicit states; never silent.
const form = document.getElementById("verify-form");
if (form) {
  const input = form.querySelector("#certificate");
  const result = document.getElementById("verify-result");
  const fmt = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const normalize = (raw) => {
    const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const m = s.match(/^SAI(\d{4})(\d{5})$/);
    return m ? `SAI-${m[1]}-${m[2]}` : raw.trim().toUpperCase();
  };
  let data;
  const load = async () => {
    if (data) return data;
    const r = await fetch("/data/academies.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("data");
    data = await r.json();
    return data;
  };
  const shield = (cls, withCheck) =>
    `<span class="shield-device ${cls}" aria-hidden="true"><svg class="shield-device-shape"><use href="#sa-shield-solid"/></svg>${withCheck ? '<svg class="shield-device-check"><use href="#sa-check"/></svg>' : ""}</span>`;

  const render = (state, a, id) => {
    result.dataset.state = state;
    if (state === "current") {
      result.innerHTML = `
        <div class="verify-card is-current">
          ${shield("is-current", true)}
          <div>
            <p class="verify-status">Current</p>
            <h2 class="verify-name">${esc(a.name)}</h2>
            <dl class="verify-facts">
              <dt>Location</dt><dd>${esc(a.city)}, ${esc(a.state)}</dd>
              <dt>Certified</dt><dd>${fmt(a.certified)}</dd>
              <dt>Renewal due</dt><dd>${fmt(a.renewalDue)}</dd>
              <dt>Certificate</dt><dd class="tnum">${esc(a.certificate)}</dd>
            </dl>
            <p class="verify-note">This academy has met the Safe Academy 360 requirements as of the certified date. It says nothing about any individual, and it is not a guarantee of anyone's safety. <a href="/parents/#listing">What a listing does and does not tell you</a>.</p>
          </div>
        </div>`;
    } else if (state === "lapsed") {
      result.innerHTML = `
        <div class="verify-card is-lapsed">
          ${shield("is-lapsed", false)}
          <div>
            <p class="verify-status">Lapsed</p>
            <h2 class="verify-name">${esc(a.name)}</h2>
            <dl class="verify-facts">
              <dt>Location</dt><dd>${esc(a.city)}, ${esc(a.state)}</dd>
              <dt>First certified</dt><dd>${fmt(a.certified)}</dd>
              <dt>Renewal was due</dt><dd>${fmt(a.renewalDue)}</dd>
              <dt>Certificate</dt><dd class="tnum">${esc(a.certificate)}</dd>
            </dl>
            <p class="verify-note">This academy's certification is not current. A renewal date passed and the academy has not yet renewed. Lapsed means a date passed; it does not by itself mean anything went wrong. Ask the academy about it directly.</p>
          </div>
        </div>`;
    } else if (state === "notfound") {
      result.innerHTML = `
        <div class="verify-card is-notfound">
          <div>
            <p class="verify-status">Not found</p>
            <h2 class="verify-name">No certificate matches <span class="tnum">${esc(id)}</span></h2>
            <p>Check that the number is complete. Certificate numbers look like <span class="tnum">SAI-2026-00001</span>: the letters SAI, a four digit year, and five digits. Spaces and hyphens do not matter.</p>
            <p>If the number is copied correctly from a placard and is still not found, the placard may be out of date or may not be genuine. Tell us at <a href="mailto:support@rollpay.co?subject=Verify%3A%20certificate%20${encodeURIComponent(id)}%20not%20found">support@rollpay.co</a> with the academy's name and where you saw the placard. You can also search the <a href="/directory/">directory</a> by academy name.</p>
        </div></div>`;
    } else if (state === "empty") {
      result.innerHTML = `<div class="verify-card is-notfound"><div><p class="verify-status">Enter a number</p><p>Type the certificate number printed on the placard, for example <span class="tnum">SAI-2026-00001</span>.</p></div></div>`;
    } else {
      result.innerHTML = `<div class="verify-card is-notfound"><div><p class="verify-status">Could not check</p><p>The certificate list did not load. Try again in a moment, or email <a href="mailto:support@rollpay.co">support@rollpay.co</a>.</p></div></div>`;
    }
    result.focus({ preventScroll: false });
  };

  const check = async (raw) => {
    const id = normalize(raw || "");
    if (!id) return render("empty");
    input.value = id;
    try {
      const rows = await load();
      const a = rows.find((r) => r.certificate === id);
      if (!a) return render("notfound", null, id);
      render(a.status === "current" ? "current" : "lapsed", a, id);
      history.replaceState(null, "", `?c=${encodeURIComponent(id)}`);
    } catch {
      render("error");
    }
  };

  form.addEventListener("submit", (e) => { e.preventDefault(); check(input.value); });
  const fromUrl = new URLSearchParams(location.search).get("c") || (location.hash ? location.hash.slice(1) : "");
  if (fromUrl) { input.value = fromUrl; check(fromUrl); }
}
