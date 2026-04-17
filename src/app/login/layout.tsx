import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — Clippers HQ",
  description: "Sign in to Clippers HQ to manage your clips, campaigns, and earnings.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
