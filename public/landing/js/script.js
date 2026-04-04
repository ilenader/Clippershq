document.documentElement.style.scrollBehavior = 'smooth';

(function(){
  var leaving = false;

  document.documentElement.classList.remove('page-transitioning');
  document.body.classList.remove('page-enter','page-enter-active','page-exit');

  function go(url){
    if(leaving) return;
    leaving = true;
    sessionStorage.setItem('pt-entry','1');
    window.location.href = url;
  }

  document.addEventListener('click',function(e){
    if(leaving){e.preventDefault();e.stopImmediatePropagation();return;}
    var a = e.target.closest('a[href]');
    if(!a) return;
    if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
    if(a.getAttribute('target')==='_blank') return;
    var href = a.getAttribute('href');
    if(!href||href==='') return;
    if(href[0]==='#') return;
    if(/^[a-z][a-z0-9+\-.]*:/i.test(href)) return;
    var url;
    try{url=new URL(href,window.location.href);}catch(err){return;}
    if(url.origin!==window.location.origin) return;
    var tp = url.pathname.split('/').pop()||'index.html';
    var cp = window.location.pathname.split('/').pop()||'index.html';
    if(tp!=='index.html'&&tp!=='clipper.html') return;
    if(tp===cp) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    go(url.href);
  },true);
})();





document.addEventListener('DOMContentLoaded', () => {

  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      requestAnimationFrame(() => {
        if (window.scrollY > 120) {
          navbar.classList.add('floating');
        } else {
          navbar.classList.remove('floating');
        }
      });
    }, { passive: true });
  }

  const heroMain = document.getElementById('hero-main');
  if (heroMain) {
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      const speed = 0.35;
      heroMain.style.transform = `translate3d(0, -${scrollY * speed}px, 0)`;
    }, { passive: true });
  }

  const ctaBtn     = document.getElementById('ctaBtn');
  const bookSection = document.getElementById('book-call');
  if (ctaBtn && bookSection) {
    window.addEventListener('scroll', () => {
      const rect = bookSection.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.5) {
        ctaBtn.style.display = 'none';
      } else {
        ctaBtn.style.display = 'inline-flex';
      }
    }, { passive: true });
  }

  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('open');
        navLinks.classList.remove('open');
      });
    });
    document.addEventListener('click', (e) => {
      if (navbar && !navbar.contains(e.target)) {
        hamburger.classList.remove('open');
        navLinks.classList.remove('open');
      }
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;
      if (href === '#hero' || href === '#hero-main') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const offset = target.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: offset, behavior: 'smooth' });
    });
  });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const siblings = [...entry.target.parentElement.children].filter(el => el.classList.contains('reveal'));
        const idx = siblings.indexOf(entry.target);
        entry.target.style.transitionDelay = Math.min(idx * 0.09, 0.45) + 's';
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  const headline = document.querySelector('.hero-headline');
  if (headline) {
    const raw = headline.innerHTML;
    let result = '';
    let inTag = false;
    let charDelay = 0;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '<') { inTag = true; result += raw[i]; continue; }
      if (raw[i] === '>') { inTag = false; result += raw[i]; continue; }
      if (inTag) { result += raw[i]; continue; }
      if (raw[i] === ' ') { result += raw[i]; continue; }
      result += `<span class="char" style="display:inline-block;opacity:0;transform:translateY(32px) rotate(2deg);animation:charIn 0.55s cubic-bezier(0.2,0,0,1) ${3.3 + charDelay * 0.03}s forwards">${raw[i]}</span>`;
      charDelay++;
    }
    headline.innerHTML = result;
  }

  const badge = document.querySelector('.hero-badge');
  if (badge) {
    badge.style.cssText += ';opacity:0;transform:translateY(-14px) scale(0.95);animation:badgeIn 0.6s cubic-bezier(0.2,0,0,1) 3.1s forwards';
  }

  const ctas = document.querySelector('.hero-ctas');
  if (ctas) {
    ctas.querySelectorAll('a, button').forEach((btn, i) => {
      btn.style.cssText += `;opacity:0;transform:translateY(18px);animation:fadeUp 0.55s ease ${3.85 + i * 0.13}s forwards`;
    });
  }

  const heroVideo  = document.getElementById('heroVideo');
  const vslOverlay = document.getElementById('vslOverlay');
  const vslPlayBtn = document.getElementById('vslPlayBtn');
  const playBtn    = document.getElementById('playBtn');
  const playVideo = () => {
    if (!heroVideo) return;
    heroVideo.play()
      .then(() => { if (vslOverlay) vslOverlay.classList.add('hidden'); })
      .catch(() => { if (vslOverlay) vslOverlay.classList.add('hidden'); });
  };
  if (vslPlayBtn) vslPlayBtn.addEventListener('click', playVideo);
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const hero = document.getElementById('hero');
      if (hero) hero.scrollIntoView({ behavior: 'smooth' });
      setTimeout(playVideo, 600);
    });
  }
  if (heroVideo) heroVideo.addEventListener('ended', () => { if (vslOverlay) vslOverlay.classList.remove('hidden'); });

  document.querySelectorAll('.faq-item').forEach(item => {
    item.querySelector('.faq-question').addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => {
        i.classList.remove('open');
        i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('open');
        item.querySelector('.faq-question').setAttribute('aria-expanded', 'true');
      }
    });
  });

  const animateCounter = (el, target, suffix, duration) => {
    const start = performance.now();
    const isDecimal = target % 1 !== 0;
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (isDecimal ? (eased * target).toFixed(1) : Math.round(eased * target)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const match = el.textContent.trim().match(/^([0-9.]+)(.*)$/);
        if (match) animateCounter(el, parseFloat(match[1]), match[2], 1800);
        statsObserver.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('.stat-num').forEach(el => statsObserver.observe(el));

  if (window.matchMedia('(pointer: fine)').matches) {
    const glow = document.createElement('div');
    Object.assign(glow.style, {
      position: 'fixed', width: '400px', height: '400px',
      borderRadius: '50%', pointerEvents: 'none', zIndex: '9998',
      background: 'radial-gradient(circle, rgba(0,149,246,0.04) 0%, transparent 70%)',
      transform: 'translate(-50%, -50%)', top: '0', left: '0',
    });
    document.body.appendChild(glow);
    let mx = 0, my = 0, gx = 0, gy = 0;
    document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
    const animGlow = () => {
      gx += (mx - gx) * 0.07; gy += (my - gy) * 0.07;
      glow.style.left = gx + 'px'; glow.style.top = gy + 'px';
      requestAnimationFrame(animGlow);
    };
    animGlow();
  }

  document.querySelectorAll('.service-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width  - 0.5) * 10;
      const y = ((e.clientY - r.top)  / r.height - 0.5) * 10;
      card.style.transform = `perspective(900px) rotateY(${x}deg) rotateX(${-y}deg) translateY(-6px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });

  document.querySelectorAll('.section-title').forEach(title => {
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { title.classList.add('title-wipe'); obs.unobserve(title); }
    }, { threshold: 0.3 });
    obs.observe(title);
  });

  const sections   = document.querySelectorAll('section[id]');
  const navAnchors = document.querySelectorAll('.nav-links a');
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => { if (s.getBoundingClientRect().top <= 120) current = s.id; });
    navAnchors.forEach(a => {
      a.style.color = '';
      if (a.getAttribute('href') === '#' + current) a.style.color = 'var(--white)';
    });
  }, { passive: true });

  document.querySelectorAll('.stat-num').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const match = el.textContent.trim().match(/^([0-9.]+)(.*)$/);
      if (match) animateCounter(el, parseFloat(match[1]), match[2], 500);
    });
  });

  (function() {
    const triangle = document.getElementById('heroTriangle');
    if (!triangle) return;
    setInterval(() => {
      triangle.classList.add('hero-triangle--tick');
      setTimeout(() => triangle.classList.remove('hero-triangle--tick'), 120);
    }, 4500);
  })();

  (function() {
    const headline = document.querySelector('.hero-main-headline');
    if (!headline) return;
    headline.classList.add('animate-in');
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          headline.classList.remove('animate-in');
          void headline.offsetWidth;
          headline.classList.add('animate-in');
        }
      });
    }, { threshold: 0.3 });
    obs.observe(headline);
  })();

  (function() {
    const hero      = document.getElementById('hero-main');
    const headline  = hero && hero.querySelector('.hero-main-headline');
    const subtext   = hero && hero.querySelector('.hero-subtext');
    const billboard = hero && hero.querySelector('.hero-billboard');
    if (!hero || !billboard) return;

    function updateHero() {
      const rect = hero.getBoundingClientRect();
      const vh   = window.innerHeight;
      const progress = Math.min(Math.max((vh - rect.top) / (vh * 1.8), 0), 1);

      const heroCenter = hero.querySelector('.hero-center');
      if (heroCenter) {
        if (rect.top >= 0) {
          heroCenter.style.opacity = '1';
        } else {
          heroCenter.style.opacity = String(Math.max(1 - progress * 1.2, 0));
        }
      }

      if (headline) {
        headline.style.transform = `translateY(${-progress * 60}px)`;
        headline.style.opacity   = String(Math.max(1 - progress * 1.4, 0));
      }
      if (subtext) {
        subtext.style.transform  = `translateY(${-progress * 40}px)`;
        subtext.style.opacity    = String(Math.max(1 - progress * 1.8, 0));
      }
      const bx = progress < 0.5
        ? 100 - (progress / 0.5) * 100
        : -((progress - 0.5) / 0.5) * 18;
      billboard.style.transform = `translateX(${bx}%)`;
      billboard.style.opacity   = String(Math.min(progress * 4, 0.08));
    }

    let heroRafPending = false;
    function onHeroScroll() {
      if (heroRafPending) return;
      heroRafPending = true;
      requestAnimationFrame(() => {
        heroRafPending = false;
        updateHero();
      });
    }
    window.addEventListener('scroll', onHeroScroll, { passive: true });
    updateHero();
  })();

  (function() {
    const section  = document.getElementById('process');
    const line     = section && section.querySelector('.process-line');
    const cards    = section && [...section.querySelectorAll('.process-card')];
    const rows     = section && [...section.querySelectorAll('.process-row')];
    if (!section || !line || !cards.length) return;

    const progress = document.createElement('div');
    progress.className = 'process-progress';
    line.appendChild(progress);

    let activeIdx = -1;

    function updateProcess() {
      const rect         = section.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      const raw = (windowHeight - rect.top) / (rect.height + windowHeight);
      const pct = Math.min(Math.max(raw, 0), 1);
      progress.style.height = (pct * 100) + '%';

      const viewMid = window.scrollY + windowHeight * 0.55;
      let newActive = -1;
      rows.forEach((row, i) => {
        const rowTop    = row.getBoundingClientRect().top + window.scrollY;
        const rowBottom = rowTop + row.offsetHeight;
        if (viewMid >= rowTop && viewMid <= rowBottom) newActive = i;
      });

      if (newActive !== activeIdx) {
        cards.forEach((c, i) => c.classList.toggle('process-card--active', i === newActive));
        activeIdx = newActive;
      }
    }

    window.addEventListener('scroll', updateProcess, { passive: true });
    updateProcess();
  })();

  (function() {
    const preview   = document.getElementById('clientsPreview');
    if (!preview) return;
    const items     = document.querySelectorAll('.clients-item');
    const titleEl   = preview.querySelector('.clients-preview-title');
    const bodyEl    = preview.querySelector('.clients-preview-body');
    const tagsEl    = preview.querySelector('.clients-preview-tags');

    items.forEach(item => {
      const word = item.dataset.bgWord;
      if (word) {
        const span = document.createElement('span');
        span.className = 'clients-bg-word';
        span.textContent = word;
        item.appendChild(span);
      }
    });

    let curX = 0, curY = 0;
    let tgtX = 0, tgtY = 0;
    let rafId = null;
    let active = false;

    function lerp(a, b, t) { return a + (b - a) * t; }
    function tick() {
      curX = lerp(curX, tgtX, 0.12);
      curY = lerp(curY, tgtY, 0.12);
      const cx = Math.min(curX + 28, window.innerWidth  - 320);
      const cy = Math.max(curY - 20, 8);
      preview.style.transform = `translate(${cx}px, ${cy}px) scale(1)`;
      if (active) rafId = requestAnimationFrame(tick);
    }

    document.addEventListener('mousemove', (e) => {
      tgtX = e.clientX;
      tgtY = e.clientY;
    });

    items.forEach(item => {
      item.addEventListener('mouseenter', () => {
        titleEl.textContent = item.dataset.previewTitle || '';
        bodyEl.textContent  = item.dataset.previewBody  || '';
        tagsEl.textContent  = item.dataset.previewTags  || '';
        active = true;
        preview.classList.add('visible');
        if (!rafId) rafId = requestAnimationFrame(tick);
      });
      item.addEventListener('mouseleave', () => {
        active = false;
        preview.classList.remove('visible');
        rafId = null;
      });
    });
  })();

});

(function() {
  const s = document.createElement('style');
  s.textContent = `
    @keyframes charIn  { to { opacity:1; transform:translateY(0) rotate(0deg); } }
    @keyframes badgeIn { to { opacity:1; transform:translateY(0) scale(1); } }
    @keyframes fadeUp  { to { opacity:1; transform:translateY(0); } }
    .title-wipe { position: relative; }
    .title-wipe::after {
      content:''; position:absolute; bottom:-8px; left:0; height:2px; width:0;
      background:linear-gradient(90deg,var(--accent),transparent);
      animation:wipeIn 0.9s cubic-bezier(0.4,0,0.2,1) 0.15s forwards;
    }
    @keyframes wipeIn { to { width:55%; } }
  `;
  document.head.appendChild(s);
})();

// Meteor/background animation deferred until after page load — never blocks first paint
window.addEventListener('load', function() {
  var bg = document.getElementById('vanta-bg');
  if (!bg) return;

  var COUNT    = 20;
  var ANGLE    = 215;
  var COLOR    = '#ffffff';
  var TAIL_W   = 80;

  var style = document.createElement('style');
  style.textContent = [
    '@keyframes meteor-fall{',
    '  0%  { transform: rotate(' + ANGLE + 'deg) translateX(0); opacity:1; }',
    '  70% { opacity:1; }',
    '  100%{ transform: rotate(' + ANGLE + 'deg) translateX(-100vmax); opacity:0; }',
    '}',
    '#vanta-bg { position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; background:#080c10; }',
    '.meteor-dot { position:absolute; top:-40px; width:4px; height:4px; border-radius:50%; background:' + COLOR + '; box-shadow:0 0 10px 3px rgba(255,255,255,0.9); }',
    '.meteor-tail { position:absolute; top:50%; transform:translateY(-50%); left:100%; width:' + TAIL_W + 'px; height:2px; opacity:0.9; }',
  ].join('');
  document.head.appendChild(style);

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 0%,rgba(30,40,60,0.3) 0%,transparent 50%),radial-gradient(ellipse at 100% 100%,rgba(20,20,40,0.2) 0%,transparent 50%);';
  bg.appendChild(overlay);

  for (var i = 0; i < COUNT; i++) {
    var dot = document.createElement('span');
    dot.className = 'meteor-dot';
    var left     = i * (100 / COUNT);
    var delay    = (Math.random() * 5).toFixed(2);
    var duration = (3 + Math.random() * 7).toFixed(2);
    dot.style.cssText = 'left:' + left + '%;animation:meteor-fall ' + duration + 's linear ' + delay + 's infinite;';

    var tail = document.createElement('span');
    tail.className = 'meteor-tail';
    tail.style.background = 'linear-gradient(to right,' + COLOR + ',transparent)';
    dot.appendChild(tail);
    bg.appendChild(dot);
  }

  var vignette = document.createElement('div');
  vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 0%,transparent 50%,rgba(10,10,15,0.8) 100%);';
  bg.appendChild(vignette);
});