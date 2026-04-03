export const metadata = {
  title: 'BJJ Atlas',
  description: 'The global BJJ event aggregator',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
