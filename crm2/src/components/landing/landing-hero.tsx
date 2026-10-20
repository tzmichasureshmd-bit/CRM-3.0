"use client";

import Link from "next/link";
import { ArrowRight, Volume2, VolumeX } from "lucide-react";
import { useRef, useEffect, useState } from "react";

const socials = [
  { label: "X", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
  { label: "LinkedIn", path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.554V9h3.565v11.452z" },
  { label: "Instagram", path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM12 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" },
];

export function LandingHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [soundOn, setSoundOn] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => {});
    return () => { v.pause(); v.src = ""; v.load(); };
  }, []);

  function enableSound() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setSoundOn(!v.muted);
  }

  return (
    <section style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>

      <div style={{ position: "absolute", inset: 0, background: "#060810", zIndex: 0 }} />

      <video
        ref={videoRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 1 }}
        src="/Man_sleeping_and_automated_deals_20260924142125.mp4"
        autoPlay muted loop playsInline
      />

      <div style={{ position: "absolute", inset: 0, background: "rgba(4,6,14,0.52)", zIndex: 2 }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 3, background: "linear-gradient(to top, rgba(4,6,14,0.97) 0%, rgba(4,6,14,0.80) 28%, rgba(4,6,14,0.25) 55%, transparent 100%)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 3, background: "linear-gradient(to right, rgba(4,6,14,0.72) 0%, rgba(4,6,14,0.35) 45%, transparent 75%)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 3, background: "linear-gradient(to bottom, rgba(4,6,14,0.45) 0%, transparent 18%)" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, width: "700px", height: "500px", background: "radial-gradient(ellipse at 20% 100%, rgba(16,185,129,0.12) 0%, transparent 65%)", zIndex: 3, pointerEvents: "none" }} />

      {/* Hero content */}
      <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: "108px", paddingLeft: "64px", paddingRight: "40%" }}>

        <div className="aurora-badge" style={{ display: "inline-flex", alignItems: "center", gap: "10px", borderRadius: "999px", padding: "6px 16px 6px 6px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", width: "fit-content", marginBottom: "22px" }}>
          <div style={{ display: "flex" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: "22px", height: "22px", borderRadius: "999px", background: "linear-gradient(135deg, #10b981, #047857)", border: "2px solid rgba(4,6,14,0.9)", marginLeft: i === 0 ? 0 : "-8px" }} />
            ))}
          </div>
          <span style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.82)", fontFamily: "'Inter', sans-serif", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            Trusted by <strong style={{ color: "#fff", fontWeight: 700 }}>growing businesses</strong>
          </span>
        </div>

        <h1 className="aurora-h1" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "clamp(2.8rem, 5.2vw, 4.6rem)", lineHeight: 1.05, letterSpacing: "-0.03em", color: "#fff", maxWidth: "600px", marginBottom: "20px", textShadow: "0 2px 20px rgba(0,0,0,0.9), 0 4px 40px rgba(0,0,0,0.7)" }}>
          Turn Conversations<br />
          Into{" "}
          <span style={{ background: "linear-gradient(135deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 0 20px rgba(16,185,129,0.4))" }}>
            Customers
          </span>
        </h1>

        <p className="aurora-sub" style={{ fontSize: "16px", lineHeight: 1.7, color: "rgba(255,255,255,0.78)", fontFamily: "'Inter', sans-serif", maxWidth: "380px", marginBottom: "32px", textShadow: "0 1px 8px rgba(0,0,0,0.9), 0 2px 20px rgba(0,0,0,0.7)", fontWeight: 400 }}>
          Manage WhatsApp conversations, leads, campaigns and automation from one powerful CRM.
        </p>

        {/* CTA — Get Started + Login only */}
        <div className="aurora-cta" style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <Link href="/signup" style={{ padding: "15px 30px", borderRadius: "999px", background: "#fff", color: "#0a0f1a", fontSize: "14px", fontWeight: 700, fontFamily: "'Inter', sans-serif", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
            Get Started <ArrowRight size={14} />
          </Link>
          <Link href="/login" style={{ padding: "15px 28px", borderRadius: "999px", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: "14px", fontWeight: 600, fontFamily: "'Inter', sans-serif", textDecoration: "none", border: "1px solid rgba(255,255,255,0.28)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
            Login
          </Link>
        </div>
      </div>

      {/* Social icons */}
      <div className="aurora-social" style={{ position: "absolute", bottom: "36px", left: "64px", zIndex: 10, display: "flex", gap: "10px" }}>
        {socials.map((s) => (
          <a key={s.label} href="#" aria-label={s.label} style={{ width: "36px", height: "36px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.06)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d={s.path} /></svg>
          </a>
        ))}
      </div>

      {/* Sound toggle */}
      <button
        onClick={enableSound}
        aria-label={soundOn ? "Mute video" : "Unmute video"}
        style={{ position: "absolute", bottom: "36px", right: "52px", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <div style={{ width: "42px", height: "42px", borderRadius: "999px", border: `1px solid ${soundOn ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.25)"}`, background: soundOn ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.08)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", color: soundOn ? "#10b981" : "rgba(255,255,255,0.6)", transition: "all 0.25s ease" }}>
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </div>
        <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.15em", color: soundOn ? "rgba(16,185,129,0.8)" : "rgba(255,255,255,0.4)", textTransform: "uppercase", fontFamily: "'Inter', sans-serif", transition: "color 0.25s ease" }}>
          {soundOn ? "Mute" : "Sound"}
        </span>
      </button>

    </section>
  );
}
