import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client Login — Clippers HQ",
  description: "Access your campaign dashboard on Clippers HQ.",
};

export default function ClientLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
