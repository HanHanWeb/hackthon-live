"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeConfig, type AppConfig, type DisplayMode } from "@/lib/config";
import { Stage } from "./Stage";

interface LiveConfigHostProps {
  config: AppConfig;
  isPreview?: boolean;
}

const HOTKEYS: Record<string, DisplayMode | null> = {
  "1": "countdown",
  "2": "motto",
  "3": "auto",
  "0": null,
  Escape: null,
};

/**
 * 大屏外壳：
 * - 独立打开时按后台保存的配置展示，并每 4 秒同步最新版本；
 * - 被后台以 iframe 嵌入时，接收父窗口推送的草稿配置与重播指令，实现所见即所得预览；
 * - 现场按 1 / 2 / 3 可临时切到倒计时 / 格言 / 轮播，按 0 或 Esc 回到后台设定（不写回配置）。
 */
export function LiveConfigHost({ config, isPreview = false }: LiveConfigHostProps) {
  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [override, setOverride] = useState<DisplayMode | null | undefined>(undefined);
  const [replayNonce, setReplayNonce] = useState(0);

  useEffect(() => {
    if (window.parent === window) return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; config?: unknown } | null;
      if (data?.type === "hackathon:preview-config") {
        setDraft(normalizeConfig(data.config));
      } else if (data?.type === "hackathon:preview-replay") {
        setReplayNonce((value) => value + 1);
      }
    };

    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "hackathon:preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (isPreview || window.parent !== window) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl+1 / Cmd+1 是浏览器切标签，不能顺带把大屏也切了
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!Object.prototype.hasOwnProperty.call(HOTKEYS, event.key)) return;
      event.preventDefault();
      setOverride(HOTKEYS[event.key]);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPreview]);

  const effective = useMemo(() => draft ?? config, [draft, config]);

  return (
    <Stage
      config={effective}
      live={!isPreview && draft === null}
      modeOverride={override === undefined ? null : override}
      replayNonce={replayNonce}
    />
  );
}
