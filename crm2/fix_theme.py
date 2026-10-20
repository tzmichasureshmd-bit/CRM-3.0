import re

with open('src/app/globals.css', 'r', encoding='utf-8-sig') as f:
    css = f.read()

# Fix :root AND dark mode block - root should default to light green theme
root_new = ''':root,
html[data-mode="dark"] {
  --background: oklch(0.13 0.01 160);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.18 0.01 160);
  --card-2: oklch(0.205 0.01 160);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.18 0.01 160);
  --popover-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.22 0.01 160);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.22 0.01 160);
  --muted-foreground: oklch(0.65 0.01 160);
  --accent: oklch(0.22 0.01 160);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.28 0.01 160);
  --input: oklch(0.28 0.01 160);
  --chart-2: #2180E6;
  --chart-3: #72C613;
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.625rem;
  --sidebar: oklch(0.16 0.01 160);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.22 0.01 160);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(0.28 0.01 160);
}'''

css = re.sub(r':root,\s*\nhtml\[data-mode="dark"\]\s*\{[^}]*\}', root_new, css, flags=re.DOTALL)

# Fix light mode block
light_new = '''html[data-mode="light"] {
  --background: #f4fbf4;
  --foreground: #044B39;
  --card: #ffffff;
  --card-2: #edf7ed;
  --card-foreground: #044B39;
  --popover: #ffffff;
  --popover-foreground: #044B39;
  --secondary: #C8EFC1;
  --secondary-foreground: #264B04;
  --muted: #edf7ed;
  --muted-foreground: #3a6b52;
  --accent: #CBF39D;
  --accent-foreground: #264B04;
  --destructive: #ef4444;
  --border: #c8efc1;
  --input: #e4f5e4;
  --chart-2: #2180E6;
  --chart-3: #72C613;
  --chart-4: #f59e0b;
  --chart-5: #ef4444;
  --radius: 0.625rem;
  --sidebar: #ffffff;
  --sidebar-foreground: #044B39;
  --sidebar-accent: #C8EFC1;
  --sidebar-accent-foreground: #044B39;
  --sidebar-border: #c8efc1;
}'''

css = re.sub(r'html\[data-mode="light"\]\s*\{[^}]*\}', light_new, css, flags=re.DOTALL)

# Fix emerald accent
emerald_new = '''html[data-theme="emerald"] {
  --primary: #044B39;
  --primary-foreground: #ffffff;
  --primary-hover: #053438;
  --primary-soft: rgba(4,75,57,0.10);
  --primary-soft-2: rgba(4,75,57,0.18);
  --ring: #1EA97B;
  --chart-1: #1EA97B;
  --chart-2: #2180E6;
  --sidebar-primary: #044B39;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-ring: #1EA97B;
}'''

css = re.sub(r'html\[data-theme="emerald"\]\s*\{[^}]*\}', emerald_new, css, flags=re.DOTALL)

with open('src/app/globals.css', 'w', encoding='utf-8') as f:
    f.write(css)

# Verify
with open('verify.txt', 'w') as f:
    f.write('light_bg: ' + str('#f4fbf4' in css) + '\n')
    f.write('primary: ' + str('#044B39' in css) + '\n')
    f.write('ring: ' + str('#1EA97B' in css) + '\n')
    f.write('root_fixed: ' + str('oklch(0.13 0.01 160)' in css) + '\n')
