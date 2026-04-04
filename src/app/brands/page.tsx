"use client";

import { useEffect } from "react";
import Link from "next/link";
import "../landing.css";
import "../landing-clipper.css";

export default function BrandsPage() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/landing/script.js";
    script.async = true;
    document.body.appendChild(script);

    // Calendly widget
    const cal = document.createElement("script");
    cal.src = "https://assets.calendly.com/assets/external/widget.js";
    cal.async = true;
    document.body.appendChild(cal);

    // 3D Cloud parallax
    const parallax = () => {
      const heroBg = document.querySelector(".hero-bg") as HTMLElement;
      const heroFg = document.querySelector(".hero-fg") as HTMLElement;
      if (!heroBg || !heroFg) return;
      let ticking = false;
      const onScroll = () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            const s = window.pageYOffset;
            heroBg.style.transform = `translateZ(0) translateY(${s * 0.25}px)`;
            heroFg.style.transform = `translateZ(0) translateY(${s * 0.55}px)`;
            ticking = false;
          });
          ticking = true;
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    };
    const cleanParallax = parallax();

    // Logo scroll to top
    const logoHome = document.getElementById("logo-home");
    const logoHandler = (e: Event) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); };
    if (logoHome) logoHome.addEventListener("click", logoHandler);

    return () => {
      try { document.body.removeChild(script); } catch {}
      try { document.body.removeChild(cal); } catch {}
      if (cleanParallax) cleanParallax();
      if (logoHome) logoHome.removeEventListener("click", logoHandler);
    };
  }, []);

  const faceCards = (imgs: { src: string; name: string; views: string }[]) =>
    imgs.map((f, i) => (
      <div key={i} className="face-card reveal">
        <img src={f.src} alt={f.name} className="face-img" loading="lazy" />
        <span className="face-card-overlay">{f.name}</span>
        <div className="face-card-views">Views this month from clips alone:<br/>{f.views}</div>
      </div>
    ));

  const faces = [
    { src: "/landing/faces/Adin%20Ross.jpg", name: "Adin Ross", views: "48,200,000" },
    { src: "/landing/faces/Bbno%24.jpg", name: "Bbno$", views: "31,700,000" },
    { src: "/landing/faces/Cinna.jpg", name: "Cinna", views: "62,400,000" },
    { src: "/landing/faces/Clavicular.jpg", name: "Clavicular", views: "19,800,000" },
    { src: "/landing/faces/Lacy.jpg", name: "Lacy", views: "83,100,000" },
    { src: "/landing/faces/IShowSpeed.jpg", name: "IShowSpeed", views: "27,500,000" },
    { src: "/landing/faces/Jynxzi.jpg", name: "Jynxzi", views: "44,900,000" },
    { src: "/landing/faces/Lil%20Baby.jpg", name: "Lil Baby", views: "71,300,000" },
    { src: "/landing/faces/Togi.jpg", name: "Togi", views: "38,600,000" },
    { src: "/landing/faces/xQc.jpg", name: "xQc", views: "55,000,000" },
  ];
  const brands = [
    { src: "/landing/brands/AG1.jpg", name: "AG1", views: "22,400,000" },
    { src: "/landing/brands/Based.png", name: "Based", views: "15,300,000" },
    { src: "/landing/brands/Celsius.jpg", name: "Celsius", views: "29,000,000" },
    { src: "/landing/brands/Gorilla%20Mind.jpg", name: "Gorilla Mind", views: "73,500,000" },
    { src: "/landing/brands/Gymshark.jpg", name: "Gymshark", views: "33,100,000" },
    { src: "/landing/brands/Manscaped.jpg", name: "Manscaped", views: "90,200,000" },
    { src: "/landing/brands/Prime%20Hydration.jpg", name: "Prime Hydration", views: "18,600,000" },
    { src: "/landing/brands/RAW%20Nutrition.jpg", name: "RAW Nutrition", views: "41,200,000" },
    { src: "/landing/brands/Rizz%20App.jpg", name: "Rizz App", views: "57,800,000" },
    { src: "/landing/brands/YoungLA.jpg", name: "YoungLA", views: "64,500,000" },
  ];

  return (
    <>
      {/* LOADER */}
      <div id="loader">
        <div className="ldr-wrap">
          <svg className="ldr-svg" viewBox="0 0 100 94" xmlns="http://www.w3.org/2000/svg">
            <polygon className="ldr-fill" points="50,4 97,90 3,90"/>
            <polygon className="ldr-outline" points="50,4 97,90 3,90"/>
          </svg>
          <div className="ldr-glow"></div>
        </div>
        <div className="ldr-brand">Clippers<span>&nbsp;HQ</span></div>
        <div className="ldr-progress-wrap"><div className="ldr-progress-bar"></div></div>
      </div>

      <div id="vanta-bg"></div>

      {/* NAV */}
      <nav id="navbar">
        <div className="nav-inner">
          <a href="#" id="logo-home" className="logo logo--icon-only">
            <img src="/landing/logo/logo.png" alt="Clippers HQ" className="logo-img" />
          </a>
          <button className="hamburger" id="hamburger" aria-label="Toggle menu">
            <span></span><span></span><span></span>
          </button>
          <ul className="nav-links nav-pill" id="navLinks">
            <li><a href="#faq">FAQ</a></li>
            <li><Link href="/">Become a Clipper</Link></li>
            <li><a href="#footer">Contact</a></li>
            <li><a href="#book-call" className="nav-cta">Book a Call</a></li>
          </ul>
        </div>
      </nav>

      <div id="site-content">

        {/* HERO */}
        <section id="hero-main">
          <div className="hero-3d">
            <img className="hero-bg" src="/landing/hero/hero-bg.jpg" alt="" aria-hidden="true" loading="eager" />
            <div className="hero-content">
              <h1 className="hero-heading">We Turn Your<br/>Content Into<br/><em>Viral Clips</em></h1>
              <p className="hero-subtext">Full-service content clipping for brands and creators who refuse to be ignored. We extract, edit, and distribute your best moments across every short-form platform.</p>
            </div>
            <img className="hero-fg" src="/landing/hero/hero-fg.png" alt="" aria-hidden="true" loading="eager" />
          </div>
          <div className="hero-bottom-fade" aria-hidden="true"></div>
        </section>

        {/* FACES */}
        <section id="faces">
          <h2 className="section-title faces-headline reveal">Faces and brands you can&apos;t escape this month</h2>
          <div className="faces-rows-wrap">
            <div className="faces-row faces-row--left">
              <div className="faces-track">
                {faceCards([...faces, ...faces])}
              </div>
            </div>
            <div className="faces-row faces-row--right">
              <div className="faces-track">
                {faceCards([...brands, ...brands])}
              </div>
            </div>
          </div>
          <p className="faces-desc reveal">These are the creators and brands dominating your feed right now. Clipping allows them to stay everywhere at once — turning long-form content into viral distribution machines that constantly reach new audiences.</p>
        </section>

        {/* PROCESS */}
        <section id="process">
          <div className="process-inner">
            <div className="process-header reveal">
              <span className="section-label">Process</span>
              <h2 className="process-headline">Launching a campaign has never<br/>been easier</h2>
              <p className="process-subtext">Say goodbye to slow agencies. With Clippers HQ, you can launch, scale, and<br className="process-br"/> analyze your viral campaigns in record time.</p>
            </div>
            <div className="process-timeline">
              <div className="process-line"></div>
              <div className="process-row">
                <div className="process-metric reveal">
                  <span className="process-metric-num">10 Billion+</span>
                  <span className="process-metric-label">Views</span>
                  <span className="process-metric-sub">Campaign reach delivered</span>
                  <p className="process-metric-desc">Start with 3 to 5 distinct hooks and test them simultaneously.</p>
                </div>
                <div className="process-dot-wrap"><div className="process-dot"><span>1</span></div></div>
                <div className="process-card reveal">
                  <span className="process-step-label">Step</span>
                  <h3>Jump on a call with our team</h3>
                  <p>Bring yourself and your vision to a quick call. We handle strategy, campaign structure, and rollout planning from there.</p>
                </div>
              </div>
              <div className="process-row process-row--reverse">
                <div className="process-card reveal">
                  <span className="process-step-label">Step</span>
                  <h3>Launch the distribution wave</h3>
                  <p>Once live, our network of experienced clippers starts publishing for your brand. They launch wave after wave of content across TikTok, Reels, X, and YouTube Shorts to generate organic reach at scale.</p>
                </div>
                <div className="process-dot-wrap"><div className="process-dot"><span>2</span></div></div>
                <div className="process-metric reveal">
                  <span className="process-metric-num">60,000+</span>
                  <span className="process-metric-label">Clippers</span>
                  <span className="process-metric-sub">Active creator network</span>
                  <p className="process-metric-desc">Stagger posting windows to maintain momentum and broaden reach.</p>
                </div>
              </div>
              <div className="process-row">
                <div className="process-metric reveal">
                  <span className="process-metric-num">340%</span>
                  <span className="process-metric-label">Lift</span>
                  <span className="process-metric-sub">Engagement spikes</span>
                  <p className="process-metric-desc">Scale only the edits with strong hold rate and repost velocity.</p>
                </div>
                <div className="process-dot-wrap"><div className="process-dot"><span>3</span></div></div>
                <div className="process-card reveal">
                  <span className="process-step-label">Step</span>
                  <h3>Track performance in real time</h3>
                  <p>We provide a dashboard where you can track videos created, views generated, and the performance patterns shaping the next wave.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BOOK A CALL */}
        <section id="book-call" className="reveal">
          <canvas id="book-call-particles"></canvas>
          <div className="book-bg-glow"></div>
          <div className="extra-glow"></div>
          <div className="glow-purple"></div>
          <div className="glow-pink"></div>
          <div className="book-inner">
            <div className="section-label reveal">Get Started</div>
            <h2 className="book-headline reveal">Ready to become<br/>the brand everyone&apos;s<br/>talking about?</h2>
            <p className="book-desc reveal">Book a free 30-minute strategy call. We&apos;ll analyze your current presence, map out a custom distribution plan, and show you exactly what&apos;s possible.</p>
            <a href="https://calendly.com/clipershq/30min" target="_blank" rel="noopener noreferrer" className="btn-primary btn-large reveal" id="ctaBtn"><span className="btn-label">Book a Strategy Call &rarr;</span></a>
            <div className="calendly-inline-widget reveal" data-url="https://calendly.com/clipershq/30min?hide_landing_page_details=1&hide_gdpr_banner=1&background_color=111720&text_color=e8edf2&primary_color=0095f6" style={{minWidth:"320px",height:"1050px"}}></div>
            <p className="book-note reveal">No commitment. No pitch decks. Just clarity.</p>
          </div>
        </section>

        {/* CLIENTS */}
        <section id="clients">
          <div className="clients-inner">
            <div className="clients-header-row">
              <span className="clients-label">Who We Work With</span>
              <p className="clients-headline">Campaigns across every industry and niche.</p>
            </div>
            <div className="clients-list">
              {[
                { num: "01", name: "Artists", word: "VIRAL SOUNDS", title: "Artists & Musicians", body: "We turn your songs into viral distribution. We create edits using your tracks and push raw TikToks using your sound across TikTok, Reels, and Shorts — driving new listeners, new fans, and constant discovery.", tags: "TikTok · Reels · Shorts · Fan Growth" },
                { num: "02", name: "Creators", word: "CLIPPING", title: "Creators & Streamers", body: "We take your long-form content and turn it into a high-volume clip engine. Podcasts, streams, YouTube videos — we cut, optimize, and distribute at scale to generate millions of views.", tags: "Podcasts · Streams · YouTube · Distribution" },
                { num: "03", name: "Products", word: "HOOKS", title: "Products & E-commerce", body: "We turn products into scroll-stopping content. From UGC-style clips to fast viral edits, we create content that drives attention and conversions across short-form platforms.", tags: "Product Demos · UGC · Conversion · Discovery" },
                { num: "04", name: "Brands", word: "DISTRIBUTION", title: "Brands & B2B", body: "We turn your brand message into a distribution system. Instead of relying on ads, we create organic short-form content that spreads across platforms and builds awareness at scale.", tags: "Brand Awareness · Organic · B2B · Scale" },
                { num: "05", name: "Apps / Startups", word: "GROWTH", title: "Apps & Startups", body: "We help apps grow through viral distribution. From launch clips to founder content, we turn your product into content that spreads and brings in users organically.", tags: "Product Launches · Founders · Organic Growth" },
              ].map((c) => (
                <div key={c.num} className="clients-item" data-bg-word={c.word} data-preview-title={c.title} data-preview-body={c.body} data-preview-tags={c.tags}>
                  <span className="clients-num">{c.num}</span>
                  <span className="clients-name">{c.name}</span>
                  <span className="clients-arrow">↗</span>
                </div>
              ))}
            </div>
          </div>
          <div id="clientsPreview" className="clients-preview" aria-hidden="true">
            <div className="clients-preview-title"></div>
            <div className="clients-preview-body"></div>
            <div className="clients-preview-tags"></div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq">
          <div className="section-label reveal">FAQ</div>
          <h2 className="section-title reveal">Frequently asked<br/>questions</h2>
          <div className="faq-list">
            {[
              { q: "What services do you offer?", a: "We offer end-to-end content clipping, short-form distribution, organic growth strategy, and performance analytics. Think of us as a full clip production department embedded into your brand." },
              { q: "Who is this service for?", a: "We work best with brands and founders who are already producing long-form content — podcasts, interviews, webinars, streams — and want to extract maximum value from it across short-form platforms." },
              { q: "How long does it take to see results?", a: "Most clients see measurable reach increases within 2–3 weeks. Significant momentum builds by week 6–8. Full-scale results — viral moments, compounding audiences — emerge in months 2–3 as the distribution flywheel gains speed." },
              { q: "How does the collaboration work?", a: "After onboarding, you get a dedicated strategist, a clipping team, and access to our analytics dashboard. We meet weekly, you approve clip batches, and we handle distribution from there." },
              { q: "What platforms do you distribute on?", a: "We distribute across TikTok, Instagram Reels, YouTube Shorts, LinkedIn, and Twitter/X. The mix is determined by your audience and niche — we'll map the right channels in your strategy call." },
            ].map((faq, i) => (
              <div key={i} className="faq-item reveal">
                <button className="faq-question" aria-expanded="false">{faq.q}<span className="faq-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg></span></button>
                <div className="faq-answer"><p>{faq.a}</p></div>
              </div>
            ))}
          </div>
        </section>

        {/* FOOTER */}
        <footer id="footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <Link href="/brands" className="logo"><img src="/landing/logo/logo.png" alt="Clippers HQ" className="logo-img" /><span className="logo-text">Clippers HQ</span></Link>
              <p className="footer-tagline">The content clipping engine for ambitious brands.</p>
              <div className="social-links">
                <a href="https://www.instagram.com/clipper.hq/" aria-label="Instagram" target="_blank" rel="noopener noreferrer"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg></a>
                <a href="https://discord.gg/" aria-label="Discord" target="_blank" rel="noopener noreferrer"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.01.02.026.05.045.063a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg></a>
              </div>
            </div>
            <div className="footer-links">
              <div className="footer-col"><h4>Company</h4><ul><li><a href="https://calendly.com/clipershq/30min" target="_blank" rel="noopener noreferrer">Contact</a></li></ul></div>
              <div className="footer-col"><h4>Services</h4><ul><li><a href="#">Content Clipping</a></li><li><a href="#">Distribution</a></li><li><a href="#">Campaign Scaling</a></li><li><a href="#">Analytics</a></li></ul></div>
              <div className="footer-col"><h4>Legal</h4><ul><li><a href="#">Privacy Policy</a></li><li><a href="#">Terms of Service</a></li><li><a href="#">Cookie Policy</a></li></ul></div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2025 Clippers HQ. All rights reserved.</p>
            <p>Built for brands that refuse to be ignored.</p>
          </div>
        </footer>

      </div>
    </>
  );
}
