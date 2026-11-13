'use client';

import { useEffect } from 'react';

export function RegistroServiceWorker() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Falha silenciosa em ambientes restritos
      });
    }
  }, []);

  return null;
}

