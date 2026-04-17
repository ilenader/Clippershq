import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isDevBypassEnabled, DEV_AUTH_COOKIE } from "@/lib/dev-auth";
import { cookies } from "next/headers";

export default async function LandingPage() {
  if (isDevBypassEnabled()) {
    const cookieStore = await cookies();
    const devRole = cookieStore.get(DEV_AUTH_COOKIE)?.value;
    if (devRole) {
      if (devRole === "ADMIN" || devRole === "OWNER") redirect("/admin");
      redirect("/dashboard");
    }
    redirect("/dev-login");
  }
  const session = await auth();
  if (session?.user) {
    const role = (session.user as any).role;
    if (role === "ADMIN" || role === "OWNER") redirect("/admin");
    redirect("/dashboard");
  }

  return (
    <>
      {/* SEO content — readable by Googlebot and screen readers, hidden from sighted users.
          The visual landing lives inside /clipper.html (iframed below) which uses custom CSS
          and can't easily be re-implemented in JSX without breaking the design.
          This block ensures Google can index the actual landing copy under `/` rather than
          attributing it to /clipper.html (which is noindex + canonical → /). */}
      <div className="sr-only">
        <h1>Clippers HQ — Get Paid to Clip</h1>
        <p>The #1 platform for content clippers. Join campaigns, create short-form clips for TikTok, Instagram Reels, and YouTube Shorts, and earn real money from your views.</p>
        <h2>What is Clippers HQ?</h2>
        <p>Clippers HQ connects content creators with brand campaigns. Create short-form video clips, submit them to campaigns, and earn CPM-based payouts for every view your clips generate.</p>
        <h2>How It Works</h2>
        <p>1. Browse available campaigns from brands, artists, streamers, and personal brands.</p>
        <p>2. Join campaigns that match your content style and platform.</p>
        <p>3. Create and submit short-form clips to TikTok, Instagram Reels, or YouTube Shorts.</p>
        <p>4. Earn money based on your views through our CPM payment model.</p>
        <h2>Why Choose Clippers HQ?</h2>
        <p>Automated clip tracking with real-time view counting. Fair CPM-based earnings. Bonus rewards for streaks and levels. Professional analytics dashboard. Instant payout requests.</p>
        <h2>For Brands</h2>
        <p>Launch campaigns, connect with verified content clippers, track performance in real-time, and get professional reports. Visit our brands page to learn more.</p>
        <a href="/login">Start Clipping</a>
        <a href="/brands">Launch a Campaign</a>
      </div>
      <iframe
        src="/clipper.html"
        title="Clippers HQ landing page"
        style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
      />
    </>
  );
}
