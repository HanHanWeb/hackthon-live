"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { AppConfig, DisplayMode } from "@/lib/config";
import { formatClock, nearMilestone, parseLocal } from "@/lib/time";
import { CountdownView } from "./CountdownView";
import { MottoView } from "./MottoView";

interface StageProps {
  config: AppConfig;
  serverTime: number;
  /** 是否轮询 /api/config 保持与后台同步 */
  live?: boolean;
  /** 现场临时强制切换形态（不写回配置） */
  modeOverride?: DisplayMode | null;
}

const SYNC_INTERVAL = 4000;
/** 切换过渡时长（ms）：退出动画播完后再卸载旧视图 */
const TRANSITION_MS = 720;

type RenderedMode = "countdown" | "motto";

interface ViewSlot {
  mode: RenderedMode;
  /** 每次进入自增，用于重置 CSS 动画 */
  key: number;
}

export function Stage({ config, serverTime, live = true, modeOverride = null }: StageProps) {
  const [now, setNow] = useState(serverTime);
  const [cfg, setCfg] = useState<AppConfig>(config);
  const [mounted, setMounted] = useState(false);
  const cfgRef = useRef<AppConfig>(config);

  useEffect(() => {
    setCfg(config);
    cfgRef.current = config;
  }, [config]);

  useEffect(() => {
    // 首帧沿用服务端时间保证 SSR 一致，挂载后再切到本机时钟
    setMounted(true);
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!live) return;
    let stopped = false;

    const sync = async () => {
      try {
        const response = await fetch("/api/config", { cache: "no-store" });
        if (!response.ok || stopped) return;
        const next = (await response.json()) as AppConfig;
        if (next.revision !== cfgRef.current.revision) {
          cfgRef.current = next;
          setCfg(next);
        }
      } catch {
        // 网络抖动时静默重试
      }
    };

    const timer = window.setInterval(() => void sync(), SYNC_INTERVAL);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [live]);

  const mode = useMemo<RenderedMode>(() => {
    if (modeOverride && modeOverride !== "auto") return modeOverride;
    if (cfg.mode === "auto" || modeOverride === "auto") {
      const target = parseLocal(cfg.countdown.targetAt);
      // 整点对齐：只在剩余时间接近整点（如剩余 3 小时）时切到倒计时
      if (cfg.autoAlign && target) {
        return nearMilestone(target.getTime() - now, cfg.autoLeadSeconds, cfg.autoHoldSeconds)
          ? "countdown"
          : "motto";
      }
      const slot = Math.floor(now / (cfg.autoSeconds * 1000));
      return slot % 2 === 0 ? "countdown" : "motto";
    }
    return cfg.mode;
  }, [
    cfg.mode,
    cfg.autoSeconds,
    cfg.autoAlign,
    cfg.autoLeadSeconds,
    cfg.autoHoldSeconds,
    cfg.countdown.targetAt,
    now,
    modeOverride,
  ]);

  // 当前激活视图 + 退出中的 ghost 视图；通过 key 自增重新触发 CSS 动画
  const [current, setCurrent] = useState<ViewSlot>({ mode, key: 0 });
  const [leaving, setLeaving] = useState<ViewSlot | null>(null);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [sweepKey, setSweepKey] = useState(0);
  const keyRef = useRef(0);
  const prevModeRef = useRef<RenderedMode>(mode);
  const transitionTimer = useRef<number | null>(null);

  useEffect(() => {
    if (mode === prevModeRef.current) return;
    const from = prevModeRef.current;
    prevModeRef.current = mode;

    // 倒计时 → 格言：向下淡出（forward）；格言 → 倒计时：向上淡出（backward）
    setDirection(from === "countdown" ? "forward" : "backward");
    setLeaving(current);
    keyRef.current += 1;
    setCurrent({ mode, key: keyRef.current });
    setSweepKey((v) => v + 1);

    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = window.setTimeout(() => {
      setLeaving(null);
      transitionTimer.current = null;
    }, TRANSITION_MS);

    return () => {
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    return () => {
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    };
  }, []);

  const themeStyle = {
    "--accent": cfg.theme.accent,
    "--accent-2": cfg.theme.accent2,
  } as CSSProperties;

  const renderView = (slot: ViewSlot, role: "enter" | "leave") =>
    slot.mode === "countdown" ? (
      <main
        key={`cd-${slot.key}-${role}`}
        className="stage-main stage-view"
        data-role={role}
        data-direction={direction}
        aria-hidden={role === "leave"}
      >
        <CountdownView config={cfg.countdown} now={now} />
      </main>
    ) : (
      <div
        key={`motto-${slot.key}-${role}`}
        className="stage-motto-view stage-view"
        data-role={role}
        data-direction={direction}
        aria-hidden={role === "leave"}
      >
        <MottoView config={cfg.motto} now={now} />
      </div>
    );

  return (
    <div className="stage" style={themeStyle} data-mode={mode} data-transition={direction}>
      <div className="stage-layer">
        {cfg.theme.showGrid ? <div className="stage-grid" /> : null}
        {cfg.theme.glow ? (
          <>
            <div className="stage-glow stage-glow-a" />
            <div className="stage-glow stage-glow-b" />
          </>
        ) : null}
        {cfg.theme.scanlines ? <div className="stage-layer stage-scanlines" /> : null}
        <div className="stage-layer stage-noise" />
        <div className="stage-layer stage-frame" />
        {leaving ? (
          <div key={sweepKey} className="stage-sweep" data-direction={direction} aria-hidden="true" />
        ) : null}
      </div>

      <div className="stage-body">
        <header className="stage-topbar">
          <div className="flex items-center gap-[1.6em] ml-auto">
            {cfg.countdown.showClock ? (
              <span className="stage-clock">{mounted ? formatClock(now) : "--:--:--"}</span>
            ) : null}
          </div>
        </header>

        <div className="stage-viewport">
          {leaving ? renderView(leaving, "leave") : null}
          {renderView(current, "enter")}
        </div>
      </div>
    </div>
  );
}
