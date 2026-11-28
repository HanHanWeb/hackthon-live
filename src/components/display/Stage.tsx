"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { normalizeConfig, type AppConfig, type DisplayMode } from "@/lib/config";
import { nearMilestone, parseLocal } from "@/lib/time";
import { CountdownView } from "./CountdownView";
import { MottoView } from "./MottoView";

interface StageProps {
  config: AppConfig;
  /** 是否轮询 /api/config 保持与后台同步 */
  live?: boolean;
  /** 现场临时强制切换形态（不写回配置） */
  modeOverride?: DisplayMode | null;
  /** 预览重播计数器：自增时直接重播当前视图动画，无需销毁重载 iframe */
  replayNonce?: number;
}

const SYNC_INTERVAL = 4000;
/** 退出动画时长（ms）：旧视图完全淡出后才进入新视图，须与 CSS leave 动画一致 */
const LEAVE_MS = 360;

type RenderedMode = "countdown" | "motto";

interface ViewSlot {
  mode: RenderedMode;
  /** 每次新视图进入自增，用于重置 CSS 动画 */
  key: number;
  /** 仅在新视图真正切入时播入场动画；快速切回取消离场时不重播 */
  animateEnter: boolean;
}

interface LeavingSlot extends ViewSlot {
  /** 离场 360ms 期间冻结时间，避免退出动画中格言换句或倒计时跳动 */
  frozenNow: number | null;
}

export function Stage({ config, live = true, modeOverride = null, replayNonce = 0 }: StageProps) {
  // 首帧置 null，挂载后再取客户端时间，避免服务端与大屏浏览器时区不同触发 Hydration 报错
  const [now, setNow] = useState<number | null>(null);
  const [polledCfg, setPolledCfg] = useState<AppConfig | null>(null);
  const cfg = live ? (polledCfg ?? config) : config;
  const cfgRef = useRef<AppConfig>(cfg);
  cfgRef.current = cfg;

  useEffect(() => {
    setPolledCfg(null);
  }, [config]);

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    let timer: number | null = null;
    let activeController: AbortController | null = null;

    const schedule = () => {
      if (!stopped) timer = window.setTimeout(() => void sync(), SYNC_INTERVAL);
    };
    const sync = async () => {
      activeController = new AbortController();
      try {
        const response = await fetch("/api/config", {
          cache: "no-store",
          signal: activeController.signal,
        });
        if (!response.ok) return;
        const next = normalizeConfig(await response.json());
        if (stopped) return;
        const current = cfgRef.current;
        const changed = JSON.stringify(next) !== JSON.stringify(current);
        // 请求串行执行，拒绝低版本响应；同 revision 的内容变化来自手动编辑，也应同步。
        if (next.revision >= current.revision && changed) {
          cfgRef.current = next;
          setPolledCfg(next);
        }
      } catch {
        // 网络抖动或中止请求时静默处理
      } finally {
        activeController = null;
        // 上一次请求结束后再计时，任何网络时延下都不会重叠。
        schedule();
      }
    };

    schedule();
    return () => {
      stopped = true;
      activeController?.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [live]);

  const mode = useMemo<RenderedMode>(() => {
    if (modeOverride && modeOverride !== "auto") return modeOverride;
    if (cfg.mode === "auto" || modeOverride === "auto") {
      if (now === null) return "countdown";
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

  const effectiveAuto = modeOverride === "auto" || (!modeOverride && cfg.mode === "auto");
  const needsTick = effectiveAuto || mode === "countdown";

  useEffect(() => {
    setNow(Date.now());
    if (!needsTick) return;
    let timer: number | null = null;
    // 对齐系统整秒边界，避免 setInterval 漂移导致倒计时跳秒或停顿
    const scheduleTick = () => {
      const delay = Math.max(16, 1000 - (Date.now() % 1000) + 5);
      timer = window.setTimeout(() => {
        setNow(Date.now());
        scheduleTick();
      }, delay);
    };
    scheduleTick();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [needsTick]);

  // 串行转场：旧视图先完全退出，新视图再开始淡入。
  // 基于 current.mode 与目标 mode 的差异驱动定时器，保证 StrictMode 双执行及快速连切不会卡死黑屏。
  const [current, setCurrent] = useState<ViewSlot>({ mode, key: 0, animateEnter: true });
  const [leaving, setLeaving] = useState<LeavingSlot | null>(null);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const keyRef = useRef(0);
  const lastReplayRef = useRef(replayNonce);
  const leavingRef = useRef<LeavingSlot | null>(null);
  const lastQuoteRef = useRef<string | null>(null);
  const nowRef = useRef<number | null>(now);
  nowRef.current = now;

  useEffect(() => {
    if (replayNonce === lastReplayRef.current) return;
    lastReplayRef.current = replayNonce;
    keyRef.current += 1;
    leavingRef.current = null;
    setLeaving(null);
    setCurrent({ mode, key: keyRef.current, animateEnter: true });
  }, [replayNonce, mode]);

  useEffect(() => {
    if (current.mode === mode) {
      if (leavingRef.current !== null) {
        leavingRef.current = null;
        setLeaving(null);
        setCurrent((prev) => (prev.animateEnter ? { ...prev, animateEnter: false } : prev));
      }
      return;
    }

    setDirection(current.mode === "countdown" ? "forward" : "backward");
    const nextLeaving: LeavingSlot = {
      mode: current.mode,
      key: current.key,
      animateEnter: false,
      frozenNow: nowRef.current,
    };
    leavingRef.current = nextLeaving;
    setLeaving(nextLeaving);

    const timer = window.setTimeout(() => {
      keyRef.current += 1;
      leavingRef.current = null;
      setCurrent({ mode, key: keyRef.current, animateEnter: true });
      setLeaving(null);
    }, LEAVE_MS);

    return () => window.clearTimeout(timer);
  }, [mode, current.mode, current.key]);

  const themeStyle = {
    "--accent": cfg.theme.accent,
    "--accent-2": cfg.theme.accent2,
  } as CSSProperties;

  const renderView = (slot: ViewSlot | LeavingSlot, role: "enter" | "idle" | "leave") => {
    // key 不包含 role：enter → leave 只切换 CSS 动画，不能重新挂载旧视图并重播内部动画
    const isLeaving = role === "leave";
    const viewNow = isLeaving && "frozenNow" in slot ? slot.frozenNow : now;
    return slot.mode === "countdown" ? (
      <main
        key={`cd-${slot.key}`}
        className="stage-main stage-view"
        data-role={role}
        data-direction={direction}
        aria-hidden={isLeaving}
      >
        <CountdownView config={cfg.countdown} now={viewNow} />
      </main>
    ) : (
      <div
        key={`motto-${slot.key}`}
        className="stage-motto-view stage-view"
        data-role={role}
        data-direction={direction}
        aria-hidden={isLeaving}
      >
        <MottoView config={cfg.motto} paused={isLeaving} lastQuoteRef={lastQuoteRef} />
      </div>
    );
  };

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
      </div>

      <div className="stage-body">
        <div className="stage-viewport">
          {leaving ? renderView(leaving, "leave") : renderView(current, current.animateEnter ? "enter" : "idle")}
        </div>
      </div>
    </div>
  );
}
