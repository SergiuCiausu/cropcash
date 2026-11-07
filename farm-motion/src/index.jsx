import React from "react";
import { Composition, Easing, interpolate, registerRoot, useCurrentFrame, AbsoluteFill } from "remotion";
import { loadFont } from "@remotion/google-fonts/Geist";

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin", "latin-ext"] });

/* Same figures as FF in farm-app/mobile/shared.js. Canvas is transparent, 520 x 300, rendered at 2x. */
const W = 520, H = 300, FPS = 30, LOOP = 90;
const INK = "#18201C", INK2 = "#4A524E", TRACK = "rgba(20, 32, 26, .08)";
const CROPS = [["Maize", 2131], ["Sunflower", 1651], ["Wheat", 1591]];
const BILLS = [
  ["bank", "Loan instalment", "12 nov.", "−3.450 lei", "#FFF2C9", "#8A5C00"],
  ["sack", "AgroNova Inputs", "15 nov.", "−5.750 lei", "#FFF2C9", "#8A5C00"],
  ["down", "APIA subsidy", "Estimated, 16 dec.", "+46.200 lei", "#ECE8FF", "#5B3CD6"],
  ["map", "Land rent", "20 dec.", "−26.250 lei", "#FFF2C9", "#8A5C00"],
];
const COSTS = [["Fertiliser", 48200, "#5BA52A"], ["Diesel", 30600, "#7C5CFC"], ["Land rent", 26250, "#3D7A13"], ["Seed", 24300, "#5B3CD6"], ["Crop protection", 19400, "#C98A00"], ["Repairs", 13750, "#B8476A"]];
const TOTAL = COSTS.reduce((t, c) => t + c[1], 0);
const SAVES = ["Insurance", "Field map", "Fuel card"];
const ICONS = {
  bank: "M3 21h18M5 21V10M19 21V10M9.5 21V10M14.5 21V10M3 10l9-6 9 6Z",
  sack: "M6.5 8.5h11l1.5 12H5ZM9 8.5V7a3 3 0 0 1 6 0v1.5",
  down: "M12 5v14M6 13l6 6 6-6",
  map: "M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7ZM9 4v13M15 7v13",
};

const out = Easing.bezier(0.23, 1, 0.32, 1), inOut = Easing.bezier(0.77, 0, 0.175, 1);
const group = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
/* 0 to 1 from `start`, held, then back to 0 over the last 16 frames, so frame 90 equals frame 0 */
const life = (f, start = 0, dur = 26, leave = 0) => {
  const up = interpolate(f, [start, start + dur], [0, 1], { easing: out, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const down = interpolate(f, [72 - leave, 88 - leave], [1, 0], { easing: inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return up * down;
};
const Stage = ({ children }) => (
  <AbsoluteFill style={{ fontFamily, color: INK, fontVariantNumeric: "tabular-nums", WebkitFontSmoothing: "antialiased" }}>{children}</AbsoluteFill>
);

const Margin = () => {
  const f = useCurrentFrame();
  return (
    <Stage>
      <div style={{ position: "absolute", inset: "44px 16px", display: "grid", gap: 30, alignContent: "center" }}>
        {CROPS.map(([name, v], i) => {
          const p = life(f, 4 + i * 7, 30, (2 - i) * 3), max = CROPS[0][1];
          return (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "112px 1fr 122px", alignItems: "center", gap: 12, fontSize: 20 }}>
              <span>{name}</span>
              <div style={{ height: 20, borderRadius: 5, background: TRACK, overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", borderRadius: 5, background: "#5BA52A", transformOrigin: "left", transform: `scaleX(${(p * v) / max})` }} />
              </div>
              <span style={{ fontWeight: 600, textAlign: "right" }}>{group(p * v)} lei</span>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};

const Bills = () => {
  const f = useCurrentFrame();
  return (
    <Stage>
      <div style={{ position: "absolute", inset: "14px 12px", display: "grid", gap: 6, alignContent: "center" }}>
        {BILLS.map(([ic, name, when, amt, bg, fg], i) => {
          const p = life(f, 2 + i * 9, 24, (3 - i) * 2);
          const pos = i === 2;
          return (
            <div key={name} style={{ opacity: p, transform: `translateY(${(1 - p) * 18}px)`, display: "grid", gridTemplateColumns: "48px 1fr auto", gap: 14, alignItems: "center", height: 62 }}>
              <span style={{ display: "grid", placeItems: "center", width: 48, height: 48, borderRadius: 13, background: bg, color: fg }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[ic]} /></svg>
              </span>
              <span style={{ display: "grid", gap: 1, lineHeight: 1.3 }}>
                <span style={{ fontSize: 20, fontWeight: 500 }}>{name}</span>
                <span style={{ fontSize: 17, color: pos ? "#5B3CD6" : INK2 }}>{when}</span>
              </span>
              <span style={{ fontSize: 20, fontWeight: 600, color: pos ? "#3D7A13" : INK }}>{amt}</span>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};

const Costs = () => {
  const f = useCurrentFrame();
  const R = 84, C = 2 * Math.PI * R, sweep = life(f, 2, 44);
  let at = 0;
  return (
    <Stage>
      <div style={{ position: "absolute", inset: "24px 12px", display: "grid", gridTemplateColumns: "196px 1fr", gap: 22, alignItems: "center" }}>
        <div style={{ position: "relative", width: 196, height: 196 }}>
          <svg width="196" height="196" viewBox="0 0 208 208" style={{ transform: "rotate(-90deg)" }}>
            {COSTS.map(([n, v, c]) => {
              const seg = (v / TOTAL) * C, start = at; at += seg;
              const shown = Math.max(0, Math.min(seg - 4, sweep * C - start));
              return <circle key={n} cx="104" cy="104" r={R} fill="none" stroke={c} strokeWidth="27" strokeDasharray={`${shown} ${C}`} strokeDashoffset={-start} />;
            })}
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", textAlign: "center", lineHeight: 1.2 }}>
            <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.02em" }}>{group(sweep * TOTAL)}</span>
            <span style={{ fontSize: 15, color: INK2 }}>lei total</span>
          </div>
        </div>
        <div style={{ display: "grid", gap: 11 }}>
          {COSTS.map(([n, v, c], i) => {
            const p = life(f, 6 + i * 6, 20, (5 - i));
            return (
              <div key={n} style={{ opacity: p, transform: `translateX(${(1 - p) * 10}px)`, display: "grid", gridTemplateColumns: "12px 1fr auto", gap: 8, alignItems: "center", fontSize: 18 }}>
                <i style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />
                <span>{n}</span>
                <b style={{ fontWeight: 500 }}>{Math.round((v / TOTAL) * 100)}%</b>
              </div>
            );
          })}
        </div>
      </div>
    </Stage>
  );
};

const Reserve = () => {
  const f = useCurrentFrame();
  const GOAL = 60000, NOW = 38000;
  const steps = [8, 20, 32];
  const fill = (f < 72 ? steps.reduce((t, s) => t + interpolate(f, [s + 14, s + 26], [0, 1], { easing: out, extrapolateLeft: "clamp", extrapolateRight: "clamp" }), 0) / 3 : 1) * life(f, 0, 1);
  return (
    <Stage>
      <div style={{ position: "absolute", inset: "20px 16px", display: "grid", alignContent: "center", gap: 18 }}>
        <div style={{ height: 88, position: "relative" }}>
          {SAVES.map((n, i) => {
            const show = life(f, steps[i] - 8, 10, (2 - i) * 2);
            const fall = interpolate(f, [steps[i] + 2, steps[i] + 16], [0, 1], { easing: Easing.bezier(0.5, 0, 0.75, 0), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const coin = interpolate(fall, [0, .1, .85, 1], [0, 1, 1, 0]);
            return (
              <React.Fragment key={n}>
                <span style={{ position: "absolute", left: `${i * 33.4}%`, top: 4, width: "32%", padding: "8px 6px", textAlign: "center", borderRadius: 999, border: "1px solid rgba(91, 60, 214, .3)", background: "#ECE8FF", color: "#5B3CD6", fontSize: 18, fontWeight: 500, whiteSpace: "nowrap", opacity: show, transform: `translateY(${(1 - show) * 8}px)` }}>{n}</span>
                <i style={{ position: "absolute", left: `calc(${i * 33.4 + 16}% - 8px)`, top: 40, width: 16, height: 16, borderRadius: "50%", background: "#F2B81F", opacity: coin, transform: `translateY(${fall * 50}px)` }} />
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ height: 26, borderRadius: 13, background: TRACK, overflow: "hidden" }}>
          <div style={{ width: `${(NOW / GOAL) * 100}%`, height: "100%", borderRadius: 13, background: "#5B3CD6", transformOrigin: "left", transform: `scaleX(${fill})` }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-.025em" }}>{group(Math.round(fill * NOW / 50) * 50)} lei</span>
          <span style={{ fontSize: 18, color: INK2 }}>of 60.000 lei</span>
        </div>
      </div>
    </Stage>
  );
};

const Root = () => (
  <>
    <Composition id="margin" component={Margin} durationInFrames={LOOP} fps={FPS} width={W} height={H} />
    <Composition id="bills" component={Bills} durationInFrames={LOOP} fps={FPS} width={W} height={H} />
    <Composition id="costs" component={Costs} durationInFrames={LOOP} fps={FPS} width={W} height={H} />
    <Composition id="reserve" component={Reserve} durationInFrames={LOOP} fps={FPS} width={W} height={H} />
  </>
);
registerRoot(Root);
