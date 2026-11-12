import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Living Relief',
  description:
    'Explore the Sacred Valley as a sculpted atlas or a living landscape, from mountain ridges to the places between.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
