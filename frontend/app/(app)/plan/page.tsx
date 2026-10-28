'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** The Planner is now merged into the Schedule page. Redirect old links. */
export default function PlannerPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}
