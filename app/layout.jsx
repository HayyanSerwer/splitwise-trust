import './globals.css';
import ServiceWorkerRegister from './sw-register';

export const metadata = {
  title: 'Hisaab',
  description: 'Split expenses with your Discord friends.',
  applicationName: 'Hisaab',
  appleWebApp: {
    capable: true,
    title: 'Hisaab',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#131317',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
