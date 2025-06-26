import "@livekit/components-styles";
import { Metadata, Viewport } from "next";
import { Public_Sans, Righteous } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const publicSans400 = Public_Sans({
  weight: "400",
  subsets: ["latin"],
});

export const righteous = Righteous({
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voice Assistant",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
  colorScheme: "dark",
};

// Development-only loading state monitor
function LoadingStateMonitor() {
  if (process.env.NODE_ENV !== 'development') return null;
  
  return (
    <div className="fixed top-4 right-4 z-50 bg-black/80 text-white text-xs p-2 rounded font-mono">
      <div id="loading-monitor">Loading states will appear here in dev mode</div>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full bg-black ${publicSans400.className}`}>
      <head>
        <meta name="theme-color" content="#000000" />
        <meta name="msapplication-navbutton-color" content="#000000" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="h-full bg-black text-white">
        <ErrorBoundary>
          <AuthProvider>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </AuthProvider>
        </ErrorBoundary>
        <LoadingStateMonitor />
      </body>
    </html>
  );
}
