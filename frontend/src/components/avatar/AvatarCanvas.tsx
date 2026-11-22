"use client";

import { useEffect, useRef } from "react";
import * as T from "three";
import { AvatarRig } from "../map/avatar";
import type { AvatarHat } from "@/types/tverse";
import { FOCUS } from "@/lib/ui";
import { useAvatarLook } from "./look";

/** An isolated, demand-sized canvas. The portrait sleeps while the larger fitting-room view is open. */
export function AvatarCanvas({ portrait = false, hat, gainSeq, paused = false, fallback }: {
  portrait?: boolean; hat: AvatarHat; gainSeq?: number; paused?: boolean; fallback?: string;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const rig = useRef<AvatarRig | null>(null);
  const equipped = useRef(hat);
  const reframe = useRef<(() => void) | null>(null);
  const loop = useRef<(() => void) | null>(null);
  const yaw = useRef(-.24);
  const drag = useRef<number | null>(null);
  const sleep = useRef(paused);
  const look = useAvatarLook();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: T.WebGLRenderer;
    try { renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); }
    catch { return; }
    const canvas = renderer.domElement;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    el.appendChild(canvas);
    el.dataset.rendered = "true";
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    const scene = new T.Scene();
    const avatar = new AvatarRig();
    rig.current = avatar;
    scene.add(avatar.root, new T.HemisphereLight(0xfff7ed, 0xbccbd3, 1.75));
    const key = new T.DirectionalLight(0xfff0dd, 2.6);
    key.position.set(-3, 5, -4);
    const rim = new T.DirectionalLight(0xc5d8ec, 1.6);
    rim.position.set(3, 2, 2);
    scene.add(key, rim);
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, .01, 20);
    const resize = () => {
      const tallHat = equipped.current === "dunkin_hat";
      const target = portrait ? (tallHat ? 1.63 : 1.58) : 1.09;
      const half = portrait ? (tallHat ? .67 : .51) : 1.27;
      camera.position.set(0, target + (portrait ? .15 : .30), -4);
      camera.lookAt(0, target, 0);
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.left = -half * w / h; camera.right = half * w / h;
      camera.top = half; camera.bottom = -half;
      camera.updateProjectionMatrix();
    };
    reframe.current = resize;
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    let timer = 0, previous = 0, time = 0;
    const draw = () => {
      if (document.hidden || sleep.current) return;
      const now = performance.now();
      const dt = previous ? Math.min(.1, (now - previous) / 1000) : 1 / 24;
      previous = now; time += dt;
      avatar.root.rotation.y += (yaw.current - avatar.root.rotation.y) * (1 - Math.exp(-dt * 14));
      avatar.update(time, dt);
      renderer.render(scene, camera);
      timer = window.setTimeout(draw, 1000 / (portrait ? 16 : 24));
    };
    const wake = () => {
      window.clearTimeout(timer);
      previous = 0;
      draw();
    };
    loop.current = wake;
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      observer.disconnect();
      loop.current = null;
      reframe.current = null;
      rig.current = null;
      avatar.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      delete el.dataset.rendered;
    };
  }, [portrait]);

  useEffect(() => { sleep.current = paused; loop.current?.(); }, [paused]);
  useEffect(() => { rig.current?.setLook(look); }, [look]);
  useEffect(() => {
    equipped.current = hat;
    rig.current?.setHat(hat, 0, false);
    reframe.current?.();
  }, [hat]);
  useEffect(() => { if (gainSeq) rig.current?.cheer(); }, [gainSeq]);

  return <span ref={host} role={portrait ? undefined : "slider"} tabIndex={portrait ? undefined : 0}
    aria-label={portrait ? undefined : "Rotate rider preview"} aria-valuemin={portrait ? undefined : 0}
    aria-valuemax={portrait ? undefined : 360} aria-valuenow={portrait ? undefined : 0}
    className={`group relative block h-full w-full overflow-hidden ${portrait ? "" : `cursor-grab touch-none rounded-lg active:cursor-grabbing ${FOCUS}`}`}
    onPointerEnter={() => { if (portrait) rig.current?.wave(); }}
    onKeyDown={e => {
      if (portrait) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault(); yaw.current += e.key === "ArrowLeft" ? -.32 : .32;
        e.currentTarget.setAttribute("aria-valuenow", String(Math.round((yaw.current * 180 / Math.PI % 360 + 360) % 360)));
      }
    }}
    onPointerDown={e => {
      if (portrait) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = e.clientX;
    }}
    onPointerMove={e => {
      if (drag.current === null) return;
      yaw.current += (drag.current - e.clientX) * .018;
      drag.current = e.clientX;
      e.currentTarget.setAttribute("aria-valuenow", String(Math.round((yaw.current * 180 / Math.PI % 360 + 360) % 360)));
    }}
    onLostPointerCapture={() => { drag.current = null; }}>
    <span className="grid h-full place-items-center text-xs text-zinc-300 group-data-[rendered=true]:invisible">{fallback ?? "3D preview unavailable"}</span>
  </span>;
}
