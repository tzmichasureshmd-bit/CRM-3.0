"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#product", label: "Product" },
  { href: "#leads", label: "Leads" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="left-0 right-0 top-0 z-50 transition-all duration-500"
      style={{
        position: scrolled ? "fixed" : "absolute",
        background: scrolled ? "rgba(var(--background-rgb, 4,6,14), 0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.08)" : "none",
        boxShadow: scrolled ? "0 2px 24px rgba(0,0,0,0.3)" : "none",
      }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">

        {/* Logo: image + text. Image fades in on scroll */}
        <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight">
          <div
            className="flex items-center justify-center overflow-hidden transition-all duration-500 ease-in-out"
            style={{ width: scrolled ? 48 : 0, opacity: scrolled ? 1 : 0 }}
          >
            <Image src="/images/logo.png" alt="TZMICHA Logo" width={48} height={48} className="rounded-lg object-contain shrink-0" />
          </div>
          <span
            className="text-base transition-colors duration-300"
            style={{ color: scrolled ? "var(--foreground)" : "#fff" }}
          >
            TZMICHA
          </span>
        </Link>

        {/* Nav links: hidden at top (over video), fade in on scroll */}
        <nav
          className="hidden items-center gap-1 md:flex transition-all duration-500"
          style={{ opacity: scrolled ? 1 : 0, pointerEvents: scrolled ? "auto" : "none" }}
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Buttons: always visible */}
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login">
            <Button variant="ghost" size="sm" style={{ color: scrolled ? undefined : "rgba(255,255,255,0.9)" }}>
              Sign In
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm" style={{ background: "linear-gradient(135deg,#10b981,#047857)", color: "#fff", border: "none" }}>
              Start Free
              <ArrowRight className="size-3.5" />
            </Button>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-muted hover:text-foreground md:hidden"
          style={{ color: scrolled ? undefined : "rgba(255,255,255,0.85)" }}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/40 bg-background/95 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-1 px-4 py-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border/40 pt-3">
              <Link href="/login" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full">Login</Button>
              </Link>
              <Link href="/signup" onClick={() => setMobileOpen(false)}>
                <Button className="w-full">
                  Get Started
                  <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
