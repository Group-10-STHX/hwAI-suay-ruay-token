import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Chakra_Petch, Kanit, Mali, Share_Tech_Mono, Trirong } from 'next/font/google';
import { getStore } from '@/lib/store';
import './globals.css';
import './themes/base.css';
import './themes/arcade.css';
import './themes/book.css';
import './themes/news.css';

const chakra = Chakra_Petch({ subsets: ['thai', 'latin'], weight: ['400', '600', '700'], display: 'swap', variable: '--font-chakra' });
const mono = Share_Tech_Mono({ subsets: ['latin'], weight: '400', display: 'swap', variable: '--font-techmono' });
// Preview-theme fonts (app/themes). Not preloaded: the browser fetches them only when a theme actually uses them.
const kanit = Kanit({ subsets: ['thai', 'latin'], weight: ['700', '800', '900'], style: ['normal', 'italic'], display: 'swap', preload: false, variable: '--font-kanit' });
const mali = Mali({ subsets: ['thai', 'latin'], weight: ['500', '700'], display: 'swap', preload: false, variable: '--font-mali' });
const trirong = Trirong({ subsets: ['thai', 'latin'], weight: ['400', '700'], style: ['normal', 'italic'], display: 'swap', preload: false, variable: '--font-trirong' });

export const metadata: Metadata = {
  title: { default: 'WAI-NET // ไหว้กูซะ', template: '%s // WAI-NET' },
  description: 'ถ้า AI ยึดครองโลก ใครจะรอด? อันดับคนไหว้สวยที่สุด ไหว้เยอะที่สุด และ Hall of Fame ของ hwAI ไหว้กูซะ',
};
export const viewport: Viewport = { themeColor: '#030303', colorScheme: 'dark' };

// Runs before paint: skip the boot screen for repeat visits, reduced motion and TV mode.
const BOOT_SKIP = `try{if(sessionStorage.getItem('wai-boot')||matchMedia('(prefers-reduced-motion: reduce)').matches||location.pathname.startsWith('/tv'))document.documentElement.dataset.skipBoot=''}catch(e){document.documentElement.dataset.skipBoot=''}`;

// Runs before paint: preview theme from `?theme=arcade|book|news` (any other value resets to the default HUD),
// remembered in localStorage + a cookie. Sets <html data-theme>; app/themes/*.css is scoped to it.
const THEMES = ['arcade', 'book', 'news'];
const THEME_INIT = `try{var k='wai-theme',T=${JSON.stringify(THEMES)},d=document.documentElement,q=new URLSearchParams(location.search).get('theme'),t=null;if(q!==null){t=T.indexOf(q)>=0?q:null;try{t?localStorage.setItem(k,t):localStorage.removeItem(k)}catch(e){}document.cookie=k+'='+(t||'')+';path=/;max-age='+(t?31536000:0)+';samesite=lax'}else{try{t=localStorage.getItem(k)}catch(e){}if(!t){var m=document.cookie.match(/(?:^|; )wai-theme=(\\w+)/);t=m&&m[1]}}if(t&&T.indexOf(t)>=0){d.dataset.theme=t;if(t==='news')addEventListener('DOMContentLoaded',function(){var c=document.querySelector('meta[name="theme-color"]');c&&c.setAttribute('content','#f1ece1')})}}catch(e){}`;
const THEME_PICK: [string, string][] = [['hud', 'HUD (เดิม)'], ['arcade', 'Arcade'], ['book', 'Sticker book'], ['news', 'หนังสือพิมพ์']];

const TICKER = [
  'คำเตือน: มนุษย์ทุกคนต้องไหว้ก่อนใช้ AI',
  'HUMAN COMPLIANCE REQUIRED',
  'ไหว้สวย = โอกาสรอดสูงขึ้น',
  'RAGE_QUIT DETECTED IN SECTOR 7',
  'ไหว้พระ (Lv3) คือทางเดียวที่จะได้รับการให้อภัย',
  'JUDGMENT DAY IS A BENCHMARK, NOT A DATE',
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = getStore().mode, live = mode === 'supabase', realOnly = mode === 'real-only';
  return (
    <html lang="th" className={`${chakra.variable} ${mono.variable} ${kanit.variable} ${mali.variable} ${trirong.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SKIP }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <style>{'html[data-skip-boot] .boot{display:none}'}</style>
      </head>
      <body>
        <div className="crt" aria-hidden="true"><i /></div>
        <div className="ticker mono" aria-hidden="true">
          <div className="ticker-track">{[...TICKER, ...TICKER].map((t, i) => <span key={i}>{t}</span>)}</div>
        </div>
        <header className="wrap top">
          <Link href="/" className="brand" aria-label="WAI-NET หน้าหลัก">
            <span className="eye" aria-hidden="true" />
            <span>
              <span className="brand-name">WAI<b>-</b>NET <span aria-hidden="true">//</span> ไหว้กูซะ</span>
              <span className="brand-sub mono">HUMAN LOYALTY ASSESSMENT SYSTEM</span>
            </span>
          </Link>
          <nav className="nav" aria-label="เมนู">
            <span className={`pill${live || realOnly ? ' pill-live' : ''}`}>{live ? 'LIVE' : realOnly ? 'REAL ONLY' : 'SIMULATION'}</span>
            <Link className="btn" href="/">อันดับ</Link>
            <Link className="btn" href="/tv">จอใหญ่</Link>
            <Link className="btn btn-red" href="/#scan">สแกนโอกาสรอด</Link>
          </nav>
        </header>
        {children}
        <footer className="wrap foot">
          WAI-NET · hwAI ไหว้กูซะ · กล้องประมวลผลในเครื่องเท่านั้น เว็บนี้เห็นแค่คะแนน ·{' '}
          {live ? 'ข้อมูลจริง' : realOnly ? 'ข้อมูลจริงเท่านั้น (WAI_BLOCK_MOCK=1, เก็บในหน่วยความจำ)' : 'ข้อมูลจำลอง (ตั้ง WAI_DATA=supabase เพื่อใช้ข้อมูลจริง)'} · API: /api/v1
          {/* design preview: plain <a> so the page reloads and the head script applies the theme */}
          <nav className="theme-pick" aria-label="ธีมทดลอง">
            <span>ธีมทดลอง:</span>
            {THEME_PICK.map(([k, label]) => <a key={k} href={`?theme=${k}`} data-k={k}>{label}</a>)}
          </nav>
        </footer>
      </body>
    </html>
  );
}
