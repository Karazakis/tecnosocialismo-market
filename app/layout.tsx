import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://market.tecnosocialismo.com"),
  title: "Market — Tecnosocialismo",
  description: "Beni, cibo vegano e bevande organizzati a partire dai bisogni reali.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Market — La domanda viene prima dell'offerta",
    description: "Dono, scambio e compravendita di ciò che serve davvero.",
    url: "https://market.tecnosocialismo.com",
    siteName: "Tecnosocialismo Market",
    locale: "it_IT",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1792,
        height: 933,
        alt: "Market — Ciò che serve, messo in circolo.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Market — Tecnosocialismo",
    description: "Dono, scambio e compravendita di ciò che serve davvero.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#080b0a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
