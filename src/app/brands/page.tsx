import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For Brands — Clippers HQ",
  description: "Launch your content clipping campaign. Professional distribution across TikTok, Instagram Reels, and YouTube Shorts.",
};

const BRANDS = [
  { name: "AG1", img: "/landing/brands/AG1.jpg" },
  { name: "Gymshark", img: "/landing/brands/Gymshark.jpg" },
  { name: "Prime Hydration", img: "/landing/brands/Prime Hydration.jpg" },
  { name: "Celsius", img: "/landing/brands/Celsius.jpg" },
  { name: "YoungLA", img: "/landing/brands/YoungLA.jpg" },
  { name: "Gorilla Mind", img: "/landing/brands/Gorilla Mind.jpg" },
  { name: "RAW Nutrition", img: "/landing/brands/RAW Nutrition.jpg" },
  { name: "Manscaped", img: "/landing/brands/Manscaped.jpg" },
];

const CLIENTS = [
  { label: "Artists & Musicians", desc: "Maximize your reach with clips from live shows, music videos, and behind-the-scenes moments." },
  { label: "Streamers & Creators", desc: "Turn hours of streaming into viral short-form highlights across every platform." },
  { label: "Product Brands", desc: "UGC-style clips that drive awareness, engagement, and conversions." },
  { label: "DTC & E-commerce", desc: "Scale your content engine with hundreds of unique clips per campaign." },
  { label: "Apps & Startups", desc: "Launch fast with a network of clippers ready to promote your product." },
];

export default function BrandsPage() {
  return (
    <div className="relative min-h-screen bg-[#080c10] text-[#e8edf2] overflow-hidden" style={{ fontFamily: "'Manrope', 'DM Sans', sans-serif" }}>

      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10 h-[72px] bg-[#080c10]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/landing/logo/logo.png" alt="Clippers HQ" className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight">Clippers HQ</span>
        </Link>
        <div className="hidden sm:flex items-center gap-6 text-sm text-[#7a8a9a]">
          <a href="#process" className="hover:text-white transition-colors">Process</a>
          <a href="#clients" className="hover:text-white transition-colors">Clients</a>
          <Link href="/" className="hover:text-white transition-colors">Become a Clipper</Link>
        </div>
        <a href="https://calendly.com/clipershq/30min" target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#0095f6] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0084db] transition-colors">
          Book a Call
        </a>
      </nav>

      {/* ── Background ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[10%] right-[20%] w-[500px] h-[500px] rounded-full bg-[#0095f6]/[0.05] blur-[120px]" />
        <div className="absolute bottom-[30%] left-[10%] w-[400px] h-[400px] rounded-full bg-[#60c8ff]/[0.03] blur-[100px]" />
      </div>
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      {/* ── Hero ── */}
      <section className="relative z-10 pt-[72px] min-h-[80vh] flex flex-col items-center justify-center px-4 text-center">
        <p className="text-[#0095f6] text-sm font-semibold uppercase tracking-widest mb-4">For Brands & Agencies</p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] mb-6 max-w-3xl" style={{ background: "linear-gradient(180deg, #fff 40%, #7a8a9a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Scale your short-form content with 60,000+ clippers
        </h1>
        <p className="text-lg text-[#7a8a9a] max-w-xl mx-auto mb-8">
          We distribute your content across TikTok, Instagram Reels, and YouTube Shorts. Track performance, manage campaigns, and pay clippers — all in one platform.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a href="https://calendly.com/clipershq/30min" target="_blank" rel="noopener noreferrer" className="relative group rounded-full px-8 py-3.5 text-base font-semibold text-white">
            <span className="absolute inset-0 rounded-full bg-[#0095f6] group-hover:bg-[#0084db] transition-colors" />
            <span className="absolute inset-0 rounded-full bg-[#0095f6] blur-lg opacity-30 group-hover:opacity-50 transition-opacity" />
            <span className="relative">Book a Free Call</span>
          </a>
          <Link href="/" className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-medium hover:bg-white/[0.08] transition-colors">
            Become a Clipper
          </Link>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="relative z-10 border-y border-white/[0.06] py-10">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-3 gap-6 text-center">
          {[
            { n: "10B+", l: "Views Generated" },
            { n: "60K+", l: "Clippers Network" },
            { n: "340%", l: "Average Content Lift" },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-2xl sm:text-3xl font-bold text-white">{s.n}</p>
              <p className="text-xs sm:text-sm text-[#7a8a9a] mt-1">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trusted By (brand logos) ── */}
      <section className="py-16 px-4">
        <h2 className="text-center text-xs uppercase tracking-widest text-[#7a8a9a] mb-10">Trusted by leading brands</h2>
        <div className="max-w-4xl mx-auto grid grid-cols-4 sm:grid-cols-8 gap-4 items-center justify-items-center">
          {BRANDS.map((b, i) => (
            <div key={i} className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
              <img src={b.img} alt={b.name} className="w-full h-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      </section>

      {/* ── Process ── */}
      <section id="process" className="py-20 px-4 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">How it works</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { step: "01", title: "Book a Call", desc: "Tell us about your brand, your goals, and what content you need. We'll design a custom campaign." },
              { step: "02", title: "We Launch Distribution", desc: "Our network of 60,000+ clippers starts creating and posting content for your campaign." },
              { step: "03", title: "Track & Scale", desc: "Monitor real-time views, engagement, and ROI. Scale up or adjust campaigns instantly." },
            ].map((s, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#0095f6]/10 border border-[#0095f6]/20 text-[#0095f6] text-sm font-bold mb-4">{s.step}</div>
                <h3 className="text-base font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-[#7a8a9a] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who We Work With ── */}
      <section id="clients" className="py-20 px-4 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">Who we work with</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CLIENTS.map((c, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-300">
                <h3 className="text-base font-semibold mb-2">{c.label}</h3>
                <p className="text-sm text-[#7a8a9a] leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-4 text-center">
        <div className="max-w-lg mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to scale your content?</h2>
          <p className="text-[#7a8a9a] mb-8">Book a free 30-minute call to discuss your campaign.</p>
          <a href="https://calendly.com/clipershq/30min" target="_blank" rel="noopener noreferrer" className="inline-block rounded-full bg-[#0095f6] px-8 py-3.5 text-base font-semibold text-white hover:bg-[#0084db] transition-colors shadow-lg shadow-[#0095f6]/20">
            Book a Free Call
          </a>
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
            <Link href="/" className="hover:text-white transition-colors">For Clippers</Link>
            <a href="https://discord.gg/CM8xdenGYf" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Discord</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
