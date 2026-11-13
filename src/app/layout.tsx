import type { Metadata, Viewport } from 'next';
import './globals.css';
import { RegistroServiceWorker } from '@/modulos/sis/RegistroServiceWorker';
import { SimuladorMobileDesktop } from '@/modulos/sis/SimuladorMobileDesktop';

export const metadata: Metadata = {
  title: 'Livion — Plataforma Social Gamificada de Leitura',
  description:
    'Leia obras clássicas e seus próprios PDFs com leitura offline instantânea, ofensiva diária, escudos protetores e Liga da Semana.',
  manifest: '/manifest.json',
  icons: {
    icon: '/marca/icone-192.png',
    apple: '/marca/icone-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Livion',
  },
};

export const viewport: Viewport = {
  themeColor: '#0F172A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-[#080C16] text-[#FAF8F5] antialiased selection:bg-[#F59E0B] selection:text-[#1E293B]">
        <RegistroServiceWorker />
        <SimuladorMobileDesktop>{children}</SimuladorMobileDesktop>
      </body>
    </html>
  );
}

