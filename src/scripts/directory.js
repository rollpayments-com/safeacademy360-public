// Directory: filter by state and search text against /data/academies.json. Real empty state.
const root = document.getElementById("directory");
if (root) {
  const stateSel = root.querySelector("#state");
  const q = root.querySelector("#q");
  const body = root.querySelector("#directory-body");
  const status = root.querySelector("#directory-status");
  const table = root.querySelector("#directory-table");
  const empty = root.querySelector("#directory-empty");
  const noMatch = root.querySelector("#directory-nomatch");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };
  let rows = [];

  const render = () => {
    const st = stateSel.value;
    const text = q.value.trim().toLowerCase();
    const list = rows
      .filter((r) => (!st || r.state === st) && (!text || `${r.name} ${r.city} ${r.state} ${r.certificate}`.toLowerCase().includes(text)))
      .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
    table.hidden = list.length === 0;
    empty.hidden = rows.length !== 0;
    noMatch.hidden = !(rows.length > 0 && list.length === 0);
    body.innerHTML = list.map((r) => `
      <tr>
        <th scope="row" data-label="Academy"><span class="dir-name">${esc(r.name)}</span>${r.website ? `<br><a class="dir-site" href="${esc(r.website)}" rel="noopener">${esc(host(r.website))}</a>` : ""}</th>
        <td data-label="Location">${esc(r.city)}, ${esc(r.state)}</td>
        <td data-label="Status"><span class="dir-status is-${r.status}">${r.status === "current" ? '<svg class="check" aria-hidden="true"><use href="#sa-check"/></svg>Current' : "Lapsed"}</span></td>
        <td data-label="Certified" class="tnum">${fmt(r.certified)}</td>
        <td data-label="Renewal due" class="tnum">${fmt(r.renewalDue)}</td>
        <td data-label="Certificate"><a class="tnum" href="/verify/?c=${encodeURIComponent(r.certificate)}">${esc(r.certificate)}</a></td>
      </tr>`).join("");
    status.textContent = rows.length === 0 ? "" : list.length === rows.length ? `${rows.length} certified ${rows.length === 1 ? "academy" : "academies"}` : `${list.length} of ${rows.length} shown`;
  };

  fetch("/data/academies.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => {
      rows = Array.isArray(data) ? data : [];
      const states = [...new Set(rows.map((r) => r.state))].sort();
      for (const s of states) { const o = document.createElement("option"); o.value = s; o.textContent = s; stateSel.append(o); }
      stateSel.disabled = states.length === 0;
      q.disabled = rows.length === 0;
      render();
    })
    .catch(() => { status.textContent = "The directory did not load. Try again in a moment."; });

  stateSel.addEventListener("change", render);
  q.addEventListener("input", render);
}
