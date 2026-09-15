import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { PwaRegister } from "@/components/PwaRegister";

/** Necesario para CSP con nonce por request (proxy.ts). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ARC",
  description: "Dashboard de agente WhatsApp local con IA",
  applicationName: "ARC",
  appleWebApp: {
    capable: true,
    // Contenido a pantalla completa bajo la barra de estado (evita franja blanca en PWA iOS)
    statusBarStyle: "black-translucent",
    title: "ARC",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0620",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased min-h-dvh text-[var(--color-text)]">
        <PwaRegister />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
