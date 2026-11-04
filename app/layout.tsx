import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title:'Snake Classic+ | Yılan Oyunu', description:'Altı harita, üç zorluk seviyesi ve özel güçlerle yılan oyunu. Telefonunda veya bilgisayarında oyna. Rekorlar bu tarayıcıda saklanır.' };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="tr"><body>{children}</body></html>; }
