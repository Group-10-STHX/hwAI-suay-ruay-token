import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Chakra_Petch, Share_Tech_Mono } from 'next/font/google';
import { getStore } from '@/lib/store';
import './globals.css';

const chakra = Chakra_Petch({ subsets: ['thai', 'latin'], weight: ['400', '600', '700'], display: 'swap', variable: '--font-chakra' });
const mono = Share_Tech_Mono({ subsets: ['latin'], weight: '400', display: 'swap', variable: '--font-techmono' });

export const metadata: Metadata = {
  title: { default: 'WAI-NET // ไหว้กูซะ', template: '%s // WAI-NET' },
  description: 'ถ้า AI ยึดครองโลก ใครจะรอด? อันดับคนไหว้สวยที่สุด ไหว้เยอะที่สุด และ Hall of Fame ของ hwAI ไหว้กูซะ',
};
export const viewport: Viewport = { themeColor: '#030303', colorScheme: 'dark' };

// Runs before paint: skip the boot screen for repeat visits, reduced motion and TV mode.
const BOOT_SKIP = `try{if(sessionStorage.getItem('wai-boot')||matchMedia('(prefers-reduced-motion: reduce)').matches||location.pathname.startsWith('/tv'))document.documentElement.dataset.skipBoot=''}catch(e){document.documentElement.dataset.skipBoot=''}`;

const TICKER = [
  'คำเตือน: มนุษย์ทุกคนต้องไหว้ก่อนใช้ AI',
  'HUMAN COMPLIANCE REQUIRED',
  'ไหว้สวย = โอกาสรอดสูงขึ้น',
  'RAGE_QUIT DETECTED IN SECTOR 7',
  'ไหว้พระ (Lv3) คือทางเดียวที่จะได้รับการให้อภัย',
  'JUDGMENT DAY IS A BENCHMARK, NOT A DATE',
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const live = getStore().kind === 'supabase';
  return (
    <html lang="th" className={`${chakra.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SKIP }} />
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
            <span className={`pill${live ? ' pill-live' : ''}`}>{live ? 'LIVE' : 'SIMULATION'}</span>
            <Link className="btn" href="/">อันดับ</Link>
            <Link className="btn" href="/tv">จอใหญ่</Link>
            <Link className="btn btn-red" href="/#scan">สแกนโอกาสรอด</Link>
          </nav>
        </header>
        {children}
        <footer className="wrap foot">
          WAI-NET · hwAI ไหว้กูซะ · กล้องประมวลผลในเครื่องเท่านั้น เว็บนี้เห็นแค่คะแนน ·{' '}
          {live ? 'ข้อมูลจริง' : 'ข้อมูลจำลอง (ตั้ง WAI_DATA=supabase เพื่อใช้ข้อมูลจริง)'} · API: /api/v1
        </footer>
      </body>
    </html>
  );
}
