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

  const mode = useMemo(() => {
    if (modeOverride) return modeOverride;
    if (cfg.mode === "auto") {
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

  const themeStyle = {
    "--accent": cfg.theme.accent,
    "--accent-2": cfg.theme.accent2,
  } as CSSProperties;

  return (
    <div className="stage" style={themeStyle} data-mode={mode}>
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
      </div>

      <div className="stage-body">
        <header className="stage-topbar">
          <div className="flex items-center gap-[1.6em] ml-auto">
            {cfg.countdown.showClock ? (
              <span className="stage-clock">{mounted ? formatClock(now) : "--:--:--"}</span>
            ) : null}
          </div>
        </header>

        {mode === "countdown" ? (
          <main className="stage-main">
            <CountdownView config={cfg.countdown} now={now} />
          </main>
        ) : (
          <div className="stage-main" aria-hidden="true" />
        )}

      </div>

      {mode === "motto" ? <MottoView config={cfg.motto} now={now} /> : null}
    </div>
  );
}
