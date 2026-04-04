import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isDevBypassEnabled, DEV_AUTH_COOKIE } from "@/lib/dev-auth";
import { cookies } from "next/headers";

const FACES = [
  { name: "Adin Ross", img: "/landing/faces/Adin Ross.jpg" },
  { name: "xQc", img: "/landing/faces/xQc.jpg" },
  { name: "IShowSpeed", img: "/landing/faces/IShowSpeed.jpg" },
  { name: "Lacy", img: "/landing/faces/Lacy.jpg" },
  { name: "Jynxzi", img: "/landing/faces/Jynxzi.jpg" },
  { name: "Bbno$", img: "/landing/faces/Bbno$.jpg" },
  { name: "Cinna", img: "/landing/faces/Cinna.jpg" },
  { name: "Lil Baby", img: "/landing/faces/Lil Baby.jpg" },
  { name: "Togi", img: "/landing/faces/Togi.jpg" },
  { name: "Clavicular", img: "/landing/faces/Clavicular.jpg" },
];

const BRANDS = [
  { name: "AG1", img: "/landing/brands/AG1.jpg" },
  { name: "Gymshark", img: "/landing/brands/Gymshark.jpg" },
  { name: "Prime Hydration", img: "/landing/brands/Prime Hydration.jpg" },
  { name: "Celsius", img: "/landing/brands/Celsius.jpg" },
  { name: "YoungLA", img: "/landing/brands/YoungLA.jpg" },
  { name: "Gorilla Mind", img: "/landing/brands/Gorilla Mind.jpg" },
  { name: "RAW Nutrition", img: "/landing/brands/RAW Nutrition.jpg" },
  { name: "Manscaped", img: "/landing/brands/Manscaped.jpg" },
  { name: "Rizz App", img: "/landing/brands/Rizz App.jpg" },
  { name: "Based", img: "/landing/brands/Based.png" },
];

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

  const doubled = [...FACES, ...FACES];
  const brandsDoubled = [...BRANDS, ...BRANDS];

  return (
    <div className="relative min-h-screen bg-[#080c10] text-[#e8edf2] overflow-hidden" style={{ fontFamily: "'Manrope', 'DM Sans', sans-serif" }}>

      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10 h-[72px] bg-[#080c10]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/landing/logo/logo.png" alt="Clippers HQ" className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight">Clippers HQ</span>
        </Link>
        <div className="hidden sm:flex items-center gap-6 text-sm text-[#7a8a9a]">
          <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
          <a href="#perks" className="hover:text-white transition-colors">Perks</a>
          <Link href="/brands" className="hover:text-white transition-colors">For Brands</Link>
        </div>
        <Link href="/login" className="rounded-full bg-[#0095f6] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0084db] transition-colors">
          Join Now
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-[72px] min-h-screen flex flex-col items-center justify-center px-4 text-center">
        {/* Background effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[20%] left-[30%] w-[500px] h-[500px] rounded-full bg-[#0095f6]/[0.06] blur-[120px]" />
          <div className="absolute bottom-[20%] right-[20%] w-[400px] h-[400px] rounded-full bg-[#60c8ff]/[0.04] blur-[100px]" />
        </div>
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

        <div className="relative z-10 max-w-3xl">
          <p className="text-[#0095f6] text-sm font-semibold uppercase tracking-widest mb-4">Become a Clipper</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] mb-6" style={{ background: "linear-gradient(180deg, #fff 40%, #7a8a9a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Clip for the biggest creators. Get paid.
          </h1>
          <p className="text-lg text-[#7a8a9a] max-w-xl mx-auto mb-8">
            Join Clippers HQ and start earning from your content skills. Work with top creators and brands across TikTok, Instagram, and YouTube.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/login" className="relative group rounded-full px-8 py-3.5 text-base font-semibold text-white">
              <span className="absolute inset-0 rounded-full bg-[#0095f6] group-hover:bg-[#0084db] transition-colors" />
              <span className="absolute inset-0 rounded-full bg-[#0095f6] blur-lg opacity-30 group-hover:opacity-50 transition-opacity" />
              <span className="relative">Get Started — It&apos;s Free</span>
            </Link>
            <a href="https://discord.gg/CM8xdenGYf" target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-medium hover:bg-white/[0.08] transition-colors">
              Join Discord
            </a>
          </div>
        </div>

        {/* Phone mockups with videos */}
        <div className="relative z-10 mt-12 flex items-center justify-center gap-4 sm:gap-8 max-w-2xl mx-auto">
          <div className="w-[140px] sm:w-[180px] rounded-[20px] overflow-hidden border-2 border-white/10 shadow-2xl shadow-black/50 -rotate-3">
            <video src="/landing/videos/video-left.mp4" autoPlay muted loop playsInline className="w-full h-auto" />
          </div>
          <div className="w-[160px] sm:w-[200px] rounded-[20px] overflow-hidden border-2 border-white/10 shadow-2xl shadow-black/50 rotate-2 -mt-4">
            <video src="/landing/videos/video-right.mp4" autoPlay muted loop playsInline className="w-full h-auto" />
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="relative z-10 border-y border-white/[0.06] py-10">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-3 gap-6 text-center">
          {[
            { n: "10B+", l: "Views Generated" },
            { n: "60K+", l: "Active Clippers" },
            { n: "340%", l: "Average Lift" },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-2xl sm:text-3xl font-bold text-white">{s.n}</p>
              <p className="text-xs sm:text-sm text-[#7a8a9a] mt-1">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Faces carousel ── */}
      <section className="py-16 overflow-hidden">
        <h2 className="text-center text-xs uppercase tracking-widest text-[#7a8a9a] mb-8">Trusted by creators & brands</h2>
        {/* Row 1 — faces scrolling left */}
        <div className="relative mb-3">
          <div className="flex gap-3 animate-[scrollLeft_40s_linear_infinite]" style={{ width: "max-content" }}>
            {doubled.map((f, i) => (
              <div key={i} className="relative w-[180px] h-[180px] sm:w-[220px] sm:h-[220px] rounded-2xl overflow-hidden flex-shrink-0 group">
                <img src={f.img} alt={f.name} className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-sm font-semibold text-white">{f.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Row 2 — brands scrolling right */}
        <div className="relative">
          <div className="flex gap-3 animate-[scrollRight_45s_linear_infinite]" style={{ width: "max-content" }}>
            {brandsDoubled.map((b, i) => (
              <div key={i} className="relative w-[180px] h-[180px] sm:w-[220px] sm:h-[220px] rounded-2xl overflow-hidden flex-shrink-0">
                <img src={b.img} alt={b.name} className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-sm font-semibold text-white">{b.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Perks ── */}
      <section id="perks" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Why clip with us?</h2>
          <p className="text-[#7a8a9a] text-center mb-12 max-w-lg mx-auto">Everything you need to turn your clipping skills into a real income stream.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "💰", title: "Competitive Pay", desc: "Earn CPM-based income on every clip. Level up for permanent bonus increases." },
              { icon: "📅", title: "Flexible Schedule", desc: "Work when you want, from wherever you want. No fixed hours." },
              { icon: "🎯", title: "Top Brands", desc: "Work with the biggest creators and brands in the content space." },
              { icon: "💬", title: "Direct Communication", desc: "Chat directly with campaign managers. Fast feedback, quick payouts." },
              { icon: "📈", title: "Skill Growth", desc: "Improve your editing skills by working on real campaigns with real metrics." },
              { icon: "🤝", title: "Trusted Network", desc: "Join 60,000+ clippers in a community that supports each other." },
            ].map((p, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-300">
                <span className="text-2xl block mb-3">{p.icon}</span>
                <h3 className="text-base font-semibold mb-1">{p.title}</h3>
                <p className="text-sm text-[#7a8a9a] leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-20 px-4 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">How it works</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: "01", title: "Sign Up", desc: "Create your account with Discord in seconds." },
              { step: "02", title: "Add Accounts", desc: "Link your TikTok, Instagram, or YouTube account." },
              { step: "03", title: "Join Campaigns", desc: "Browse active campaigns and join ones that match your style." },
              { step: "04", title: "Get Paid", desc: "Submit clips, earn from views, and request payouts." },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#0095f6]/10 border border-[#0095f6]/20 text-[#0095f6] text-sm font-bold mb-4">{s.step}</div>
                <h3 className="text-base font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-[#7a8a9a]">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Requirements ── */}
      <section className="py-20 px-4 border-t border-white/[0.06]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-8">Requirements</h2>
          <div className="space-y-3 text-left">
            {[
              "TikTok, Instagram, or YouTube account in good standing",
              "Consistent posting schedule (at least a few times per week)",
              "Understanding of short-form content and trends",
              "Reliable internet connection for uploading",
              "Willingness to follow campaign guidelines and requirements",
              "Must submit clips within 2 hours of posting",
            ].map((r, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-3">
                <span className="text-[#0095f6] mt-0.5">✓</span>
                <span className="text-sm text-[#c8d0da]">{r}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-4 text-center">
        <div className="max-w-lg mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to start earning?</h2>
          <p className="text-[#7a8a9a] mb-8">Join thousands of clippers making money from their content skills.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/login" className="rounded-full bg-[#0095f6] px-8 py-3.5 text-base font-semibold text-white hover:bg-[#0084db] transition-colors shadow-lg shadow-[#0095f6]/20">
              Sign Up — Free
            </Link>
            <a href="https://discord.gg/CM8xdenGYf" target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-medium hover:bg-white/[0.08] transition-colors">
              Join Discord
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/landing/logo/logo.png" alt="" className="h-6 w-6 opacity-60" />
            <span className="text-xs text-[#7a8a9a]">Clippers HQ &copy; 2026</span>
          </div>
          <div className="flex gap-4 text-xs text-[#7a8a9a]">
            <Link href="/brands" className="hover:text-white transition-colors">For Brands</Link>
            <a href="https://discord.gg/CM8xdenGYf" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Discord</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
          </div>
        </div>
      </footer>

      {/* ── Animations ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scrollLeft {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes scrollRight {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}} />
    </div>
  );
}
