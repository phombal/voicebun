import "@livekit/components-styles";
import { Metadata } from "next";
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
  themeColor: "#000000",
  viewport: "width=device-width, initial-scale=1",
  colorScheme: "dark",
};

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
      </body>
    </html>
  );
}
