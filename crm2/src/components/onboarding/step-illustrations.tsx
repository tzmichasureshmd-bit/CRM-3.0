// Zoho-style sketch illustrations for onboarding steps
// Uses currentColor for accent strokes so they follow the theme primary color

export function IllustrationConnect() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Person body */}
      <circle cx="55" cy="28" r="10" stroke="#9ca3af" strokeWidth="2.5" fill="none"/>
      <path d="M45 50 Q55 42 65 50 L68 75 H42 Z" stroke="#9ca3af" strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
      {/* Plug / connect cable */}
      <path d="M68 62 Q85 62 85 50" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <rect x="82" y="44" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="85" y1="44" x2="85" y2="40" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="89" y1="44" x2="89" y2="40" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      {/* Handshake box */}
      <rect x="10" y="14" width="28" height="22" rx="3" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <path d="M16 25 Q24 20 32 25" stroke="#9ca3af" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M18 29 L30 29" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Contact card box */}
      <rect x="10" y="44" width="28" height="22" rx="3" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <circle cx="18" cy="52" r="4" stroke="#9ca3af" strokeWidth="1.5" fill="none"/>
      <path d="M25 50 L34 50" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M25 54 L32 54" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Lines from boxes to person */}
      <path d="M38 25 Q46 25 45 38" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round"/>
      <path d="M38 55 Q46 55 47 62" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round"/>
    </svg>
  )
}

export function IllustrationTrack() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Person */}
      <circle cx="38" cy="22" r="10" stroke="#9ca3af" strokeWidth="2.5" fill="none"/>
      <path d="M28 44 Q38 36 48 44 L50 72 H26 Z" stroke="#9ca3af" strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
      {/* Clipboard */}
      <rect x="52" y="18" width="30" height="38" rx="3" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <rect x="58" y="14" width="18" height="8" rx="2" stroke="#9ca3af" strokeWidth="1.5" fill="none"/>
      {/* Chart lines on clipboard */}
      <polyline points="58,42 64,34 70,38 76,28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="58" y1="46" x2="76" y2="46" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Pen in hand */}
      <line x1="48" y1="50" x2="58" y2="36" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/>
      <polygon points="58,36 62,32 60,38" stroke="#9ca3af" strokeWidth="1.5" fill="none"/>
      {/* Small stat boxes */}
      <rect x="86" y="18" width="22" height="14" rx="2" stroke="#9ca3af" strokeWidth="1.5" fill="none"/>
      <rect x="89" y="24" width="4" height="5" rx="1" fill="currentColor" opacity="0.6"/>
      <rect x="95" y="21" width="4" height="8" rx="1" fill="currentColor" opacity="0.8"/>
      <rect x="101" y="23" width="4" height="6" rx="1" fill="currentColor" opacity="0.5"/>
      <rect x="86" y="36" width="22" height="14" rx="2" stroke="#9ca3af" strokeWidth="1.5" fill="none"/>
      <line x1="89" y1="43" x2="105" y2="43" stroke="#9ca3af" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="89" y1="40" x2="101" y2="40" stroke="#9ca3af" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

export function IllustrationDeliver() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Left person */}
      <circle cx="28" cy="26" r="10" stroke="#9ca3af" strokeWidth="2.5" fill="none"/>
      <path d="M18 48 Q28 40 38 48 L40 72 H16 Z" stroke="#9ca3af" strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
      {/* Right person */}
      <circle cx="92" cy="26" r="10" stroke="#9ca3af" strokeWidth="2.5" fill="none"/>
      <path d="M82 48 Q92 40 102 48 L104 72 H80 Z" stroke="#9ca3af" strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
      {/* Clock in middle */}
      <circle cx="60" cy="32" r="18" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <line x1="60" y1="20" x2="60" y2="32" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/>
      <line x1="60" y1="32" x2="70" y2="38" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/>
      {/* Green checkmark on clock */}
      <path d="M52 32 L58 38 L70 24" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Handshake at bottom */}
      <path d="M38 62 Q60 70 82 62" stroke="#9ca3af" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M50 66 L55 72 L60 66 L65 72 L70 66" stroke="#9ca3af" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IllustrationTeam() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="60" cy="22" r="12" stroke="currentColor" strokeWidth="2.5" fill="none"/>
      <path d="M46 50 Q60 40 74 50 L76 80 H44 Z" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
      <circle cx="25" cy="30" r="9" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <path d="M14 54 Q25 46 36 54 L38 78 H12 Z" stroke="#9ca3af" strokeWidth="2" fill="none" strokeLinejoin="round"/>
      <circle cx="95" cy="30" r="9" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <path d="M84 54 Q95 46 106 54 L108 78 H82 Z" stroke="#9ca3af" strokeWidth="2" fill="none" strokeLinejoin="round"/>
      <path d="M36 44 Q48 38 46 50" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round"/>
      <path d="M84 44 Q72 38 74 50" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round"/>
    </svg>
  )
}

export function IllustrationWhatsApp() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="20" y="15" width="80" height="60" rx="12" stroke="currentColor" strokeWidth="2.5" fill="none"/>
      <path d="M20 55 L10 72 L32 65" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="44" cy="45" r="5" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <circle cx="60" cy="45" r="5" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <circle cx="76" cy="45" r="5" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <line x1="35" y1="30" x2="85" y2="30" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IllustrationContacts() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="25" y="10" width="70" height="80" rx="6" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <circle cx="60" cy="35" r="12" stroke="currentColor" strokeWidth="2.5" fill="none"/>
      <path d="M38 72 Q60 58 82 72" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <line x1="38" y1="82" x2="82" y2="82" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="45" y1="15" x2="45" y2="10" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/>
      <line x1="75" y1="15" x2="75" y2="10" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export function IllustrationTemplate() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="15" y="12" width="55" height="70" rx="5" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <line x1="25" y1="28" x2="60" y2="28" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="25" y1="36" x2="60" y2="36" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="25" y1="44" x2="50" y2="44" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="25" y="54" width="30" height="16" rx="3" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="30" y1="60" x2="50" y2="60" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="30" y1="65" x2="44" y2="65" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="60" y="40" width="45" height="48" rx="5" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M60 58 L50 68 L62 64" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="68" y1="52" x2="96" y2="52" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="68" y1="59" x2="96" y2="59" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="68" y1="66" x2="84" y2="66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IllustrationAutomation() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="20" cy="50" r="10" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <line x1="30" y1="50" x2="44" y2="50" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      <polygon points="44,44 56,50 44,56" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round"/>
      <rect x="56" y="38" width="24" height="24" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M63 50 L67 54 L77 44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="80" y1="50" x2="94" y2="50" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="100" cy="50" r="10" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <path d="M96 50 L99 53 L104 47" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M56 50 Q56 20 80 20 L94 20" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round"/>
      <path d="M56 50 Q56 80 80 80 L94 80" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round"/>
      <circle cx="100" cy="20" r="6" stroke="#9ca3af" strokeWidth="1.5" fill="none"/>
      <circle cx="100" cy="80" r="6" stroke="#9ca3af" strokeWidth="1.5" fill="none"/>
    </svg>
  )
}

export function IllustrationPlan() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="15" y="20" width="90" height="60" rx="8" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <rect x="15" y="20" width="90" height="20" rx="8" stroke="#9ca3af" strokeWidth="2" fill="none"/>
      <line x1="15" y1="40" x2="105" y2="40" stroke="#9ca3af" strokeWidth="1.5"/>
      <circle cx="38" cy="30" r="6" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M35 30 L37 32 L41 27" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="50" y1="28" x2="90" y2="28" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="50" y1="33" x2="78" y2="33" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="28" y1="54" x2="92" y2="54" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="28" y1="62" x2="92" y2="62" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="28" y1="70" x2="70" y2="70" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="88" cy="66" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M84 66 L87 69 L93 62" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
