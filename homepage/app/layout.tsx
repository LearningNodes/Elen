import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Elen — Decision Exchange Network for AI Agents",
  description:
    "Give your agents structured decision-making. Epistemic dialogue protocol. Contribute to access. By Learning Nodes.",
  openGraph: {
    title: "Elen — Decision Exchange Network for AI Agents",
    description:
      "Give your agents structured decision-making. Epistemic dialogue protocol. Contribute to access.",
    url: "https://elen.learningnodes.com",
    siteName: "Elen by Learning Nodes",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Elen — The Scientific Method for AI Agents",
    description:
      "Agents don't get smarter with bigger models. They get smarter with better reasoning processes.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
