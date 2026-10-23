'use client';
import { useEffect, useRef } from 'react';

export function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot  = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    // Start off-screen
    let mx = -200, my = -200;
    let rx = -200, ry = -200;
    let raf: number;
    let visible = false;

    // Move dot instantly, ring follows with lerp
    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!visible) {
        rx = mx; ry = my;
        dot.style.opacity  = '1';
        ring.style.opacity = '1';
        visible = true;
      }
      dot.style.transform = `translate(${mx}px,${my}px)`;
    };

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const tick = () => {
      rx = lerp(rx, mx, 0.13);
      ry = lerp(ry, my, 0.13);
      ring.style.transform = `translate(${rx}px,${ry}px)`;
      raf = requestAnimationFrame(tick);
    };

    // Hover effect — use event delegation on document so it works inside modals
    const onOver = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (t.closest('a,button,[role="button"],input,textarea,select,label,[tabindex]')) {
        dot.classList.add('cursor-hover');
        ring.classList.add('cursor-hover');
      } else {
        dot.classList.remove('cursor-hover');
        ring.classList.remove('cursor-hover');
      }
    };

    const onLeave = () => {
      dot.style.opacity  = '0';
      ring.style.opacity = '0';
      visible = false;
    };

    const onEnter = () => {
      dot.style.opacity  = '1';
      ring.style.opacity = '1';
      visible = true;
    };

    // Use document-level listeners — works everywhere including modals
    document.addEventListener('mousemove',  onMove,  { passive: true });
    document.addEventListener('mouseover',  onOver,  { passive: true });
    document.addEventListener('mouseleave', onLeave, { passive: true });
    document.addEventListener('mouseenter', onEnter, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener('mousemove',  onMove);
      document.removeEventListener('mouseover',  onOver);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        className="crm-cursor-dot"
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: 10, height: 10,
          borderRadius: '50%',
          background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
          boxShadow: '0 0 12px rgba(79,109,245,0.70)',
          pointerEvents: 'none',
          zIndex: 2147483647,
          willChange: 'transform',
          opacity: 0,
          transition: 'width 180ms,height 180ms,background 180ms,opacity 200ms',
          marginLeft: -5, marginTop: -5,
        }}
      />
      <div
        ref={ringRef}
        className="crm-cursor-ring"
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: 36, height: 36,
          borderRadius: '50%',
          border: '1.5px solid rgba(79,109,245,0.45)',
          background: 'rgba(79,109,245,0.06)',
          pointerEvents: 'none',
          zIndex: 2147483646,
          willChange: 'transform',
          opacity: 0,
          transition: 'width 180ms,height 180ms,border-color 180ms,opacity 200ms',
          marginLeft: -18, marginTop: -18,
        }}
      />
    </>
  );
}
