"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Button,
  Card,
  ColorArea,
  ColorField,
  Input,
  NumberField,
  Slider,
  Switch,
  Tabs,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import {
  COUNTDOWN_FONTS,
  MOTTO_ANIMATIONS,
  QUOTE_MAX_COUNT,
  TEXT_LIMITS,
  validateConfigInput,
  type AppConfig,
  type CountdownConfig,
  type DisplayMode,
  type MottoAnimation,
  type MottoConfig,
  type TextAlign,
  type ThemeConfig,
} from "@/lib/config";
import { parseLocal } from "@/lib/time";

type SectionId = "mode" | "countdown" | "motto" | "theme";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "mode", label: "展示模式" },
  { id: "countdown", label: "倒计时" },
  { id: "motto", label: "格言" },
  { id: "theme", label: "主题" },
];

const MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: "countdown", label: "倒计时" },
  { value: "motto", label: "格言" },
  { value: "auto", label: "自动轮播" },
];

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: "left", label: "左对齐" },
  { value: "center", label: "居中" },
  { value: "right", label: "右对齐" },
];

const serialize = (value: unknown) => JSON.stringify(value);

interface AdminConsoleProps {
  initialConfig: AppConfig;
}

interface ToastState {
  text: string;
  tone: "ok" | "error";
}

export function AdminConsole({ initialConfig }: AdminConsoleProps) {
  const [saved, setSaved] = useState<AppConfig>(initialConfig);
  const [draft, setDraft] = useState<AppConfig>(initialConfig);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [quotesText, setQuotesText] = useState(initialConfig.motto.quotes.join("\n"));
  const [saving, setSaving] = useState(false);
  // 首帧留空，挂载后再格式化，避免服务端 / 浏览器时区不同导致 hydration 不一致
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [scale, setScale] = useState(0.32);
  const [activeSection, setActiveSection] = useState<SectionId>("mode");
  const [headerHeight, setHeaderHeight] = useState(57);

  const headerRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLIFrameElement | null>(null);
  const alertRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<number | null>(null);
  const savingRef = useRef(false);

  const baseline = useMemo(() => serialize(saved), [saved]);
  const dirty = useMemo(() => serialize(draft) !== baseline, [draft, baseline]);

  const sectionDirty = useMemo(
    () => ({
      mode:
        draft.mode !== saved.mode ||
        draft.autoSeconds !== saved.autoSeconds ||
        draft.autoAlign !== saved.autoAlign ||
        draft.autoLeadSeconds !== saved.autoLeadSeconds ||
        draft.autoHoldSeconds !== saved.autoHoldSeconds,
      countdown: serialize(draft.countdown) !== serialize(saved.countdown),
      motto: serialize(draft.motto) !== serialize(saved.motto),
      theme: serialize(draft.theme) !== serialize(saved.theme),
    }),
    [draft, saved],
  );

  const issues = useMemo(() => {
    const errors = validateConfigInput(draft);
    const warnings: { field: "startAt" | "targetAt"; message: string }[] = [];
    const target = parseLocal(draft.countdown.targetAt);

    if (!target) {
      warnings.push({
        field: "targetAt",
        message: "还没有设置结束时间，大屏会显示「未设置时间」。",
      });
    }

    return { errors, warnings };
  }, [draft]);

  const showToast = useCallback((text: string, tone: ToastState["tone"]) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ text, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    document.title = (dirty ? "● " : "") + "Hackathon Live · 控制台";
  }, [dirty]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () => setHeaderHeight(Math.ceil(header.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById("section-" + s.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.id.replace("section-", "") as SectionId;
          setActiveSection(id);
        }
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0.05 },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const update = () => setScale(element.clientWidth / 1600);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pushDraft = useCallback(() => {
    previewRef.current?.contentWindow?.postMessage(
      { type: "hackathon:preview-config", config: draft },
      window.location.origin,
    );
  }, [draft]);

  useEffect(() => {
    pushDraft();
  }, [pushDraft]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string } | null;
      if (data?.type === "hackathon:preview-ready") pushDraft();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushDraft]);

  const save = useCallback(async () => {
    // 没有改动、或上一次保存还没回来时直接忽略（Ctrl+S 会频繁触发）
    if (!dirty || savingRef.current) return;
    if (issues.errors.length > 0) {
      setError("配置校验失败，请先修正再发布。");
      showToast("配置校验失败，请先修正再发布", "error");
      alertRef.current?.focus();
      return;
    }

    const submittedDraft = draft;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submittedDraft),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(problem?.error ?? "保存失败（HTTP " + response.status + "）");
      }
      const next = (await response.json()) as AppConfig;
      const preserveCurrentDraft = draftRef.current !== submittedDraft;
      setSaved(next);
      if (!preserveCurrentDraft) {
        setDraft(next);
        setQuotesText(next.motto.quotes.join("\n"));
      }
      showToast(preserveCurrentDraft ? "已保存；保存期间的新编辑已保留" : "已保存", "ok");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "保存失败";
      setError(message);
      showToast(message, "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [draft, dirty, issues.errors.length, showToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const reset = () => {
    setDraft(saved);
    setQuotesText(saved.motto.quotes.join("\n"));
    setPreviewKey((value) => value + 1);
    setError(null);
    showToast("已撤销未发布的更改", "ok");
  };

  const revertSection = (id: SectionId) => {
    setDraft((prev) => {
      if (id === "mode") {
        return {
          ...prev,
          mode: saved.mode,
          autoSeconds: saved.autoSeconds,
          autoAlign: saved.autoAlign,
          autoLeadSeconds: saved.autoLeadSeconds,
          autoHoldSeconds: saved.autoHoldSeconds,
        };
      }
      if (id === "countdown") return { ...prev, countdown: saved.countdown };
      if (id === "motto") return { ...prev, motto: saved.motto };
      return { ...prev, theme: saved.theme };
    });
    if (id === "motto") setQuotesText(saved.motto.quotes.join("\n"));
    setPreviewKey((value) => value + 1);
  };

  const gotoSection = (id: SectionId) => {
    setActiveSection(id);
    const element = document.getElementById("section-" + id);
    if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const setMode = (mode: DisplayMode) => setDraft((prev) => ({ ...prev, mode }));

  const patchCountdown = <K extends keyof CountdownConfig>(key: K, value: CountdownConfig[K]) =>
    setDraft((prev) => ({ ...prev, countdown: { ...prev.countdown, [key]: value } }));

  const patchMotto = <K extends keyof MottoConfig>(key: K, value: MottoConfig[K]) =>
    setDraft((prev) => ({ ...prev, motto: { ...prev.motto, [key]: value } }));

  const patchTheme = <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) =>
    setDraft((prev) => ({ ...prev, theme: { ...prev.theme, [key]: value } }));

  const onQuotesChange = (value: string) => {
    setQuotesText(value);
    const list = value
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    patchMotto("quotes", list.length > 0 ? list : [""]);
  };

  const replay = () => setPreviewKey((value) => value + 1);

  const modeHint =
    draft.mode === "auto"
      ? draft.autoAlign
        ? "按剩余时间整点切换：距离整点（如剩余 3 小时）还有 " +
          draft.autoLeadSeconds +
          " 秒时切到倒计时，跨过整点后再停留 " +
          draft.autoHoldSeconds +
          " 秒回到格言，其余时间只显示格言。"
        : "两种形式每 " + draft.autoSeconds + " 秒自动交替，适合长时间无人值守的大屏。"
      : draft.mode === "countdown"
        ? "整屏固定显示倒计时，适合开场与冲刺阶段。"
        : "整屏固定显示格言，适合暖场与休息时间。";

  const targetWarning = issues.warnings.find((issue) => issue.field === "targetAt");
  const fieldError = (field: string) => issues.errors.find((issue) => issue.field === field)?.message;
  const blocked = issues.errors.length > 0;

  const adminTheme = {
    "--accent": draft.theme.accent,
    "--accent-2": draft.theme.accent2,
    "--admin-header-h": `${headerHeight}px`,
  } as CSSProperties;

  return (
    <div className="admin-bg min-h-svh" style={adminTheme}>
      <header
        ref={headerRef}
        className="admin-head sticky top-0 z-40 border-b border-white/10 bg-[#06070c]/85 backdrop-blur-xl"
      >
        <div className="admin-head-inner">
          <div className="flex min-w-0 items-center gap-3">
            <span className="live-dot" />
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold tracking-tight">Hackathon Live · 控制台</div>
            </div>
            {dirty ? (
              <span className="status-pill" data-tone="warn">
                <span className="dirty-dot" />
                未发布
              </span>
            ) : (
              <span className="status-pill" data-tone="ok">
                已同步
              </span>
            )}
          </div>

          <nav className="section-nav" aria-label="配置分区导航">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className="section-nav-item"
                data-active={activeSection === section.id ? "true" : undefined}
                onClick={() => gotoSection(section.id)}
              >
                {sectionDirty[section.id] ? <span className="nav-dirty-dot" aria-hidden="true" /> : null}
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {error ? <span className="text-xs text-rose-400">{error}</span> : null}
            <Button variant="outline" size="sm" isDisabled={!dirty || saving} onPress={reset}>
              撤销
            </Button>
            <Button variant="secondary" size="sm" onPress={() => window.open("/", "_blank", "noopener")}>
              打开大屏
            </Button>
            <Button
              variant="primary"
              size="sm"
              isDisabled={!dirty || saving || blocked}
              onPress={() => void save()}
            >
              {saving ? "保存中…" : dirty ? "保存并发布" : "已是最新"}
            </Button>
          </div>
        </div>
      </header>

      <div className="admin-shell">
        <main className="vstack">
          {issues.errors.length > 0 ? (
            <div className="error-summary" role="alert" tabIndex={-1} ref={alertRef}>
              <div className="error-summary-title">有 {issues.errors.length} 处设置需要先修正</div>
              <ul>
                {issues.errors.map((issue, index) => (
                  <li key={`${issue.field}-${index}`}>
                    <button
                      type="button"
                      className="error-link"
                      onClick={() => gotoSection(issue.field.startsWith("motto.") ? "motto" : "countdown")}
                    >
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Section
            id="mode"
            title="展示模式"
            sub="DISPLAY MODE"
            dirty={sectionDirty.mode}
            onRevert={() => revertSection("mode")}
          >
            <div className="vstack">
              <div className="flex flex-wrap items-center gap-4">
                <Segmented value={draft.mode} options={MODE_OPTIONS} onChange={setMode} />
              </div>

              {draft.mode === "auto" ? (
                <div className="group">
                  <div className="group-title">轮播规则</div>
                  <div className="grid-2">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/2 px-3 py-2">
                      <div>
                        <div className="toggle-label">整点对齐</div>
                        <div className="hint mt-1">按剩余时间逼近整点时切入倒计时</div>
                      </div>
                      <Switch
                        isSelected={draft.autoAlign}
                        onChange={(value) => setDraft((prev) => ({ ...prev, autoAlign: value }))}
                        aria-label="整点对齐"
                      >
                        <Switch.Content>
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                        </Switch.Content>
                      </Switch>
                    </div>

                    {draft.autoAlign ? (
                      <div className="grid-2">
                        <Field label="提前切入">
                          <div className="inline-field">
                            <NumberInput
                              label="提前秒数"
                              min={0}
                              max={600}
                              value={draft.autoLeadSeconds}
                              onChange={(next) => setDraft((prev) => ({ ...prev, autoLeadSeconds: next }))}
                            />
                            <span className="unit">秒</span>
                          </div>
                        </Field>
                        <Field label="跨点保持">
                          <div className="inline-field">
                            <NumberInput
                              label="保持秒数"
                              min={0}
                              max={600}
                              value={draft.autoHoldSeconds}
                              onChange={(next) => setDraft((prev) => ({ ...prev, autoHoldSeconds: next }))}
                            />
                            <span className="unit">秒</span>
                          </div>
                        </Field>
                      </div>
                    ) : (
                      <Field label="每屏停留">
                        <div className="inline-field">
                          <NumberInput
                            label="每屏停留秒数"
                            min={5}
                            max={600}
                            value={draft.autoSeconds}
                            onChange={(next) => setDraft((prev) => ({ ...prev, autoSeconds: next }))}
                          />
                          <span className="unit">秒</span>
                        </div>
                      </Field>
                    )}
                  </div>
                </div>
              ) : null}

              <p className="hint hint-block">{modeHint}</p>
            </div>
          </Section>

          <Section
            id="countdown"
            title="倒计时"
            sub="COUNTDOWN"
            dirty={sectionDirty.countdown}
            onRevert={() => revertSection("countdown")}
          >
            <div className="vstack">
              <div className="group">
                <div className="group-title">时间</div>
                <Field label="结束时间" warning={targetWarning?.message}>
                  <Input
                    className="field"
                    type="datetime-local"
                    value={draft.countdown.targetAt}
                    onChange={(event) => patchCountdown("targetAt", event.target.value)}
                  />
                </Field>
              </div>

              <div className="group">
                <div className="group-title">外观</div>
                <Field label="数字字体" hint="D-DIN 通过 jsDelivr 加载；JetBrains Mono 是之前使用的本地字体。">
                  <Segmented
                    value={draft.countdown.font}
                    options={COUNTDOWN_FONTS}
                    onChange={(font) => patchCountdown("font", font)}
                  />
                </Field>
              </div>

              <div className="group">
                <div className="group-title">文案</div>
                <div className="grid-2">
                  <Field
                    label="主标题"
                    count={draft.countdown.title.length + "/" + TEXT_LIMITS.title}
                    error={fieldError("countdown.title")}
                  >
                    <Input
                      className="field"
                      value={draft.countdown.title}
                      placeholder="HACKATHON 2026"
                      onChange={(event) => patchCountdown("title", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="副标题"
                    count={draft.countdown.subtitle.length + "/" + TEXT_LIMITS.subtitle}
                    error={fieldError("countdown.subtitle")}
                  >
                    <Input
                      className="field"
                      value={draft.countdown.subtitle}
                      placeholder="48 小时，从零到一"
                      onChange={(event) => patchCountdown("subtitle", event.target.value)}
                    />
                  </Field>
                </div>
                <Field
                  label="倒计时结束文案"
                  count={draft.countdown.finishedText.length + "/" + TEXT_LIMITS.finishedText}
                  error={fieldError("countdown.finishedText")}
                >
                  <Input
                    className="field"
                    value={draft.countdown.finishedText}
                    onChange={(event) => patchCountdown("finishedText", event.target.value)}
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section
            id="motto"
            title="格言"
            sub="MOTTO"
            dirty={sectionDirty.motto}
            onRevert={() => revertSection("motto")}
          >
            <div className="vstack">
              <div className="group">
                <div className="group-title">内容</div>
                <Field
                  label="格言内容"
                  hint={"每行一句，按顺序轮换；每句不超过 400 字，最多 " + QUOTE_MAX_COUNT + " 句"}
                  count={draft.motto.quotes.length + " 句"}
                  error={fieldError("motto.quotes")}
                >
                  <TextArea
                    className="field"
                    value={quotesText}
                    placeholder={"Stay hungry, stay foolish.\n把不可能，拆成一个个待办。"}
                    onChange={(event) => onQuotesChange(event.target.value)}
                  />
                </Field>
              </div>

              <div className="group">
                <div className="group-title">排版</div>
                <div className="grid-2">
                  <Field label="对齐">
                    <Segmented
                      value={draft.motto.align}
                      options={ALIGN_OPTIONS}
                      onChange={(align) => patchMotto("align", align)}
                    />
                  </Field>

                  <div className="vstack">
                    <div>
                      <span className="label">字号</span>
                      <Slider
                        value={draft.motto.fontSize}
                        minValue={24}
                        maxValue={160}
                        step={2}
                        onChange={(value) =>
                          patchMotto("fontSize", Array.isArray(value) ? value[0] : value)
                        }
                      >
                        <Slider.Output />
                        <Slider.Track>
                          <Slider.Fill />
                          <Slider.Thumb />
                        </Slider.Track>
                      </Slider>
                      <p className="hint mt-1">以 1920×1080 为基准，实际按屏幕等比缩放。</p>
                    </div>
                    <div className="grid-2">
                      <Field label="轮换间隔" hint="0 = 不轮换">
                        <div className="inline-field">
                          <NumberInput
                            label="轮换间隔秒数"
                            min={0}
                            max={600}
                            value={draft.motto.rotateSeconds}
                            onChange={(next) => patchMotto("rotateSeconds", next)}
                          />
                          <span className="unit">秒</span>
                        </div>
                      </Field>
                      <Field
                        label="署名（可选）"
                        count={draft.motto.author.length + "/" + TEXT_LIMITS.author}
                        error={fieldError("motto.author")}
                      >
                        <Input
                          className="field"
                          value={draft.motto.author}
                          onChange={(event) => patchMotto("author", event.target.value)}
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              </div>

              <div className="group">
                <div className="flex items-center justify-between gap-3">
                  <div className="group-title mb-0">切入动画</div>
                  <Button size="sm" variant="outline" onPress={replay}>
                    重播动画
                  </Button>
                </div>
                <ToggleButtonGroup
                  className="anim-grid mt-2"
                  aria-label="切入动画"
                  selectionMode="single"
                  selectedKeys={[draft.motto.animation]}
                  disallowEmptySelection
                  onSelectionChange={(keys) => {
                    const next = Array.from(keys as Set<string>)[0];
                    if (typeof next === "string") {
                      patchMotto("animation", next as MottoAnimation);
                      replay();
                    }
                  }}
                >
                  {MOTTO_ANIMATIONS.map((animation) => (
                    <ToggleButton key={animation.value} id={animation.value} className="chip">
                      {animation.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </div>
            </div>
          </Section>

          <Section
            id="theme"
            title="主题"
            sub="THEME"
            dirty={sectionDirty.theme}
            onRevert={() => revertSection("theme")}
          >
            <div className="vstack">
              <div className="group">
                <div className="group-title">配色</div>
                <div className="grid-2">
                  <ColorInput
                    label="主色"
                    value={draft.theme.accent}
                    onChange={(next) => patchTheme("accent", next)}
                  />
                  <ColorInput
                    label="辅色"
                    value={draft.theme.accent2}
                    onChange={(next) => patchTheme("accent2", next)}
                  />
                </div>
              </div>

              <div className="group">
                <div className="group-title">质感</div>
                <ToggleRow
                  label="网格背景"
                  description="下层的技术感网格"
                  checked={draft.theme.showGrid}
                  onChange={(value) => patchTheme("showGrid", value)}
                />
                <ToggleRow
                  label="氛围光晕"
                  description="缓慢漂移的双色光斑"
                  checked={draft.theme.glow}
                  onChange={(value) => patchTheme("glow", value)}
                />
                <ToggleRow
                  label="扫描线质感"
                  description="CRT 细扫描纹，投影时更明显"
                  checked={draft.theme.scanlines}
                  onChange={(value) => patchTheme("scanlines", value)}
                />
              </div>
            </div>
          </Section>

        </main>

        <aside className="admin-aside">
          <div className="admin-aside-sticky">
          <Card.Root className="panel panel-pad panel-card">
            <Card.Header className="section-head">
              <div className="section-head-main">
                <div>
                  <Card.Title className="section-title">实时预览</Card.Title>
                  <Card.Description className="section-sub">LIVE PREVIEW · 16:9</Card.Description>
                </div>
              </div>
              <div className="section-head-actions">
                <span className="preview-live">跟随草稿</span>
                <Button size="sm" variant="outline" onPress={replay}>
                  重播
                </Button>
              </div>
            </Card.Header>
            <Card.Content className="panel-content">
              <div ref={frameRef} className="preview-frame">
                <iframe
                  key={previewKey}
                  ref={previewRef}
                  title="大屏实时预览"
                  src="/?preview=1"
                  className="preview-inner"
                  style={{ transform: "scale(" + scale + ")" }}
                  onLoad={pushDraft}
                />
              </div>
            </Card.Content>
          </Card.Root>

          <section className="panel panel-pad">
            <div className="section-head">
              <div className="section-title">快捷键</div>
              <div className="section-sub">SHORTCUTS</div>
            </div>
            <ul className="vstack gap-2 text-[12.5px] text-white/60">
              <li>
                <kbd className="kbd">Ctrl / ⌘ + S</kbd> 保存并发布
              </li>
              <li>
                <kbd className="kbd">1 / 2 / 3</kbd> 大屏临时切换倒计时 / 格言 / 自动
              </li>
              <li>
                <kbd className="kbd">0 / Esc</kbd> 恢复后台设定
              </li>
            </ul>
          </section>
          </div>
        </aside>
      </div>

      <div className="toast-region" role="status" aria-live="polite">
        {toast ? (
          <div className="app-toast" data-tone={toast.tone}>
            {toast.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberField.Root
      aria-label={label}
      className="num-field"
      value={value}
      minValue={min}
      maxValue={max}
      onChange={(next) => {
        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
      }}
    >
      <NumberField.Group>
        <NumberField.DecrementButton aria-label="减少">−</NumberField.DecrementButton>
        <NumberField.Input />
        <NumberField.IncrementButton aria-label="增加">+</NumberField.IncrementButton>
      </NumberField.Group>
    </NumberField.Root>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const commit = (color: { toString: (format: "hex") => string } | null) => {
    if (!color) return;
    const hex = color.toString("hex");
    onChange((hex.startsWith("#") ? hex : "#" + hex).toLowerCase());
  };

  return (
    <div className="color-block">
      <div className="color-head">
        <span className="label mb-0">{label}</span>
        <span className="color-hex">{value}</span>
      </div>
      <ColorArea.Root
        aria-label={label}
        colorSpace="hsb"
        xChannel="saturation"
        yChannel="brightness"
        value={value}
        onChange={commit}
        className="color-area"
      >
        <ColorArea.Thumb className="color-area-thumb" />
      </ColorArea.Root>
      <ColorField.Root
        aria-label={label + " 十六进制"}
        value={value}
        onChange={commit}
        className="color-field"
      >
        <ColorField.Input className="input field" />
      </ColorField.Root>
    </div>
  );
}

function Section({
  id,
  title,
  sub,
  dirty,
  onRevert,
  children,
}: {
  id: SectionId;
  title: string;
  sub?: string;
  dirty: boolean;
  onRevert: () => void;
  children: ReactNode;
}) {
  return (
    <Card.Root id={"section-" + id} className="panel panel-pad panel-card section-anchor">
      <Card.Header className="section-head">
        <div className="section-head-main">
          <div className="min-w-0">
            <Card.Title className="section-title">{title}</Card.Title>
            {sub ? <Card.Description className="section-sub">{sub}</Card.Description> : null}
          </div>
        </div>
        <div className="section-head-actions">
          {dirty ? (
            <Button size="sm" variant="outline" onPress={onRevert}>
              还原本节
            </Button>
          ) : null}
        </div>
      </Card.Header>
      <Card.Content className="panel-content">{children}</Card.Content>
    </Card.Root>
  );
}

function Field({
  label,
  hint,
  count,
  error,
  warning,
  children,
}: {
  label: string;
  hint?: string;
  count?: string;
  error?: string;
  warning?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field-group" role="group" aria-labelledby={id}>
      <div className="label-row">
        <span className="label mb-0" id={id}>
          {label}
        </span>
        {count ? <span className="count">{count}</span> : null}
      </div>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
      {!error && warning ? <span className="field-warn">{warning}</span> : null}
      {!error && !warning && hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Tabs
      className="seg-tabs"
      selectedKey={value}
      onSelectionChange={(key) => onChange(key as T)}
      aria-label="分段选择"
    >
      <Tabs.ListContainer>
        <Tabs.List className="seg-group">
          {options.map((option) => (
            <Tabs.Tab key={option.value} id={option.value} className="seg-chip">
              {option.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      {/* Tabs 需要 Panel 才符合语义；这里只当分段控制器用，面板占位不渲染内容 */}
      {options.map((option) => (
        <Tabs.Panel key={option.value} id={option.value} className="hidden">
          <></>
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <div className="min-w-0">
        <div className="toggle-label">{label}</div>
        {description ? <div className="hint mt-1">{description}</div> : null}
      </div>
      <Switch isSelected={checked} onChange={onChange} aria-label={label}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
    </div>
  );
}
