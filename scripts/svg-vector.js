// SVG 아이콘 -> PowerPoint 벡터 도형(custGeom) 변환기 (브라우저 안에서 실행된다)
//
// 원칙: "완벽하게 옮겨지는 것만" 벡터로 만든다.
//   1) 모든 곡선을 큐빅 베지어로 정규화한다 (호는 90도 이하로 쪼개 변환 - 오차 0.02% 미만)
//   2) 변환 결과를 브라우저의 실제 경로(getPointAtLength)와 대조해 검증한다
//   3) 오차가 기준을 넘거나 다룰 수 없는 요소(text, transform 등)가 있으면 통째로 포기한다
//      -> 포기한 아이콘은 기존처럼 투명 PNG로 심는다
//
// window.__svg2vec(svgElement) -> { ok, shapes[], reason }
(function () {
  const TOL = 0.0015;   // 허용 오차: viewBox 크기 대비 0.15%
  const SAMPLES = 96;   // 경로당 검증 표본 수

  // ── path의 d 문자열을 명령 목록으로 ──
  function parsePath(d) {
    const out = [];
    const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
    const toks = [];
    let m;
    while ((m = re.exec(d))) toks.push(m[1] || parseFloat(m[2]));
    let i = 0, cmd = null;
    while (i < toks.length) {
      if (typeof toks[i] === "string") cmd = toks[i++];
      const n = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }[cmd.toUpperCase()];
      if (n === undefined) throw new Error("알 수 없는 명령 " + cmd);
      const args = toks.slice(i, i + n);
      if (args.length < n) throw new Error("인자 부족 " + cmd);
      i += n;
      out.push({ cmd, args });
      if (cmd === "M") cmd = "L";        // 연속 좌표는 L로
      else if (cmd === "m") cmd = "l";
    }
    return out;
  }

  // ── 호(arc) -> 큐빅 베지어 여러 개 (SVG 스펙 F.6.5) ──
  function arcToCubics(x0, y0, rx, ry, phiDeg, fa, fs, x, y) {
    if (rx === 0 || ry === 0) return [{ type: "L", to: [x, y] }];
    const phi = (phiDeg * Math.PI) / 180;
    const cosP = Math.cos(phi), sinP = Math.sin(phi);
    const dx2 = (x0 - x) / 2, dy2 = (y0 - y) / 2;
    const x1 = cosP * dx2 + sinP * dy2;
    const y1 = -sinP * dx2 + cosP * dy2;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const L = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (L > 1) { const s = Math.sqrt(L); rx *= s; ry *= s; }
    const sign = fa === fs ? -1 : 1;
    let num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    if (num < 0) num = 0;
    const co = sign * Math.sqrt(num / den);
    const cx1 = (co * rx * y1) / ry, cy1 = (-co * ry * x1) / rx;
    const cx = cosP * cx1 - sinP * cy1 + (x0 + x) / 2;
    const cy = sinP * cx1 + cosP * cy1 + (y0 + y) / 2;
    const ang = (ux, uy, vx, vy) => {
      const d = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
      let c = (ux * vx + uy * vy) / d;
      c = Math.max(-1, Math.min(1, c));
      return (ux * vy - uy * vx < 0 ? -1 : 1) * Math.acos(c);
    };
    const th1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
    let dth = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
    if (!fs && dth > 0) dth -= 2 * Math.PI;
    if (fs && dth < 0) dth += 2 * Math.PI;

    const segs = Math.ceil(Math.abs(dth / (Math.PI / 2)));  // 90도 이하로 쪼갠다
    const out = [];
    const delta = dth / segs;
    const t = (4 / 3) * Math.tan(delta / 4);
    let th = th1;
    let px = x0, py = y0;
    for (let s = 0; s < segs; s++) {
      const th2 = th + delta;
      const e = (a) => {
        const ca = Math.cos(a), sa = Math.sin(a);
        return [cosP * rx * ca - sinP * ry * sa + cx, sinP * rx * ca + cosP * ry * sa + cy];
      };
      const dE = (a) => {
        const ca = Math.cos(a), sa = Math.sin(a);
        return [-cosP * rx * sa - sinP * ry * ca, -sinP * rx * sa + cosP * ry * ca];
      };
      const [ex, ey] = e(th2);
      const [d1x, d1y] = dE(th);
      const [d2x, d2y] = dE(th2);
      out.push({ type: "C", c1: [px + t * d1x, py + t * d1y], c2: [ex - t * d2x, ey - t * d2y], to: [ex, ey] });
      px = ex; py = ey; th = th2;
    }
    return out;
  }

  // ── d -> 서브패스 목록 (모든 곡선은 큐빅으로) ──
  function normalize(d) {
    const cmds = parsePath(d);
    const subs = [];
    let cur = null;
    let x = 0, y = 0, sx = 0, sy = 0;
    let pcx = null, pcy = null, pqx = null, pqy = null;
    const push = (seg) => { if (!cur) throw new Error("M 없이 시작"); cur.segs.push(seg); };

    for (const { cmd, args } of cmds) {
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      if (C === "M") {
        x = rel ? x + args[0] : args[0];
        y = rel ? y + args[1] : args[1];
        sx = x; sy = y;
        cur = { start: [x, y], segs: [], closed: false };
        subs.push(cur);
        pcx = pcy = pqx = pqy = null;
      } else if (C === "L") {
        x = rel ? x + args[0] : args[0];
        y = rel ? y + args[1] : args[1];
        push({ type: "L", to: [x, y] }); pcx = pcy = pqx = pqy = null;
      } else if (C === "H") {
        x = rel ? x + args[0] : args[0];
        push({ type: "L", to: [x, y] }); pcx = pcy = pqx = pqy = null;
      } else if (C === "V") {
        y = rel ? y + args[0] : args[0];
        push({ type: "L", to: [x, y] }); pcx = pcy = pqx = pqy = null;
      } else if (C === "C" || C === "S") {
        let c1x, c1y, c2x, c2y, ex, ey;
        if (C === "C") {
          [c1x, c1y, c2x, c2y, ex, ey] = args;
          if (rel) { c1x += x; c1y += y; c2x += x; c2y += y; ex += x; ey += y; }
        } else {
          [c2x, c2y, ex, ey] = args;
          if (rel) { c2x += x; c2y += y; ex += x; ey += y; }
          c1x = pcx === null ? x : 2 * x - pcx;   // 앞 제어점의 반사
          c1y = pcy === null ? y : 2 * y - pcy;
        }
        push({ type: "C", c1: [c1x, c1y], c2: [c2x, c2y], to: [ex, ey] });
        pcx = c2x; pcy = c2y; pqx = pqy = null;
        x = ex; y = ey;
      } else if (C === "Q" || C === "T") {
        let qx, qy, ex, ey;
        if (C === "Q") {
          [qx, qy, ex, ey] = args;
          if (rel) { qx += x; qy += y; ex += x; ey += y; }
        } else {
          [ex, ey] = args;
          if (rel) { ex += x; ey += y; }
          qx = pqx === null ? x : 2 * x - pqx;
          qy = pqy === null ? y : 2 * y - pqy;
        }
        // 2차 -> 3차 (정확한 변환)
        push({ type: "C",
               c1: [x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y)],
               c2: [ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey)],
               to: [ex, ey] });
        pqx = qx; pqy = qy; pcx = pcy = null;
        x = ex; y = ey;
      } else if (C === "A") {
        let [rx, ry, rot, fa, fs, ex, ey] = args;
        if (rel) { ex += x; ey += y; }
        for (const s of arcToCubics(x, y, rx, ry, rot, !!fa, !!fs, ex, ey)) push(s);
        x = ex; y = ey; pcx = pcy = pqx = pqy = null;
      } else if (C === "Z") {
        if (cur) { cur.closed = true; x = sx; y = sy; }
        pcx = pcy = pqx = pqy = null;
      }
    }
    return subs.filter((s) => s.segs.length > 0 || s.closed);
  }

  // ── 큐빅 위의 점 ──
  const bez = (p0, c1, c2, p1, t) => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0],
            a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]];
  };

  // 정규화 결과를 촘촘한 폴리라인으로 (검증용)
  function flatten(subs, per) {
    const pts = [];
    for (const sub of subs) {
      let p = sub.start;
      pts.push(p);
      for (const s of sub.segs) {
        if (s.type === "L") { pts.push(s.to); p = s.to; }
        else {
          for (let i = 1; i <= per; i++) pts.push(bez(p, s.c1, s.c2, s.to, i / per));
          p = s.to;
        }
      }
      if (sub.closed) pts.push(sub.start);
    }
    return pts;
  }

  // 폴리라인에서 특정 위치의 점 (길이 비율 기준)
  function atRatio(pts, r) {
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      seg.push(d); total += d;
    }
    if (total === 0) return pts[0];
    let want = r * total, acc = 0;
    for (let i = 0; i < seg.length; i++) {
      if (acc + seg[i] >= want) {
        const t = seg[i] === 0 ? 0 : (want - acc) / seg[i];
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
                pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
      }
      acc += seg[i];
    }
    return pts[pts.length - 1];
  }

  // ── 검증: 브라우저가 그리는 실제 경로와 대조 ──
  function verify(el, subs, scale) {
    if (typeof el.getTotalLength !== "function") return { ok: false, why: "길이 측정 불가" };
    const len = el.getTotalLength();
    if (!isFinite(len) || len <= 0) return { ok: false, why: "길이 0" };
    // 서브패스가 여러 개면 getPointAtLength가 이어붙여 재므로 대조가 어긋난다 -> 각자 검증 불가
    if (subs.length > 1) return { ok: false, why: "서브패스 여러 개" };
    const mine = flatten(subs, 24);
    let worst = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const r = i / SAMPLES;
      const p = el.getPointAtLength(r * len);
      const q = atRatio(mine, r);
      worst = Math.max(worst, Math.hypot(p.x - q[0], p.y - q[1]));
    }
    return { ok: worst / scale <= TOL, why: `오차 ${(worst / scale * 100).toFixed(3)}%`, err: worst / scale };
  }

  // ── 요소 하나를 도형 정보로 ──
  function shapeOf(el, scale) {
    const tag = el.tagName.toLowerCase();
    const cs = getComputedStyle(el);
    if (el.getAttribute("transform")) return { skip: "transform 사용" };

    const num = (a, d = 0) => { const v = parseFloat(el.getAttribute(a)); return isNaN(v) ? d : v; };
    const style = {
      stroke: cs.stroke && cs.stroke !== "none" ? cs.stroke : null,
      strokeW: parseFloat(cs.strokeWidth) || 0,
      fill: cs.fill && cs.fill !== "none" ? cs.fill : null,
      dash: (cs.strokeDasharray && cs.strokeDasharray !== "none") ? cs.strokeDasharray : null,
    };
    if (!style.stroke && !style.fill) return { skip: "보이지 않음" };

    // 원·타원은 PPT 기본 도형으로 정확히 대응된다
    if (tag === "circle" || tag === "ellipse") {
      const rx = tag === "circle" ? num("r") : num("rx");
      const ry = tag === "circle" ? num("r") : num("ry");
      if (rx <= 0 || ry <= 0) return { skip: "반지름 0" };
      return { kind: "ellipse", cx: num("cx"), cy: num("cy"), rx, ry, style };
    }
    if (tag === "rect") {
      const w = num("width"), h = num("height");
      if (w <= 0 || h <= 0) return { skip: "크기 0" };
      return { kind: "rect", x: num("x"), y: num("y"), w, h, rx: num("rx", num("ry")), style };
    }

    let d = null;
    if (tag === "path") d = el.getAttribute("d");
    else if (tag === "line") d = `M${num("x1")} ${num("y1")}L${num("x2")} ${num("y2")}`;
    else if (tag === "polyline" || tag === "polygon") {
      const p = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
      if (p.length < 4 || p.some(isNaN)) return { skip: "points 해석 불가" };
      d = "M" + p[0] + " " + p[1];
      for (let i = 2; i < p.length; i += 2) d += "L" + p[i] + " " + p[i + 1];
      if (tag === "polygon") d += "Z";
    } else {
      return { skip: tag + " 요소" };
    }

    let subs;
    try { subs = normalize(d); } catch (e) { return { skip: "경로 해석 실패: " + e.message }; }
    if (!subs.length) return { skip: "빈 경로" };

    const v = verify(el, subs, scale);
    if (!v.ok) return { skip: "검증 실패(" + v.why + ")" };
    return { kind: "path", subs, style, err: v.err };
  }

  window.__svg2vec = function (svg) {
    const vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some(isNaN)) return { ok: false, reason: "viewBox 없음" };
    const [vx, vy, vw, vh] = vb;
    if (vw <= 0 || vh <= 0) return { ok: false, reason: "viewBox 크기 0" };
    const scale = Math.max(vw, vh);

    const kids = [...svg.children];
    if (!kids.length) return { ok: false, reason: "내용 없음" };

    const shapes = [];
    for (const el of kids) {
      const t = el.tagName.toLowerCase();
      if (t === "text" || t === "tspan" || t === "image" || t === "foreignObject" ||
          t === "defs" || t === "clipPath" || t === "mask" || t === "g" || t === "use") {
        return { ok: false, reason: t + " 요소는 도형으로 옮길 수 없음" };
      }
      const s = shapeOf(el, scale);
      if (s.skip) return { ok: false, reason: s.skip };
      shapes.push(s);
    }
    return { ok: true, vb: [vx, vy, vw, vh], shapes };
  };
})();
