/* global document, window, fetch */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function bar(p) {
  const W = 18;
  const f = Math.round((W * p) / 100);
  return "[" + "█".repeat(f) + "░".repeat(W - f) + "] " + p + "%";
}

function templateLine(str) {
  if (typeof str !== "string") return str;
  return str
    .replaceAll("{{UTC_NOW}}", new Date().toUTCString())
    .replaceAll("{{NOW}}", new Date().toString())
    .replaceAll(/\{\{BAR:(\d{1,3})\}\}/g, (_, n) => bar(Math.max(0, Math.min(100, Number(n)))));
}

async function loadProfile() {
  try {
    const res = await fetch("data/profile.json", { cache: "no-store" });
    if (!res.ok) throw new Error("bad status " + res.status);
    return await res.json();
  } catch (_) {
    const embedded = document.getElementById("profile-data")?.textContent?.trim();
    if (embedded) return JSON.parse(embedded);
    throw new Error("Could not load profile data (data/profile.json).");
  }
}

function setInputEnabled(ci, enabled) {
  ci.disabled = !enabled;
  if (enabled) ci.focus();
}

function createGap() {
  const d = document.createElement("div");
  d.className = "gap";
  return d;
}

function createLine({ t, v }) {
  const d = document.createElement("div");
  d.className = "ln " + (t || "info");
  d.textContent = v || "";
  return d;
}

function scrollBottom(out) {
  out.scrollTop = out.scrollHeight;
}

function createWhoamiGrid({ photoSrc }) {
  const grid = document.createElement("div");
  grid.className = "whoami-grid";

  const photo = document.createElement("div");
  photo.className = "whoami-photo";

  const img = document.createElement("img");
  img.src = photoSrc;
  img.alt = "photo";

  img.onerror = () => {
    photo.innerHTML =
      '<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--gd);font-size:11px;line-height:1.4;text-align:center">' +
      " .--------.<br> |  O    O |<br> |    __  |<br> |  \\____/ |<br> `--------'<br><br>[missing photo]</div>";
    const scan = document.createElement("div");
    scan.className = "scan";
    photo.appendChild(scan);
  };

  const reveal = document.createElement("div");
  reveal.className = "reveal";

  const scan = document.createElement("div");
  scan.className = "scan";

  photo.appendChild(img);
  photo.appendChild(reveal);
  photo.appendChild(scan);

  const textCol = document.createElement("div");
  textCol.style.display = "flex";
  textCol.style.flexDirection = "column";
  textCol.style.gap = "2px";
  textCol.style.paddingTop = "4px";

  grid.appendChild(photo);
  grid.appendChild(textCol);

  return { grid, revealLayer: reveal, textCol };
}

async function revealInBlocks(revealLayer, { steps = 18, stepDelayMs = 65 } = {}) {
  // Reveal top-to-bottom in chunky steps (old terminal vibe).
  for (let i = 0; i <= steps; i++) {
    const pct = Math.round((i / steps) * 100);
    // Keep overlay only on the still-hidden bottom area
    revealLayer.style.clipPath = `inset(${pct}% 0 0 0)`;
    await sleep(stepDelayMs);
  }
  revealLayer.style.clipPath = "inset(100% 0 0 0)";
}

async function main() {
  const profile = await loadProfile();

  const out = document.getElementById("out");
  const ci = document.getElementById("ci");
  const hint = document.getElementById("hint");
  const ps1 = document.getElementById("ps1");
  const standard = document.getElementById("standard");
  const viewToggle = document.getElementById("viewToggle");
  const inrow = document.getElementById("inrow");
  const mobilekb = document.getElementById("mobilekb");

  if (!out || !ci || !hint || !ps1 || !standard || !viewToggle || !inrow || !mobilekb) return;

  ps1.textContent = (profile.prompt || "user@portfolio:~$") + " ";

  let hist = [];
  let hi = -1;
  let hasTyped = false;
  let hintTimer = null;
  let isPrinting = false;

  const CMDS_LIST = Array.isArray(profile.commandsList) ? profile.commandsList : [];
  const DATA = profile.data || {};
  const EASTER = profile.easter || {};
  const WHO = profile.whoami || {};

  let viewMode = "terminal"; // 'terminal' | 'standard'

  function extractFirstMatchingUrls(lines) {
    const urls = [];
    for (const l of lines || []) {
      const v = String(l.v || "");
      const m = v.match(/\bhttps?:\/\/[^\s]+/g);
      if (m) urls.push(...m);
      const m2 = v.match(/\b(?:github\.com|linkedin\.com)\/[^\s]+/g);
      if (m2) urls.push(...m2.map((x) => "https://" + x));
    }
    return Array.from(new Set(urls));
  }

  function createStdLine(line) {
    const d = document.createElement("div");
    const t = line.t || "info";
    d.className = "std-line " + t;
    d.textContent = templateLine(line.v || "");
    return d;
  }

  function addStdSection(title, lines) {
    const s = document.createElement("section");
    s.className = "std-section";
    const h = document.createElement("div");
    h.className = "h";
    h.textContent = title;
    const b = document.createElement("div");
    b.className = "std-block";
    for (const l of lines || []) {
      if (l.t === "gap") {
        const gap = document.createElement("div");
        gap.style.height = "8px";
        b.appendChild(gap);
      } else {
        b.appendChild(createStdLine(l));
      }
    }
    s.appendChild(h);
    s.appendChild(b);
    standard.appendChild(s);
  }

  function buildStandardView() {
    standard.innerHTML = "";

    const head = document.createElement("div");
    head.className = "std-head";

    const p = document.createElement("div");
    p.className = "std-photo";
    const img = document.createElement("img");
    img.src = profile.photoSrc || "photo.jpg";
    img.alt = "photo";
    img.onerror = () => {
      p.innerHTML =
        '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--gd);font-size:11px;text-align:center;line-height:1.3">[missing photo]</div>';
    };
    p.appendChild(img);

    const t = document.createElement("div");
    t.className = "std-title";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = String((WHO.lines && WHO.lines[0] && WHO.lines[0].v) || "Your Name").trim();

    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = String((WHO.lines && WHO.lines[1] && WHO.lines[1].v) || "").trim();

    const links = document.createElement("div");
    links.className = "std-links";
    const contactLines = DATA["contact"] || [];
    const urls = extractFirstMatchingUrls(contactLines);
    for (const u of urls.slice(0, 6)) {
      const a = document.createElement("a");
      a.href = u;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = u.replace(/^https?:\/\//, "");
      links.appendChild(a);
    }

    t.appendChild(name);
    if (tag.textContent) t.appendChild(tag);
    if (links.childNodes.length) t.appendChild(links);

    head.appendChild(p);
    head.appendChild(t);
    standard.appendChild(head);

    // Sections in a sensible "portfolio" order.
    addStdSection("[ WHOAMI ]", [
      ...(WHO.lines || []).map((l) => ({ t: l.t || "info", v: l.v })),
      { t: "gap" }
    ]);
    if (DATA["about"]) addStdSection("[ ABOUT ]", DATA["about"]);
    if (DATA["skills"]) addStdSection("[ SKILLS ]", DATA["skills"]);
    if (DATA["ls projects"]) addStdSection("[ PROJECTS ]", DATA["ls projects"]);
    if (DATA["ls writeups"]) addStdSection("[ WRITEUPS ]", DATA["ls writeups"]);
    if (DATA["ls certs"]) addStdSection("[ CERTIFICATIONS ]", DATA["ls certs"]);
    if (DATA["chess"]) addStdSection("[ CHESS ]", DATA["chess"]);
    if (DATA["contact"]) addStdSection("[ CONTACT ]", DATA["contact"]);
  }

  function setViewMode(mode) {
    viewMode = mode;
    const isStd = mode === "standard";

    standard.style.display = isStd ? "block" : "none";
    standard.setAttribute("aria-hidden", String(!isStd));

    out.style.display = isStd ? "none" : "block";
    inrow.style.display = isStd ? "none" : "flex";
    mobilekb.style.display = isStd ? "none" : "";
    hint.style.display = isStd ? "none" : "";

    viewToggle.textContent = isStd ? "view: terminal" : "view: standard";

    if (isStd) {
      setInputEnabled(ci, false);
      buildStandardView();
    } else {
      setInputEnabled(ci, true);
    }
  }

  function resetHintTimer() {
    clearTimeout(hintTimer);
    hint.style.opacity = 0;
    if (!hasTyped) {
      hintTimer = window.setTimeout(() => {
        hint.style.opacity = 1;
      }, 5000);
    }
  }

  // Single sequential print queue.
  let q = Promise.resolve();
  function enqueue(fn) {
    q = q.then(fn).catch(() => {});
    return q;
  }

  async function addLine(line, { delayMs = 0 } = {}) {
    if (delayMs) await sleep(delayMs);

    if (line.t === "gap") {
      out.appendChild(createGap());
      scrollBottom(out);
      return;
    }

    const l = { ...line, v: templateLine(line.v) };
    out.appendChild(createLine(l));
    scrollBottom(out);
  }

  async function printLines(lines, { perLineDelayMs = 20 } = {}) {
    for (const l of lines) {
      await addLine(l, { delayMs: perLineDelayMs });
    }
  }

  async function typeLine(line, { charDelayMs = 18 } = {}) {
    if (line.t === "gap") {
      out.appendChild(createGap());
      scrollBottom(out);
      return;
    }
    const d = document.createElement("div");
    d.className = "ln " + (line.t || "info");
    out.appendChild(d);
    scrollBottom(out);

    const chars = String(templateLine(line.v || "")).split("");
    for (const ch of chars) {
      d.textContent += ch;
      scrollBottom(out);
      await sleep(charDelayMs);
    }
  }

  async function typeWelcome(lines) {
    for (const l of lines) {
      if (l.t === "art") await typeLine(l, { charDelayMs: 8 });
      else if (l.t === "dim" || l.t === "success") await typeLine(l, { charDelayMs: 18 });
      else await addLine(l, { delayMs: 30 });
      await sleep(20);
    }
  }

  async function doPing() {
    await printLines([{ t: "dim", v: "  PING ziyad@portfolio (127.0.0.1)" }, { t: "gap" }], { perLineDelayMs: 0 });
    const seq = ["32ms", "29ms", "31ms", "28ms"];
    for (let i = 0; i < 4; i++) {
      await addLine({ t: "success", v: `  64 bytes from ziyad: icmp_seq=${i} ttl=64 time=${seq[i]}` }, { delayMs: 400 });
    }
    await printLines(
      [
        { t: "gap" },
        { t: "info", v: "  --- ziyad ping statistics ---" },
        { t: "success", v: "  4 packets transmitted, 4 received, 0% packet loss" },
        { t: "dim", v: "  ziyad is available for hire." },
        { t: "gap" }
      ],
      { perLineDelayMs: 80 }
    );
  }

  async function doResume() {
    await printLines(
      [
        { t: "dim", v: "  Locating resume.pdf..." },
        { t: "success", v: "  Found: /home/ziyad/resume.pdf" },
        { t: "dim", v: "  Initiating download..." },
        { t: "gap" }
      ],
      { perLineDelayMs: 40 }
    );

    if (profile.resumeURL) {
      await addLine({ t: "success", v: "  Download started." }, { delayMs: 40 });
      const a = document.createElement("a");
      a.href = profile.resumeURL;
      a.download = "resume.pdf";
      a.click();
      await addLine({ t: "gap" }, { delayMs: 0 });
      return;
    }

    await printLines(
      [
        { t: "accent", v: "  [ Set resumeURL in data/profile.json to enable download ]" },
        { t: "gap" }
      ],
      { perLineDelayMs: 20 }
    );
  }

  async function renderWhoamiSequential() {
    for (const v of WHO.artLines || []) {
      await typeLine({ t: "art", v }, { charDelayMs: 7 });
    }
    await addLine({ t: "gap" }, { delayMs: 40 });

    const { grid, revealLayer, textCol } = createWhoamiGrid({
      photoSrc: profile.photoSrc || "photo.jpg"
    });

    out.appendChild(grid);
    scrollBottom(out);

    // Reveal photo and info "loading" sequentially together.
    const revealP = revealInBlocks(revealLayer, { steps: 16, stepDelayMs: 55 });
    for (const l of WHO.lines || []) {
      const d = document.createElement("div");
      d.className = "wl";
      d.style.color = l.color || "var(--wh)";
      textCol.appendChild(d);
      scrollBottom(out);
      const chars = String(templateLine(l.v || "")).split("");
      for (const ch of chars) {
        d.textContent += ch;
        scrollBottom(out);
        await sleep(10);
      }
      await sleep(20);
    }
    await revealP;
    await addLine({ t: "gap" }, { delayMs: 40 });
  }

  async function handleCmd(raw) {
    const cmd = raw.trim().toLowerCase();
    if (!cmd) return;

    resetHintTimer();
    out.appendChild(createLine({ t: "echo", v: (profile.prompt || "user@portfolio:~$") + " " + raw.trim() }));
    scrollBottom(out);

    if (cmd === "clear") {
      await sleep(40);
      out.innerHTML = "";
      return;
    }
    if (cmd === "ping ziyad" || cmd === "ping") {
      await doPing();
      return;
    }
    if (cmd === "cat resume.pdf") {
      await doResume();
      return;
    }
    if (cmd === "whoami") {
      await renderWhoamiSequential();
      return;
    }

    const res = DATA[cmd] || EASTER[cmd];
    if (res) {
      await printLines(res, { perLineDelayMs: 20 });
      return;
    }

    await printLines(
      [
        { t: "error", v: "  bash: " + cmd + ": command not found" },
        { t: "dim", v: "  type 'help' for available commands" },
        { t: "gap" }
      ],
      { perLineDelayMs: 10 }
    );
  }

  ci.addEventListener("keydown", (e) => {
    if (isPrinting) {
      if (e.key === "Tab" || e.key === "Enter") e.preventDefault();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const val = ci.value.toLowerCase();
      if (!val) return;
      const match = CMDS_LIST.filter((c) => c.startsWith(val));
      if (match.length === 1) ci.value = match[0];
      else if (match.length > 1) {
        enqueue(async () => {
          isPrinting = true;
          setInputEnabled(ci, false);
          await printLines([{ t: "dim", v: "  " + match.join("  ") }, { t: "gap" }], { perLineDelayMs: 0 });
          setInputEnabled(ci, true);
          isPrinting = false;
        });
      }
      return;
    }

    if (e.key === "Enter") {
      const v = ci.value;
      ci.value = "";
      hi = -1;
      if (v.trim()) hist.unshift(v.trim());
      if (!hasTyped) {
        hasTyped = true;
        clearTimeout(hintTimer);
        hint.style.opacity = 0;
      }

      enqueue(async () => {
        isPrinting = true;
        setInputEnabled(ci, false);
        await handleCmd(v);
        setInputEnabled(ci, true);
        isPrinting = false;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hi < hist.length - 1) hi++;
      ci.value = hist[hi] || "";
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hi > 0) hi--;
      else {
        hi = -1;
        ci.value = "";
        return;
      }
      ci.value = hist[hi] || "";
    }
  });

  window.quickCmd = (cmd) => {
    if (isPrinting) return;
    ci.value = cmd;
    ci.focus();
  };

  document.addEventListener("click", () => ci.focus());

  // GLITCH
  function glitch() {
    const el = document.getElementById("bt");
    if (!el) return;
    el.classList.add("go");
    window.setTimeout(() => el.classList.remove("go"), 200);
    window.setTimeout(glitch, Math.random() * 8000 + 4000);
  }

  // BOOT (kept same vibe, but starts the new renderer)
  function boot() {
    const bt = document.getElementById("bt");
    const b1 = document.getElementById("b1");
    const b2 = document.getElementById("b2");
    const b3 = document.getElementById("b3");
    const b4 = document.getElementById("b4");
    const bwrap = document.getElementById("bwrap");
    const bbar = document.getElementById("bbar");
    const bootEl = document.getElementById("boot");
    const term = document.getElementById("term");

    function show(el, d) {
      window.setTimeout(() => {
        if (el) el.style.opacity = 1;
      }, d);
    }
    show(bt, 200);
    window.setTimeout(glitch, 3000);
    show(b1, 800);
    show(b2, 1150);
    show(b3, 1500);
    show(b4, 1850);
    window.setTimeout(() => {
      if (bwrap) bwrap.style.opacity = 1;
    }, 2000);

    let w = 0;
    window.setTimeout(() => {
      const iv = window.setInterval(() => {
        w += Math.random() * 6 + 2;
        if (w >= 100) {
          w = 100;
          window.clearInterval(iv);
          window.setTimeout(() => {
            if (!bootEl || !term) return;
            bootEl.style.transition = "opacity 0.4s";
            bootEl.style.opacity = 0;
            window.setTimeout(() => {
              bootEl.style.display = "none";
              term.style.opacity = 1;
              setInputEnabled(ci, true);
              enqueue(async () => {
                isPrinting = true;
                setInputEnabled(ci, false);
                await typeWelcome(profile.welcome || []);
                resetHintTimer();
                setInputEnabled(ci, true);
                isPrinting = false;
              });
            }, 400);
          }, 300);
        }
        if (bbar) bbar.style.width = w + "%";
      }, 40);
    }, 2100);
  }

  viewToggle.addEventListener("click", () => {
    // Switch immediately, but don’t interrupt an in-flight print queue.
    if (isPrinting) return;
    setViewMode(viewMode === "terminal" ? "standard" : "terminal");
  });

  boot();
}

main().catch(() => {});


