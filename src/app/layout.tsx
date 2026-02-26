import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperDraw Video - AI Kinderzeichnung Animator",
  description: "Verwandle deine Ideen in lustige animierte Kinderzeichnungs-Videos! Powered by AI.",
  openGraph: {
    title: "PaperDraw Video - AI Kinderzeichnung Animator",
    description: "Verwandle deine Ideen in lustige animierte Kinderzeichnungs-Videos!",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PaperDraw Video - AI Kinderzeichnung Animator",
    description: "Verwandle deine Ideen in lustige animierte Kinderzeichnungs-Videos!",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
