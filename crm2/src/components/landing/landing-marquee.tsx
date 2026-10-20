"use client";

interface MarqueeProps {
  items: string[];
  reverse?: boolean;
  speed?: string;
  className?: string;
}

export function LandingMarquee({
  items,
  reverse = false,
  speed = "30s",
  className = "",
}: MarqueeProps) {
  const content = items.join(" \u2022 ");
  const animClass = reverse ? "landing-marquee-reverse" : "landing-marquee";

  return (
    <div
      className={`overflow-hidden whitespace-nowrap ${className}`}
      aria-hidden="true"
    >
      <div
        className={`inline-flex gap-0 ${animClass}`}
        style={{ animationDuration: speed }}
      >
        <span className="inline-block pr-0 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground/40">
          {content} &bull; {content}
        </span>
        <span className="inline-block pr-0 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground/40">
          {content} &bull; {content}
        </span>
      </div>
    </div>
  );
}
