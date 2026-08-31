import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Luna Harness Chat',
  description: 'HarnessAgent chatbot powered by Pi and GPT-5.6 Luna through CPA.',
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0b100e',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
