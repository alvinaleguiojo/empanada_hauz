'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

export default function SplashScreen({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        <Image
          src="/empanada hauz logo.jpg"
          alt="Empanada Hauz"
          width={180}
          height={180}
          priority
        />
      </div>
    );
  }

  return <>{children}</>;
}