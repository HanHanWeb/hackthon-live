"use client";

import { useMemo } from "react";
import type { MottoConfig } from "@/lib/config";

interface MottoViewProps {
  config: MottoConfig;
  now: number;
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

export function MottoView({ config, now }: MottoViewProps) {
  const quotes = config.quotes.length > 0 ? config.quotes : [""];
  const index =
    config.rotateSeconds > 0 ? Math.floor(now / (config.rotateSeconds * 1000)) % quotes.length : 0;
  const quote = quotes[index];

  const isFromBottom = config.animation === "from-bottom";
  const tokens = useMemo(() => (isFromBottom ? tokenize(quote) : []), [isFromBottom, quote]);

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
  const replayKey = index + "-" + quote;

  return (
    <div className={"motto-layer pos-" + config.position}>
      <div key={replayKey} className={innerClass} style={style}>
        <span className="motto-mark">“</span>
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
