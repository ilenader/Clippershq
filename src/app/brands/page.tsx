import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For Brands — Clippers HQ",
  description: "Launch content clipping campaigns on Clippers HQ. Connect with verified creators across TikTok, Instagram, and YouTube.",
};

export default function BrandsPage() {
  return (
    <>
      {/* SEO content — indexed under /brands. The iframe'd /brands.html is noindex + canonical → /brands. */}
      <div className="sr-only">
        <h1>For Brands — Clippers HQ</h1>
        <p>Launch content clipping campaigns on Clippers HQ. Connect with verified creators across TikTok, Instagram Reels, and YouTube Shorts.</p>
        <h2>How Brand Campaigns Work</h2>
        <p>Set your budget, CPM rate, and content requirements. Our verified clipper network creates and submits short-form video clips. Track every view in real-time with automated analytics.</p>
        <h2>What You Get</h2>
        <p>Access to a vetted roster of content clippers. Real-time view tracking across platforms. Professional campaign analytics and reporting. Pay only for verified performance via CPM.</p>
        <a href="/login">Sign in</a>
      </div>
      <iframe
        src="/brands.html"
        title="Clippers HQ for brands"
        style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
      />
    </>
  );
}
