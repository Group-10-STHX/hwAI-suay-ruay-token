import { redirect } from 'next/navigation';
import { HANDLE } from '@/lib/validate';

// /players?handle=@nong_dot → /players/nong_dot (the hero "scan" form posts here)
export default async function Find({ searchParams }: { searchParams: Promise<{ handle?: string }> }) {
  const raw = String((await searchParams).handle ?? '').trim().toLowerCase().replace(/^@/, '');
  redirect(HANDLE.test(raw) ? `/players/${raw}` : '/');
}
