import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Phoenix 9Sig',
  description: 'Shares-only Phoenix 9Sig model, backtest, and Telegram alerts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
