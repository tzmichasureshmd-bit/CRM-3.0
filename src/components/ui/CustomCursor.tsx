'use client';
import { useEffect, useRef } from 'react';

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let mx = -100, my = -100;
    let rx = -100, ry = -100;
    let raf: number;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px)`;
    };

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const animate = () => {
      rx = lerp(rx, mx, 0.12);
      ry = lerp(ry, my, 0.12);
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      raf = requestAnimationFrame(animate);
    };

    const onEnterLink = () => {
      dot.classList.add('cursor-hover');
      ring.classList.add('cursor-hover');
    };
    const onLeaveLink = () => {
      dot.classList.remove('cursor-hover');
      ring.classList.remove('cursor-hover');
    };

    document.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(animate);

    // attach to all interactive elements
    const attach = () => {
      document.querySelectorAll('a, button, [role="button"], input, textarea').forEach(el => {
        el.addEventListener('mouseenter', onEnterLink);
        el.addEventListener('mouseleave', onLeaveLink);
      });
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <div ref={dotRef} className="crm-cursor-dot" />
      <div ref={ringRef} className="crm-cursor-ring" />
    </>
  );
}
