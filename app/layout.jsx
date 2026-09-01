import './globals.css';

export const metadata = {
  title: 'Hisaab',
  description: 'Split expenses with your Discord friends.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
