// Home page motion: the terminal demo types a build, the preview fills in, and sections
// reveal as they scroll into view.
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // reveal on scroll
  const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")), { threshold: 0.15 });
  document.querySelectorAll(".block, .stage, .b, .app, .use, .rm, .ex").forEach((el) => { el.classList.add("rv"); io.observe(el); });

  // terminal demo
  const body = document.getElementById("termBody");
  const streak = document.getElementById("pvStreak"), today = document.getElementById("pvToday"), path = document.getElementById("pvPath");
  if (!body) return;
  const script = [
    ["$ ", "axon build \"habit tracker, weekly streak chart, neon violet look\"", "cmd"],
    ["", "› parsing spec ........ 3 screens · 9 components", "ok"],
    ["", "› planning layout ..... grid · cards · chart", "ok"],
    ["", "› writing app.html .... 412 lines", "ok"],
    ["", "› compiling preview ... done in 38.2s", "ok"],
    ["", "✓ live at preview/app.html", "done"],
  ];
  const pts = [80, 70, 74, 52, 58, 34, 40, 18];
  let run = 0;
  async function play() {
    const my = ++run;
    body.innerHTML = ""; streak.textContent = "0"; today.textContent = "0/5"; path.setAttribute("d", "M0 80");
    for (const [prompt, text, kind] of script) {
      if (my !== run) return;
      const line = document.createElement("div");
      line.className = `tl ${kind}`;
      line.innerHTML = `<span class="pr">${prompt}</span><span class="tx"></span>`;
      body.appendChild(line);
      const tx = line.querySelector(".tx");
      const speed = kind === "cmd" ? 28 : 8;
      for (let i = 1; i <= text.length; i++) { tx.textContent = text.slice(0, i); if (!reduced) await wait(speed); }
      await wait(kind === "cmd" ? 500 : 380);
    }
    // preview fills in
    for (let i = 1; i <= 12; i++) { if (my !== run) return; streak.textContent = String(i); await wait(50); }
    today.textContent = "4/5";
    let d = "M0 " + pts[0];
    for (let i = 1; i < pts.length; i++) { d += ` L${(i / (pts.length - 1)) * 300} ${pts[i]}`; path.setAttribute("d", d); await wait(90); }
    await wait(4200);
    if (my === run) play();
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const demo = document.getElementById("demo");
  let started = false;
  new IntersectionObserver((es) => { if (es[0].isIntersecting && !started) { started = true; play(); } }, { threshold: 0.3 }).observe(demo);
})();
