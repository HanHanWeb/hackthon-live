"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { MottoConfig } from "@/lib/config";

interface MottoViewProps {
  config: MottoConfig;
  /** 离场过渡期间暂停定时轮换 */
  paused?: boolean;
  /** 跨挂载记录上一句文案，确保每次切入格言都随机选到新的句子 */
  lastQuoteRef?: RefObject<string | null>;
}

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
const CJK_PUNCT = /[\u3000-\u303f\uff01-\uff60\u2014\u2018\u2019\u201c\u201d\u2026\u00b7]/;

interface Token {
  text: string;
  space: boolean;
  delay: number;
}

/** 按「词」切分：拉丁词整体保留，中文逐字，标点贴住前一个词 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let buffer = "";
  let step = 0;

  const push = (value: string) => {
    tokens.push({ text: value, space: false, delay: Math.min(step++ * 58, 980) });
  };

  const flush = () => {
    if (buffer) {
      push(buffer);
      buffer = "";
    }
  };

  for (const char of Array.from(text)) {
    if (/\s/.test(char)) {
      flush();
      tokens.push({ text: " ", space: true, delay: 0 });
    } else if (CJK.test(char)) {
      flush();
      push(char);
    } else if (CJK_PUNCT.test(char)) {
      flush();
      const last = tokens[tokens.length - 1];
      if (last && !last.space) last.text += char;
      else push(char);
    } else {
      buffer += char;
    }
  }
  flush();
  return tokens;
}

/** 随机选一条不同于当前/上一句的格言索引；若所有文案都相同则退化为避开原索引 */
function pickRandomIndex(
  quotes: string[],
  excludeText: string | null,
  excludeIndex?: number | null,
): number {
  if (quotes.length <= 1) return 0;
  const distinctTextIndices: number[] = [];
  const otherIndices: number[] = [];
  for (let i = 0; i < quotes.length; i += 1) {
    if (i === excludeIndex) continue;
    otherIndices.push(i);
    if (quotes[i] !== excludeText) distinctTextIndices.push(i);
  }
  const candidates = distinctTextIndices.length > 0 ? distinctTextIndices : otherIndices;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
}

export function MottoView({ config, paused = false, lastQuoteRef }: MottoViewProps) {
  const quotes = config.quotes.length > 0 ? config.quotes : [""];
  const canRotate = config.rotateSeconds > 0 && quotes.length > 1;
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;
  const pickedIndexRef = useRef<number | null>(quotes.length <= 1 ? 0 : null);
  const [quoteIndex, setQuoteIndex] = useState<number | null>(() => (quotes.length <= 1 ? 0 : null));

  useEffect(() => {
    const list = quotesRef.current;
    if (pickedIndexRef.current === null) {
      pickedIndexRef.current = pickRandomIndex(list, lastQuoteRef?.current ?? null);
    }
    const idx = Math.min(pickedIndexRef.current, Math.max(0, list.length - 1));
    pickedIndexRef.current = idx;
    if (lastQuoteRef) lastQuoteRef.current = list[idx] ?? null;
    setQuoteIndex(idx);
  }, [lastQuoteRef]);

  useEffect(() => {
    if (!canRotate || paused) return;
    const timer = window.setInterval(() => {
      const list = quotesRef.current;
      const prevIdx = pickedIndexRef.current;
      const prevText = prevIdx !== null ? (list[prevIdx] ?? null) : (lastQuoteRef?.current ?? null);
      const nextIdx = pickRandomIndex(list, prevText, prevIdx);
      pickedIndexRef.current = nextIdx;
      if (lastQuoteRef) lastQuoteRef.current = list[nextIdx] ?? null;
      setQuoteIndex(nextIdx);
    }, config.rotateSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [canRotate, config.rotateSeconds, paused, lastQuoteRef]);

  const safeIndex = quoteIndex === null ? 0 : Math.min(quoteIndex, quotes.length - 1);
  const quote = quotes[safeIndex];

  const isFromBottom = config.animation === "from-bottom";
  const tokens = useMemo(() => (isFromBottom ? tokenize(quote) : []), [isFromBottom, quote]);

  useEffect(() => {
    if (quoteIndex !== null && lastQuoteRef) {
      lastQuoteRef.current = quote;
    }
  }, [quote, quoteIndex, lastQuoteRef]);

  if (quoteIndex === null) {
    return <div className={"motto-layer pos-" + config.position} aria-hidden="true" />;
  }

  const fontPx = config.fontSize;
  const style = {
    textAlign: config.align,
    fontSize:
      "clamp(" +
      Math.round(fontPx * 0.6) +
      "px, " +
      (fontPx / 19.2).toFixed(3) +
      "vw, " +
      Math.round(fontPx * 2.1) +
      "px)",
  };

  const innerClass = isFromBottom ? "motto-inner" : "motto-inner motto-anim-" + config.animation;
  const replayKey = safeIndex + "-" + quote;

  return (
    <div className={"motto-layer pos-" + config.position}>
      <div key={replayKey} className={innerClass} style={style}>
        {quote.trim().length > 0 ? <span className="motto-mark">“</span> : null}
        <p className="motto-quote" aria-label={quote}>
          {isFromBottom
            ? tokens.map((token, tokenIndex) =>
                token.space ? (
                  <span key={tokenIndex} className="motto-space">
                    {" "}
                  </span>
                ) : (
                  <span key={tokenIndex} className="word-mask">
                    <span className="word-rise" style={{ animationDelay: token.delay + "ms" }}>
                      {token.text}
                    </span>
                  </span>
                ),
              )
            : quote}
        </p>
        {config.author ? <p className="motto-author">— {config.author}</p> : null}
      </div>
    </div>
  );
}
