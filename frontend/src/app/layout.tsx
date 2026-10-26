import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HABISIN — Makanan enak, dampak baik.",
  description:
    "Selamatkan makanan lezat di sekitarmu. Temukan makanan surplus dengan harga lebih hemat dan bantu kurangi sampah makanan.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      data-scroll-behavior="smooth"
      className={`${jakarta.variable} ${jetbrains.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
