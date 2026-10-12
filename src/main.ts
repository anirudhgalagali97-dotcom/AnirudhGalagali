import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./style.css";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import type { HeroBackground } from "./hero/HeroBackground";
import { CONTACT, FLOWS, type Flow } from "./config";

import arrowUpRight from "@phosphor-icons/core/assets/light/arrow-up-right-light.svg?raw";
import arrowDownRight from "@phosphor-icons/core/assets/light/arrow-down-right-light.svg?raw";
import arrowRight from "@phosphor-icons/core/assets/light/arrow-right-light.svg?raw";
import envelope from "@phosphor-icons/core/assets/light/envelope-simple-light.svg?raw";
import linkedin from "@phosphor-icons/core/assets/light/linkedin-logo-light.svg?raw";
import github from "@phosphor-icons/core/assets/light/github-logo-light.svg?raw";
import plane from "@phosphor-icons/core/assets/light/paper-plane-tilt-light.svg?raw";
import robot from "@phosphor-icons/core/assets/light/robot-light.svg?raw";
import flowArrow from "@phosphor-icons/core/assets/light/flow-arrow-light.svg?raw";
import code from "@phosphor-icons/core/assets/light/code-light.svg?raw";
import chart from "@phosphor-icons/core/assets/light/chart-line-up-light.svg?raw";

gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(s));

/* ---------- Icons ---------- */
const ICONS: Record<string, string> = {
  "arrow-up-right": arrowUpRight,
  "arrow-down-right": arrowDownRight,
  "arrow-right": arrowRight,
  "envelope-simple": envelope,
  "linkedin-logo": linkedin,
  "github-logo": github,
  "paper-plane-tilt": plane,
  robot,
  "flow-arrow": flowArrow,
  code,
  "chart-line-up": chart,
};
for (const el of $$("[data-icon]")) {
  const svg = ICONS[el.dataset.icon!];
  if (svg) el.innerHTML = svg.replace("<svg ", '<svg aria-hidden="true" focusable="false" ');
}

/* ---------- Contact links ---------- */
const emailLink = $<HTMLAnchorElement>('[data-contact="email"]')!;
emailLink.href = `mailto:${CONTACT.email}`;
$("[data-contact-label]", emailLink)!.textContent = CONTACT.email;
$<HTMLAnchorElement>('[data-contact="linkedin"]')!.href = CONTACT.linkedin;
$<HTMLAnchorElement>('[data-contact="github"]')!.href = CONTACT.github;

/* ---------- Architecture diagrams ---------- */
const SVG_NS = "http://www.w3.org/2000/svg";
let flowId = 0;

function renderFlow(fig: HTMLElement, flow: Flow) {
  const board = document.createElement("div");
  board.className = "flow__board";
  board.style.setProperty("--cols", String(flow.cols));
  board.style.setProperty("--rows", String(flow.rows));
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("flow__wires");
  svg.setAttribute("aria-hidden", "true");
  board.appendChild(svg);
  const nodeEls = new Map<string, HTMLElement>();
  for (const n of flow.nodes) {
    const el = document.createElement("div");
    el.className = "flow__node" + (n.planned ? " is-planned" : "") + (n.accent ? " is-accent" : "");
    el.style.gridColumn = String(n.col);
    el.style.gridRow = String(n.row);
    el.innerHTML = `<strong></strong>${n.sub ? "<span></span>" : ""}`;
    el.querySelector("strong")!.textContent = n.label;
    if (n.sub) el.querySelector("span")!.textContent = n.sub;
    board.appendChild(el);
    nodeEls.set(n.id, el);
  }
  fig.prepend(board);

  const draw = () => {
    svg.innerHTML = "";
    const b = board.getBoundingClientRect();
    if (!b.width) return;
    svg.setAttribute("viewBox", `0 0 ${b.width} ${b.height}`);
    for (const [from, to, opts] of flow.edges) {
      const a = nodeEls.get(from)!.getBoundingClientRect();
      const c = nodeEls.get(to)!.getBoundingClientRect();
      const ax = a.left - b.left, ay = a.top - b.top, cx = c.left - b.left, cy = c.top - b.top;
      let d: string;
      if (Math.abs(ay - cy) < 4) {
        // Same row: horizontal.
        const y = ay + a.height / 2;
        const [x1, x2] = cx > ax ? [ax + a.width, cx] : [ax, cx + c.width];
        d = `M${x1},${y} L${x2},${y}`;
      } else if (Math.abs(ax + a.width / 2 - (cx + c.width / 2)) < 4) {
        // Same column: vertical.
        const x = ax + a.width / 2;
        d = `M${x},${ay + a.height} L${x},${cy}`;
      } else {
        // Elbow: down, across, down.
        const x1 = ax + a.width / 2, y1 = ay + a.height, x2 = cx + c.width / 2, y2 = cy;
        const my = (y1 + y2) / 2;
        d = `M${x1},${y1} L${x1},${my} L${x2},${my} L${x2},${y2}`;
      }
      const id = `wire-${flowId++}`;
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("id", id);
      path.setAttribute("class", "flow__wire" + (opts?.planned ? " is-planned" : ""));
      svg.appendChild(path);
      if (!reduced && !opts?.planned) {
        const dot = document.createElementNS(SVG_NS, "circle");
        dot.setAttribute("r", "2.6");
        dot.setAttribute("class", "flow__pulse");
        const motion = document.createElementNS(SVG_NS, "animateMotion");
        motion.setAttribute("dur", `${2.2 + Math.random() * 1.4}s`);
        motion.setAttribute("repeatCount", "indefinite");
        motion.setAttribute("begin", `${Math.random() * 2}s`);
        const mpath = document.createElementNS(SVG_NS, "mpath");
        mpath.setAttribute("href", `#${id}`);
        motion.appendChild(mpath);
        dot.appendChild(motion);
        svg.appendChild(dot);
      }
    }
  };
  new ResizeObserver(draw).observe(board);
}
for (const fig of $$("[data-flow]")) {
  const flow = FLOWS[fig.dataset.flow!];
  if (flow) renderFlow(fig, flow);
}

/* ---------- Hero background (Neural Core) ---------- */
function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

// three.js loads as its own chunk so the page text is not blocked on it.
let heroBg: HeroBackground | null = null;
const stage = $(".stage")!;
const heroReady: Promise<void> = webglAvailable()
  ? import("./hero/HeroBackground")
      .then(({ HeroBackground }) => {
        heroBg = new HeroBackground($<HTMLCanvasElement>(".stage__canvas")!, $(".hero")!, reduced);
      })
      .catch(() => {
        heroBg = null;
      })
      .then(() => {
        if (!heroBg) stage.classList.add("stage--fallback");
      })
  : Promise.resolve(stage.classList.add("stage--fallback"));

// As the hero scrolls away the camera pulls back and the network expands.
ScrollTrigger.create({
  trigger: ".hero",
  start: "top top",
  end: "bottom top",
  onUpdate: (self) => heroBg?.setScroll(self.progress),
});

/* ---------- Giant name ---------- */
const nameEl = $(".stage__name span")!;
nameEl.innerHTML = [...nameEl.textContent!].map((ch) => `<i>${ch}</i>`).join("");

/* ---------- Marquee: duplicate once for a seamless loop ---------- */
const track = $(".marquee__track");
if (track) track.innerHTML += track.innerHTML;

/* ---------- Smooth scroll ---------- */
let lenis: Lenis | null = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis!.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ---------- Nav and menu ---------- */
const menu = $("#menu")!;
const toggle = $<HTMLButtonElement>(".nav__toggle")!;
function setMenu(open: boolean) {
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  document.body.classList.toggle("menu-open", open);
  if (open) {
    menu.hidden = false;
    lenis?.stop();
    if (!reduced) gsap.fromTo($$("a", menu), { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: 0.06, duration: 0.7, ease: "expo.out" });
  } else {
    menu.hidden = true;
    lenis?.start();
  }
}
toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !menu.hidden) setMenu(false);
});

for (const a of $$<HTMLAnchorElement>('a[href^="#"]')) {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href")!;
    if (id === "#" || id.length < 2) return;
    const target = $(id);
    if (!target) return;
    e.preventDefault();
    if (!menu.hidden) setMenu(false);
    if (lenis) lenis.scrollTo(target, { offset: id === "#top" ? 0 : -24, duration: 1.4 });
    else target.scrollIntoView();
    history.replaceState(null, "", id);
  });
}

ScrollTrigger.create({
  trigger: "#approach",
  start: "top 80%",
  onToggle: (self) => document.body.classList.toggle("past-hero", self.isActive || self.progress > 0),
  end: "max",
});

/* ---------- Chapter progress drives the rail ---------- */
const chapters = $$("section.chapter");
const railLinks = $$("[data-chapter]", $(".rail")!);
let tops: number[] = [];
function measure() {
  tops = chapters.map((c) => c.getBoundingClientRect().top + window.scrollY);
}
let lastActive = -1;
function updateChapter() {
  const vh = window.innerHeight;
  const y = window.scrollY + vh * 0.5;
  let t = 0;
  for (let i = 0; i < tops.length; i++) {
    if (y >= tops[i]) t = i;
  }
  const i = Math.floor(t);
  if (i < tops.length - 1) {
    // Hold the key inside a chapter; move during the hand-off to the next one.
    const start = tops[i + 1] - vh * 0.65;
    const f = gsap.utils.clamp(0, 1, (y - start) / (vh * 0.65));
    t = i + f;
  }
  const active = Math.round(t);
  if (active !== lastActive) {
    lastActive = active;
    railLinks.forEach((l, k) => l.classList.toggle("is-active", k === active));
  }
}
ScrollTrigger.addEventListener("refresh", () => {
  measure();
  updateChapter();
});
ScrollTrigger.create({ start: 0, end: "max", onUpdate: updateChapter });

/* ---------- Scroll choreography ---------- */
const mm = gsap.matchMedia();

if (!reduced) {
  // The giant name and the hero copy fall away as you leave the hero.
  gsap.to(".stage__name", {
    yPercent: -18,
    opacity: 0,
    ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 30%", scrub: true },
  });

  // The scene fades out with the hero; its render loop pauses once the hero is off screen.
  gsap.to(".stage__scene", {
    opacity: 0,
    ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
  });

  // Manifesto: words light up at reading pace.
  const manifesto = $("[data-words]")!;
  manifesto.innerHTML = manifesto
    .textContent!.trim()
    .split(/\s+/)
    .map((w) => `<span>${w}</span>`)
    .join(" ");
  gsap.fromTo(
    $$("span", manifesto),
    { opacity: 0.16 },
    { opacity: 1, stagger: 0.08, ease: "none", scrollTrigger: { trigger: manifesto, start: "top 78%", end: "bottom 45%", scrub: true } }
  );

  // Generic reveal on entry.
  gsap.set("[data-reveal]", { y: 48, opacity: 0 });
  ScrollTrigger.batch("[data-reveal]", {
    start: "top 88%",
    once: true,
    onEnter: (els) => gsap.to(els, { y: 0, opacity: 1, duration: 1.1, ease: "expo.out", stagger: 0.09 }),
  });

  // Process: the line draws as you move through the steps.
  gsap.fromTo(
    ".steps__line span",
    { scaleX: 0 },
    { scaleX: 1, ease: "none", scrollTrigger: { trigger: ".steps", start: "top 75%", end: "bottom 55%", scrub: true } }
  );
  for (const [k, step] of $$("[data-step]").entries()) {
    ScrollTrigger.create({
      trigger: ".steps",
      start: () => `top+=${k * 40} 70%`,
      onEnter: () => step.classList.add("is-on"),
      onLeaveBack: () => step.classList.remove("is-on"),
    });
  }

  // Work: a real sticky stack on wide screens. Each card pins at the top and
  // recedes as the next one slides over it.
  mm.add("(min-width: 900px)", () => {
    const cards = $$(".stack__item");
    cards.forEach((card, i) => {
      if (i === cards.length - 1) return;
      ScrollTrigger.create({
        trigger: card,
        start: "top top",
        endTrigger: cards[cards.length - 1],
        end: "top top",
        pin: true,
        pinSpacing: false,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      });
      gsap.to($(".stack__inner", card), {
        scale: 0.92,
        opacity: 0.35,
        ease: "none",
        scrollTrigger: { trigger: cards[i + 1], start: "top bottom", end: "top top", scrub: true, invalidateOnRefresh: true },
      });
    });
  });
} else {
  $$("[data-step]").forEach((s) => s.classList.add("is-on"));
}

/* ---------- Form ---------- */
const form = $<HTMLFormElement>(".form")!;
const status = $(".form__status", form)!;
function check(input: HTMLInputElement | HTMLTextAreaElement, errId: string, ok: boolean) {
  const err = document.getElementById(errId)!;
  err.hidden = ok;
  input.setAttribute("aria-invalid", String(!ok));
  if (ok) input.removeAttribute("aria-describedby");
  else input.setAttribute("aria-describedby", errId);
  return ok;
}
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>("#f-name", form)!;
  const email = $<HTMLInputElement>("#f-email", form)!;
  const msg = $<HTMLTextAreaElement>("#f-msg", form)!;
  const type = $<HTMLSelectElement>("#f-type", form)!;
  const ok = [
    check(name, "f-name-err", name.value.trim().length > 1),
    check(email, "f-email-err", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())),
    check(msg, "f-msg-err", msg.value.trim().length > 9),
  ];
  if (ok.includes(false)) {
    status.textContent = "";
    form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    return;
  }
  const subject = encodeURIComponent(`Project enquiry: ${type.value}`);
  const body = encodeURIComponent(`${msg.value.trim()}\n\n${name.value.trim()}\n${email.value.trim()}`);
  window.location.href = `mailto:${CONTACT.email}?subject=${subject}&body=${body}`;
  status.textContent = `Your email app should open with the message ready. If it doesn't, write to ${CONTACT.email}.`;
});

/* ---------- Loader and intro ---------- */
const loader = $(".loader")!;
const pct = $(".loader__pct")!;
const bar = $<HTMLElement>(".loader__bar span")!;

function intro() {
  measure();
  updateChapter();
  heroBg?.start();
  ScrollTrigger.refresh();
  if (reduced) {
    loader.remove();
    return;
  }
  const tl = gsap.timeline();
  tl.to(loader, { opacity: 0, duration: 0.6, ease: "power2.out", onComplete: () => loader.remove() })
    .from(".stage__name i", { yPercent: 110, duration: 1.4, ease: "expo.out", stagger: 0.05 }, 0.15)
    .from("[data-intro]", { y: 32, opacity: 0, duration: 1.1, ease: "expo.out", stagger: 0.08 }, 0.35)
    .from(".nav, .rail", { opacity: 0, duration: 0.8 }, 0.6);
}

if (reduced) {
  document.body.classList.add("reduced");
  Promise.all([document.fonts.ready, heroReady]).then(intro);
} else {
  const state = { p: 0 };
  const fontsReady = document.fonts.ready;
  gsap.to(state, {
    p: 100,
    duration: 1.1,
    ease: "power2.inOut",
    onUpdate: () => {
      pct.textContent = `${Math.round(state.p)}%`;
      bar.style.transform = `scaleX(${state.p / 100})`;
    },
    onComplete: () => {
      Promise.all([fontsReady, heroReady]).then(intro);
    },
  });
}
