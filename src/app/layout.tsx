import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CTO Cost Intelligence Command Center",
  description: "Adaptive SAP cost-control intelligence with project isolation and automatic workbook detection.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
