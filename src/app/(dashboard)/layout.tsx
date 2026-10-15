'use client';

import { useState, useEffect } from 'react';
import { CRMSidebar } from '@/components/layout/CRMSidebar';
import { CRMTopbar } from '@/components/layout/CRMTopbar';
import { FloatingCopilot } from '@/components/chat/FloatingCopilot';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    if (!token) {
      window.location.replace('/login');
    } else {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (ready !== true) return (
    <div style={{ minHeight: '100vh', overflow: 'hidden', position: 'relative', background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;600&display=swap');
        .sp-h1{position:absolute;font-family:'Open Sans',sans-serif;font-weight:600;font-size:12px;text-transform:uppercase;left:50%;top:58%;transform:translateX(-50%);color:rgba(255,255,255,0.9);letter-spacing:3px;white-space:nowrap;margin:0}
        .sp-body{position:absolute;top:50%;left:50%;margin-left:-50px;animation:speeder .4s linear infinite}
        .sp-body>span{height:5px;width:35px;background:#fff;position:absolute;top:-19px;left:60px;border-radius:2px 10px 1px 0}
        .sp-body>span>span{width:30px;height:1px;background:rgba(255,255,255,0.8);position:absolute;animation:fazer1 .2s linear infinite}
        .sp-body>span>span:nth-child(2){top:3px;animation:fazer2 .4s linear infinite}
        .sp-body>span>span:nth-child(3){top:1px;animation:fazer3 .4s linear infinite;animation-delay:-1s}
        .sp-body>span>span:nth-child(4){top:4px;animation:fazer4 1s linear infinite;animation-delay:-1s}
        .sp-base>span{position:absolute;width:0;height:0;border-top:6px solid transparent;border-right:100px solid #fff;border-bottom:6px solid transparent}
        .sp-base>span:before{content:'';height:22px;width:22px;border-radius:50%;background:#fff;position:absolute;right:-110px;top:-16px}
        .sp-base>span:after{content:'';position:absolute;width:0;height:0;border-top:0 solid transparent;border-right:55px solid #fff;border-bottom:16px solid transparent;top:-16px;right:-98px}
        .sp-face{position:absolute;height:12px;width:20px;background:#fff;border-radius:20px 20px 0 0;transform:rotate(-40deg);right:-125px;top:-15px}
        .sp-face:after{content:'';height:12px;width:12px;background:#fff;right:4px;top:7px;position:absolute;transform:rotate(40deg);transform-origin:50% 50%;border-radius:0 0 0 2px}
        .sp-fazers{position:absolute;width:100%;height:100%;top:0;left:0;pointer-events:none}
        .sp-fazers span{position:absolute;height:2px;width:20%;background:rgba(255,255,255,0.18)}
        .sp-fazers span:nth-child(1){top:20%;animation:lf .6s linear infinite;animation-delay:-5s}
        .sp-fazers span:nth-child(2){top:40%;animation:lf2 .8s linear infinite;animation-delay:-1s}
        .sp-fazers span:nth-child(3){top:60%;animation:lf3 .6s linear infinite}
        .sp-fazers span:nth-child(4){top:80%;animation:lf4 .5s linear infinite;animation-delay:-3s}
        @keyframes speeder{0%{transform:translate(2px,1px) rotate(0deg)}10%{transform:translate(-1px,-3px) rotate(-1deg)}20%{transform:translate(-2px,0px) rotate(1deg)}30%{transform:translate(1px,2px) rotate(0deg)}40%{transform:translate(1px,-1px) rotate(1deg)}50%{transform:translate(-1px,3px) rotate(-1deg)}60%{transform:translate(-1px,1px) rotate(0deg)}70%{transform:translate(3px,1px) rotate(-1deg)}80%{transform:translate(-2px,-1px) rotate(1deg)}90%{transform:translate(2px,1px) rotate(0deg)}100%{transform:translate(1px,-2px) rotate(-1deg)}}
        @keyframes fazer1{0%{left:0}100%{left:-80px;opacity:0}}
        @keyframes fazer2{0%{left:0}100%{left:-100px;opacity:0}}
        @keyframes fazer3{0%{left:0}100%{left:-50px;opacity:0}}
        @keyframes fazer4{0%{left:0}100%{left:-150px;opacity:0}}
        @keyframes lf{0%{left:200%}100%{left:-200%;opacity:0}}
        @keyframes lf2{0%{left:200%}100%{left:-200%;opacity:0}}
        @keyframes lf3{0%{left:200%}100%{left:-100%;opacity:0}}
        @keyframes lf4{0%{left:200%}100%{left:-100%;opacity:0}}
      `}</style>
      <div className="sp-fazers"><span/><span/><span/><span/></div>
      <div className="sp-body">
        <span><span/><span/><span/><span/></span>
        <div className="sp-base"><span/><div className="sp-face"/></div>
      </div>
      <h1 className="sp-h1">TZMICHA CRM 3.0</h1>
    </div>
  );

  const toggle = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  return (
    <div className="crm-app">
      <div className="crm-shell">
        <div className="crm-sidebar-wrap">
          <CRMSidebar theme={theme} onToggleTheme={toggle} />
        </div>
        <div className="crm-main">
          <CRMTopbar theme={theme} onToggleTheme={toggle} />
          <div className="crm-content">{children}</div>
        </div>
      </div>
      <FloatingCopilot />
    </div>
  );
}
