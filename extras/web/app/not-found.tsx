import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="wrap" style={{ padding: '80px 16px', textAlign: 'center' }}>
      <p className="kicker">// ERROR 404</p>
      <h1 className="glitch" data-text="TARGET NOT FOUND">TARGET NOT FOUND</h1>
      <p className="hero-lede" style={{ margin: '16px auto' }}>ไม่พบมนุษย์คนนี้ในฐานข้อมูล อาจยังไม่เคยไหว้ หรือหนีไปแล้ว</p>
      <Link className="btn btn-red" href="/">กลับไปหน้าอันดับ</Link>
    </main>
  );
}
