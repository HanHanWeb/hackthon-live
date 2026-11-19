"use client";

import { Fragment, useMemo } from "react";
import { COUNTDOWN_LABELS, type CountdownConfig } from "@/lib/config";
import { diffDuration, digitsOf, formatStamp, parseLocal } from "@/lib/time";

interface CountdownViewProps {
  config: CountdownConfig;
  now: number;
}

export function CountdownView({ config, now }: CountdownViewProps) {
  const target = useMemo(() => parseLocal(config.targetAt), [config.targetAt]);

  if (!target) {
    return (
      <div className="cd-finished">
        <p className="cd-finished-title">未设置时间</p>
        <p className="cd-finished-zeros">请到后台设置倒计时目标时间</p>
      </div>
    );
  }

  const remaining = diffDuration(target.getTime(), now);
  const finished = remaining.totalMs <= 0;

  if (finished) {
    return (
      <div className="cd-finished">
        <p className="cd-finished-title">{config.finishedText}</p>
        <p className="cd-finished-zeros">00 00 00 00</p>
        <p className="cd-label">TARGET {formatStamp(target)}</p>
      </div>
    );
  }

  const units = [
    { key: "days", label: COUNTDOWN_LABELS.days, value: digitsOf(remaining.days, 2) },
    { key: "hours", label: COUNTDOWN_LABELS.hours, value: digitsOf(remaining.hours, 2) },
    { key: "minutes", label: COUNTDOWN_LABELS.minutes, value: digitsOf(remaining.minutes, 2) },
    { key: "seconds", label: COUNTDOWN_LABELS.seconds, value: digitsOf(remaining.seconds, 2) },
  ];

  return (
    <>
      <div className="cd-head">
        <p className="cd-eyebrow">COUNTDOWN</p>
        <h1 className="cd-title">{config.title}</h1>
        {config.subtitle ? <p className="cd-subtitle">{config.subtitle}</p> : null}
      </div>

      <div className="cd-row" role="timer" aria-live="off">
        {units.map((unit, index) => (
          <Fragment key={unit.key}>
            <div className="cd-unit">
              <div className="cd-num">
                {unit.value.split("").map((char, charIndex) => (
                  <span key={charIndex} className="digit-wrap">
                    <span key={char} className="digit">
                      {char}
                    </span>
                  </span>
                ))}
              </div>
              <span className="cd-label">{unit.label}</span>
            </div>
            {index < units.length - 1 ? (
              <div className="cd-sep">
                <i />
                <i />
              </div>
            ) : null}
          </Fragment>
        ))}
      </div>
    </>
  );
}
