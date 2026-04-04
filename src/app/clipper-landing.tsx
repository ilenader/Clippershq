"use client";

import { useEffect } from "react";
import Link from "next/link";
import "./landing.css";
import "./landing-clipper.css";

export function ClipperLanding() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/landing/script.js";
    script.async = true;
    document.body.appendChild(script);
    return () => { try { document.body.removeChild(script); } catch {} };
  }, []);

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

      {/* METEOR BACKGROUND */}
      <div id="vanta-bg"></div>

      {/* NAV */}
      <nav id="navbar">
        <div className="nav-inner">
          <Link href="/" className="logo">
            <img src="/landing/logo/logo.png" alt="Clippers HQ" className="logo-img" />
            <span className="logo-text">Clippers HQ</span>
          </Link>
          <button className="hamburger" id="hamburger" aria-label="Toggle menu">
            <span></span><span></span><span></span>
          </button>
          <ul className="nav-links nav-pill" id="navLinks">
            <li><Link href="/brands">Home</Link></li>
            <li><Link href="/brands#faq">Blog</Link></li>
            <li><Link href="/" style={{color:"var(--white)"}}>Become a Clipper</Link></li>
            <li><a href="https://calendly.com/clipershq/30min" target="_blank" rel="noopener noreferrer" className="nav-cta">Book a Call</a></li>
          </ul>
        </div>
      </nav>

      {/* HERO */}
      <section className="clipper-hero">
        <div className="clipper-hero-glow-1"></div>

        {/* LEFT PHONE */}
        <div className="hero-phone hero-phone--left">
          <div className="phone-shell">
            <div className="phone-notch"></div>
            <span className="phone-btn phone-btn--vol-up"></span>
            <span className="phone-btn phone-btn--vol-down"></span>
            <span className="phone-btn phone-btn--power"></span>
            <video className="phone-video" src="/landing/videos/video-left.mp4" autoPlay muted loop playsInline></video>
          </div>
        </div>

        {/* RIGHT PHONE */}
        <div className="hero-phone hero-phone--right">
          <div className="phone-shell">
            <div className="phone-notch"></div>
            <span className="phone-btn phone-btn--vol-up"></span>
            <span className="phone-btn phone-btn--vol-down"></span>
            <span className="phone-btn phone-btn--power"></span>
            <video className="phone-video" src="/landing/videos/video-right.mp4" autoPlay muted loop playsInline></video>
          </div>
        </div>

        <div className="clipper-hero-inner">
          <div className="clipper-badge reveal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            We&apos;re hiring clippers
          </div>
          <h1 className="clipper-headline reveal">
            Turn your editing skills<br/>into <em>real income.</em>
          </h1>
          <p className="clipper-sub reveal">
            Join the Clippers HQ network. Work on content for top brands and creators, set your own hours, and get paid for every clip.
          </p>
          <div className="reveal">
            <a href="https://discord.gg/CM8xdenGYf" target="_blank" rel="noopener noreferrer" className="discord-cta">
              <svg width="26" height="20" viewBox="0 0 24 18" fill="currentColor">
                <path d="M20.317 1.492a19.84 19.84 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.31 18.31 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 1.492a.07.07 0 00-.032.027C.533 5.902-.32 10.18.099 14.4a.082.082 0 00.031.056 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 11.78c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Join Our Discord Server
            </a>
          </div>
        </div>
      </section>

      {/* WHAT YOU GET */}
      <section className="perks-section">
        <div className="section-label reveal">Benefits</div>
        <h2 className="section-title reveal">What you get as<br/>a Clippers HQ editor</h2>
        <div className="perks-grid">
          <div className="perk-card reveal">
            <div className="perk-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            </div>
            <h3>Competitive Pay</h3>
            <p>Earn per clip delivered. The more you produce, the more you make — no caps, no ceilings.</p>
          </div>
          <div className="perk-card reveal">
            <div className="perk-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h3>Work On Your Schedule</h3>
            <p>Fully remote, fully flexible. Work when it suits you — whether that&apos;s full-time or a few hours a week.</p>
          </div>
          <div className="perk-card reveal">
            <div className="perk-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            </div>
            <h3>Real Brand Experience</h3>
            <p>Build a portfolio with work on actual brand campaigns. Our clients are the kind of names you want on your resume.</p>
          </div>
          <div className="perk-card reveal">
            <div className="perk-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.21 10.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012.12 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.46-.46a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z"/></svg>
            </div>
            <h3>Direct Communication</h3>
            <p>We stay in constant contact with our clippers. Fast replies, clear briefs, and real feedback — always through Discord.</p>
          </div>
          <div className="perk-card reveal">
            <div className="perk-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <h3>Skill Growth</h3>
            <p>Learn what makes clips go viral. Get feedback from senior editors and level up your short-form instincts fast.</p>
          </div>
          <div className="perk-card reveal">
            <div className="perk-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <h3>Trusted Network</h3>
            <p>Join a vetted community of editors. Top performers get priority access to premium projects and higher rates.</p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="steps-section">
        <div className="steps-inner">
          <div className="section-label reveal">Process</div>
          <h2 className="section-title reveal">How it works</h2>
          <div className="steps-list">
            <div className="step-item reveal">
              <div className="step-num">01</div>
              <div className="step-content">
                <h3>Join the Discord</h3>
                <p>Click the button above and join our private Discord server. This is where everything happens — briefs, feedback, payments.</p>
              </div>
            </div>
            <div className="step-item reveal">
              <div className="step-num">02</div>
              <div className="step-content">
                <h3>Share your portfolio</h3>
                <p>Send us examples of your previous edits — TikToks, Reels, Shorts, anything that shows your style. Quality over quantity.</p>
              </div>
            </div>
            <div className="step-item reveal">
              <div className="step-num">03</div>
              <div className="step-content">
                <h3>Get reviewed &amp; onboarded</h3>
                <p>Our team reviews your portfolio within 48 hours. If it&apos;s a fit, you&apos;re in — access to projects starts immediately.</p>
              </div>
            </div>
            <div className="step-item reveal">
              <div className="step-num">04</div>
              <div className="step-content">
                <h3>Pick up projects &amp; get paid</h3>
                <p>Browse available briefs, claim what fits your schedule, deliver on time, and get paid. Simple as that.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* REQUIREMENTS */}
      <section className="requirements-section">
        <div className="section-label reveal">Requirements</div>
        <h2 className="section-title reveal">What we look for</h2>
        <div className="req-grid">
          {[
            "Experience with Premiere Pro, CapCut, or DaVinci Resolve",
            "Understanding of short-form content (TikTok, Reels, Shorts)",
            "Ability to meet deadlines and communicate clearly",
            "Reliable internet connection and own editing setup",
            "Attention to pacing, captions, and hook creation",
            "Active Discord account to receive and discuss briefs",
          ].map((text, i) => (
            <div key={i} className="req-item reveal">
              <div className="req-check">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="clipper-cta-section">
        <div className="clipper-cta-glow"></div>
        <div className="section-label reveal" style={{display:"block",textAlign:"center"}}>Ready?</div>
        <h2 className="reveal">One click to get started.</h2>
        <p className="reveal">Join the Discord, introduce yourself, and we&apos;ll take it from there. No lengthy applications.</p>
        <div className="reveal">
          <a href="https://discord.gg/CM8xdenGYf" target="_blank" rel="noopener noreferrer" className="discord-cta">
            <svg width="26" height="20" viewBox="0 0 24 18" fill="currentColor">
              <path d="M20.317 1.492a19.84 19.84 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.31 18.31 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 1.492a.07.07 0 00-.032.027C.533 5.902-.32 10.18.099 14.4a.082.082 0 00.031.056 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 11.78c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Join Our Discord Server
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer id="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Link href="/" className="logo"><img src="/landing/logo/logo.png" alt="Clippers HQ" className="logo-img" /><span className="logo-text">Clippers HQ</span></Link>
            <p className="footer-tagline">The content clipping engine for ambitious brands.</p>
            <div className="social-links">
              <a href="#" aria-label="Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg></a>
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
    </>
  );
}
