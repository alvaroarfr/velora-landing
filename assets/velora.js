/* Velora, standalone build.
   The canvas runtime is gone: this is the same logic class, constructed once
   against the real DOM. Refs resolve from data-ref, props are the canvas
   defaults frozen in. */
(function () {
  'use strict';
  var React = { createRef: function () { return { current: null }; } };
  class DCLogic {
    constructor(props) { this.props = props || {}; }
  }
  var PROPS = { accent: '#E8E3D9', grain: true, motion: 'cinematic', priceDefault: 'monthly' };


  class Component extends DCLogic {
    constructor(props) {
      super(props);
      this.rootRef = React.createRef();
      this.navRef = React.createRef();
      this.heroRef = React.createRef();
      this.heroImgRef = React.createRef();
      this.heroVideoRef = React.createRef();
      this.ctaImgRef = React.createRef();
      this.canvasRef = React.createRef();
      this.openFaq = null;
    }

    renderVals() {
      return {
        heroVideoRef: this.heroVideoRef,
        rootRef: this.rootRef,
        navRef: this.navRef,
        heroRef: this.heroRef,
        heroImgRef: this.heroImgRef,
        ctaImgRef: this.ctaImgRef,
        canvasRef: this.canvasRef
      };
    }

    componentDidMount() {
      const accent = this.props.accent || '#E8E3D9';
      document.documentElement.style.setProperty('--accent', accent);
      this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.loadHeroVideo();
      this.motion = this.props.motion || 'cinematic';
      this.menuOpen = false;
      this.wireNav();
      this.wireDelegates();
      this.wireSectionSpy(0);
      this.wireMarquees(0);

      if ((this.props.grain !== false) && !this.reduced && this.canAffordGrain()) this.initGrain();
      this.waitForGsap(0);
    }

    /* Start the clip as early as the element exists. The connection is already warm
       from the preconnect in the head; a metered or 2G visitor never pays for it. */
    loadHeroVideo() {
      const v = this.heroVideoRef.current;
      if (!v || this._videoStarted) return;
      this._videoStarted = true;
      v.muted = true;
      v.src = "assets/video-a1b2c3d4.mp4";
      if (this.reduced) { v.removeAttribute('loop'); v.load(); return; }
      const play = v.play();
      if (play && play.catch) play.catch(() => {});
    }

    componentDidUpdate(prev) {
      if (prev.accent !== this.props.accent) {
        document.documentElement.style.setProperty('--accent', this.props.accent || '#E8E3D9');
      }
    }

    componentWillUnmount() {
      if (this.onClick && this.rootRef.current) this.rootRef.current.removeEventListener('click', this.onClick);
      if (this.onScroll) window.removeEventListener('scroll', this.onScroll);
      if (this.onResize) window.removeEventListener('resize', this.onResize);
      if (this.onNavResize) window.removeEventListener('resize', this.onNavResize);
      if (this.onMenuKey) document.removeEventListener('keydown', this.onMenuKey);
      if (this._menuHide) clearTimeout(this._menuHide);
      if (this._videoTimer) clearTimeout(this._videoTimer);
      if (this._heroSettle) clearTimeout(this._heroSettle);
      if (this._revealGuard) clearTimeout(this._revealGuard);
      if (this.onHeroVisibility) document.removeEventListener('visibilitychange', this.onHeroVisibility);
      if (this.onLoadMeasure) window.removeEventListener('load', this.onLoadMeasure);
      if (this.deskQuery && this.onDesk) { if (this.deskQuery.removeEventListener) this.deskQuery.removeEventListener('change', this.onDesk); else if (this.deskQuery.removeListener) this.deskQuery.removeListener(this.onDesk); }
      document.documentElement.classList.remove('velora-locked');
      if (this.marqueeIO) this.marqueeIO.disconnect();
      if (this.raf) cancelAnimationFrame(this.raf);
      if (window.ScrollTrigger && this.triggers) this.triggers.forEach(t => t.kill && t.kill());
    }

    canAffordGrain() {
      const conn = navigator.connection || {};
      if (conn.saveData === true) return false;
      if (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2) return false;
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (coarse && typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4) return false;
      return true;
    }

    /* ---------- nav ---------- */
    wireNav() {
      const nav = this.navRef.current;
      if (!nav) return;
      let glass = null;
      const measure = () => {
        document.documentElement.style.setProperty('--velora-nav-h', Math.round(nav.getBoundingClientRect().height) + 'px');
      };
      this.setGlass = (on) => {
        if (on === glass) return;
        glass = on;
        if (on) nav.setAttribute('data-scrolled', '');
        else nav.removeAttribute('data-scrolled');
        measure();
      };
      this.onScroll = () => {
        this.setGlass(window.scrollY > 40 || this.menuOpen === true);
        this.syncCurrent();
      };
      window.addEventListener('scroll', this.onScroll, { passive: true });
      this.onNavResize = () => {
        measure();
        this.measureSections();
        this.syncCurrent();
        if (this.menuOpen && window.innerWidth >= 820) this.closeMenu(true);
      };
      window.addEventListener('resize', this.onNavResize);
      if (window.matchMedia) {
        this.deskQuery = window.matchMedia('(min-width: 820px)');
        this.onDesk = (e) => { if (e.matches && this.menuOpen) this.closeMenu(true); };
        if (this.deskQuery.addEventListener) this.deskQuery.addEventListener('change', this.onDesk);
        else if (this.deskQuery.addListener) this.deskQuery.addListener(this.onDesk);
      }
      this.onScroll();
      measure();
      /* webfont metrics change the bar height, so the sheet offset is measured again
         once the faces are in */
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    }

    /* ---------- mobile menu ---------- */
    menuEls() {
      const root = this.rootRef.current;
      if (!root) return null;
      const menu = root.querySelector('#velora-menu');
      const toggle = root.querySelector('[data-menu="toggle"]');
      return (menu && toggle) ? { root: root, menu: menu, toggle: toggle } : null;
    }

    menuFocusables() {
      const els = this.menuEls();
      if (!els) return [];
      const inside = [].slice.call(els.menu.querySelectorAll('a[href], button:not([disabled])'));
      return [els.toggle].concat(inside).filter(el => el.getClientRects().length > 0);
    }

    toggleMenu() {
      if (this.menuOpen) this.closeMenu(); else this.openMenu();
    }

    openMenu() {
      const els = this.menuEls();
      if (!els || this.menuOpen) return;
      const menu = els.menu, toggle = els.toggle, nav = this.navRef.current;
      this.menuOpen = true;
      toggle.setAttribute('aria-expanded', 'true');
      if (nav) nav.setAttribute('data-menu-open', '');
      document.documentElement.classList.add('velora-locked');
      this.setInert(true);
      if (this.setGlass) this.setGlass(true);

      /* the sheet is visible the moment it opens; the stagger is opted into only
         when this document can actually animate its way back out of it. */
      const animate = !this.reduced && document.visibilityState === 'visible';
      if (animate) menu.setAttribute('data-enter', '');
      menu.setAttribute('data-open', '');
      if (animate) {
        const release = () => menu.removeAttribute('data-enter');
        requestAnimationFrame(() => requestAnimationFrame(release));
        setTimeout(release, 90);
      }

      this.onMenuKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); return this.closeMenu(); }
        if (e.key !== 'Tab') return;
        const f = this.menuFocusables();
        if (f.length < 2) return;
        const first = f[0], last = f[f.length - 1], active = document.activeElement;
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
        else if (active !== toggle && !menu.contains(active)) { e.preventDefault(); first.focus(); }
      };
      document.addEventListener('keydown', this.onMenuKey);
    }

    closeMenu(silent) {
      const els = this.menuEls();
      if (!els || !this.menuOpen) return;
      const menu = els.menu, toggle = els.toggle, nav = this.navRef.current;
      this.menuOpen = false;
      if (nav) nav.removeAttribute('data-menu-open');
      menu.removeAttribute('data-open');
      menu.removeAttribute('data-enter');
      toggle.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.remove('velora-locked');
      this.setInert(false);
      if (this.onMenuKey) { document.removeEventListener('keydown', this.onMenuKey); this.onMenuKey = null; }
      if (!silent && menu.contains(document.activeElement)) toggle.focus();
      if (this.onScroll) this.onScroll();
    }

    setInert(on) {
      const root = this.rootRef.current;
      if (!root || !('inert' in HTMLElement.prototype)) return;
      root.querySelectorAll('[data-screen-label]').forEach(el => { el.inert = on; });
    }

    /* A 66s infinite transform keeps a compositor layer busy for as long as the tab
       lives. Off-screen it buys nothing, so park it. */
    wireMarquees(tries) {
      const root = this.rootRef.current;
      if (!root || typeof IntersectionObserver === 'undefined') return;
      const tracks = root.querySelectorAll('.velora-marquee-track');
      if (!tracks.length) {
        if ((tries || 0) < 40) setTimeout(() => this.wireMarquees((tries || 0) + 1), 120);
        return;
      }
      this.marqueeIO = new IntersectionObserver((entries) => {
        entries.forEach(e => { e.target.style.animationPlayState = e.isIntersecting ? 'running' : 'paused'; });
      }, { rootMargin: '200px 0px' });
      tracks.forEach(tr => this.marqueeIO.observe(tr));
    }

    /* ---------- which section am I in ---------- */
    wireSectionSpy(tries) {
      const root = this.rootRef.current;
      if (!root) return;
      const ids = ['product', 'features', 'workflow', 'pricing', 'gallery'];
      const sections = ids.map(id => root.querySelector('#' + id)).filter(Boolean);
      if (sections.length < ids.length && (tries || 0) < 40) {
        setTimeout(() => this.wireSectionSpy((tries || 0) + 1), 120);
      }
      if (!sections.length) return;
      this.sections = sections;
      this.measureSections();
      this.syncCurrent();
      if (!this._measureBound) {
        this._measureBound = true;
        this.onLoadMeasure = () => { this.measureSections(); this.syncCurrent(); };
        window.addEventListener('load', this.onLoadMeasure);
      }
    }

    measureSections() {
      if (!this.sections) return;
      const sy = window.scrollY;
      this._tops = this.sections.map(s => s.getBoundingClientRect().top + sy);
    }

    syncCurrent() {
      const root = this.rootRef.current;
      if (!root || !this.sections || !this._tops) return;
      /* pure scroll arithmetic: no layout is read while scrolling */
      const line = window.scrollY + window.innerHeight * 0.4;
      let current = null;
      this.sections.forEach((s, i) => { if (this._tops[i] <= line) current = s.id; });
      if (current === this._current) return;
      this._current = current;
      root.querySelectorAll('[data-navlink]').forEach(a => {
        if (current && a.getAttribute('data-navlink') === current) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    }

    /* ---------- delegated interaction (streamed nodes may arrive after mount) ---------- */
    wireDelegates() {
      const root = this.rootRef.current;
      if (!root) return;
      this.onClick = (e) => {
        const menuBtn = e.target.closest('[data-menu]');
        if (menuBtn && root.contains(menuBtn)) {
          const act = menuBtn.getAttribute('data-menu');
          if (act === 'toggle') { e.preventDefault(); return this.toggleMenu(); }
          if (act === 'close') {
            this.closeMenu(true);
            const href = menuBtn.getAttribute('href') || '';
            if (href.charAt(0) === '#') {
              const target = document.getElementById(href.slice(1));
              if (target) {
                target.setAttribute('tabindex', '-1');
                setTimeout(() => target.focus({ preventScroll: true }), 360);
              }
            }
            return;
          }
        }
        const faq = e.target.closest('[data-faq]');
        if (faq && root.contains(faq)) return this.toggleFaq(faq.getAttribute('data-faq'));
        const period = e.target.closest('[data-period]');
        if (period && root.contains(period)) return this.applyPeriod(period.getAttribute('data-period'));
        const tool = e.target.closest('[data-tool]');
        if (tool && root.contains(tool)) return this.applyTool(tool);
        const scene = e.target.closest('[data-scene]');
        if (scene && root.contains(scene)) return this.applyScene(scene);
      };
      root.addEventListener('click', this.onClick);
      const seed = (n) => {
        if (!this.rootRef.current) return;
        const found = this.rootRef.current.querySelectorAll('[data-period]').length;
        if (found) this.applyPeriod(this.props.priceDefault === 'yearly' ? 'yearly' : 'monthly');
        if (!found && n < 40) setTimeout(() => seed(n + 1), 120);
      };
      seed(0);
    }

    toggleFaq(key) {
      const root = this.rootRef.current;
      const body = root.querySelector('[data-faq-body="' + key + '"]');
      const icon = root.querySelector('[data-faq-icon="' + key + '"]');
      if (!body) return;
      const isOpen = this.openFaq === key;
      if (this.openFaq && this.openFaq !== key) this.setFaq(this.openFaq, false);
      this.setFaq(key, !isOpen);
      this.openFaq = isOpen ? null : key;
      if (icon) icon.style.color = isOpen ? '#6F6F6C' : (this.props.accent || '#E8E3D9');
    }

    setFaq(key, open) {
      const root = this.rootRef.current;
      const body = root.querySelector('[data-faq-body="' + key + '"]');
      const icon = root.querySelector('[data-faq-icon="' + key + '"]');
      if (!body) return;
      const target = open ? body.scrollHeight : 0;
      if (window.gsap && !this.reduced) {
        window.gsap.to(body, { height: target, opacity: open ? 1 : 0, duration: 0.55, ease: 'power3.out' });
      } else {
        body.style.height = open ? 'auto' : '0';
        body.style.opacity = open ? '1' : '0';
      }
      if (icon) {
        icon.style.transform = open ? 'rotate(135deg)' : 'rotate(0deg)';
        if (!open) icon.style.color = '#6F6F6C';
      }
    }

    /* ---------- pricing ---------- */
    applyPeriod(period) {
      const root = this.rootRef.current;
      if (!root) return;
      root.querySelectorAll('[data-period]').forEach(b => {
        const on = b.getAttribute('data-period') === period;
        b.style.background = on ? '#E8E3D9' : 'transparent';
        b.style.color = on ? '#050505' : '#8A8A87';
      });
      root.querySelectorAll('[data-price]').forEach(p => {
        p.style.display = p.getAttribute('data-price') === period ? 'block' : 'none';
      });
      this.tweenPrice(period === 'yearly' ? 23 : 29);
    }

    tweenPrice(target) {
      const root = this.rootRef.current;
      const el = root && root.querySelector('[data-price-num]');
      if (!el) return;
      if (this._priceRaf) cancelAnimationFrame(this._priceRaf);
      const from = this._priceVal == null ? parseFloat(String(el.textContent).replace(/[^\d.]/g, '')) || target : this._priceVal;
      if (from === target) { this._priceVal = target; el.textContent = '€' + target; return; }
      const dur = 620, t0 = performance.now();
      const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const step = now => {
        const t = Math.min(1, (now - t0) / dur), e = ease(t);
        const v = from + (target - from) * e;
        this._priceVal = v;
        el.textContent = '€' + Math.round(v);
        if (t < 1) this._priceRaf = requestAnimationFrame(step);
        else { this._priceVal = target; el.textContent = '€' + target; this._priceRaf = null; }
      };
      el.style.display = 'inline-block';
      this._priceRaf = requestAnimationFrame(step);
    }

    /* ---------- fake studio panel ---------- */
    applyScene(btn) {
      const root = this.rootRef.current;
      const accent = this.props.accent || '#E8E3D9';
      root.querySelectorAll('[data-scene]').forEach(b => {
        const on = b === btn;
        b.style.background = on ? '#121212' : 'transparent';
        b.style.borderColor = on ? '#262626' : 'transparent';
        b.style.color = on ? '#E8E3D9' : '#7A7A77';
        const tag = b.lastElementChild;
        if (tag) { tag.textContent = on ? 'LIVE' : ''; tag.style.color = accent; }
      });
    }

    applyTool(btn) {
      const root = this.rootRef.current;
      const accent = this.props.accent || '#E8E3D9';
      root.querySelectorAll('[data-tool]').forEach(b => {
        const on = b === btn;
        b.style.color = on ? '#E8E3D9' : '#7A7A77';
        b.style.borderLeftColor = on ? accent : '#1B1B1B';
      });
    }

    /* ---------- gsap ---------- */
    waitForGsap(tries) {
      if (window.gsap && window.ScrollTrigger) return this.initGsap();
      if (tries > 240) return;
      setTimeout(() => this.waitForGsap(tries + 1), 16);
    }

    initGsap() {
      const gsap = window.gsap;
      const ST = window.ScrollTrigger;
      gsap.registerPlugin(ST);
      const root = this.rootRef.current;
      if (!root) return;
      this.triggers = [];
      const scale = this.motion === 'restrained' ? 0.6 : 1;
      const off = this.motion === 'off' || this.reduced;

      /* hero */
      const heroEls = root.querySelectorAll('[data-hero]');
      const canReveal = !off && document.visibilityState === 'visible';
      if (canReveal && heroEls.length) {
        gsap.set(heroEls, { opacity: 0, y: 18, filter: 'blur(3px)' });
        const intro = gsap.to(heroEls, {
          opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.55 * scale + 0.2,
          stagger: 0.06, ease: 'power3.out'
        });
        /* Never leave the hero mid-tween: a backgrounded tab or a stalled
           compositor lands it immediately instead of holding it invisible. */
        const settle = () => { if (intro && intro.progress() < 1) intro.progress(1); };
        this.onHeroVisibility = () => { if (document.visibilityState === 'hidden') settle(); };
        document.addEventListener('visibilitychange', this.onHeroVisibility);
        this._heroSettle = setTimeout(settle, 1600);
        if (this.canvasRef.current) gsap.to(this.canvasRef.current, { opacity: 1, duration: 1.4, delay: 0.2 });
      } else if (this.canvasRef.current) {
        this.canvasRef.current.style.opacity = '1';
      }

      /* parallax */
      if (!off) {
        if (this.heroImgRef.current) {
          this.triggers.push(gsap.to(this.heroImgRef.current, {
            yPercent: 9 * scale, ease: 'none',
            scrollTrigger: { trigger: this.heroRef.current, start: 'top top', end: 'bottom top', scrub: true }
          }).scrollTrigger);
        }
        if (this.ctaImgRef.current) {
          this.triggers.push(gsap.fromTo(this.ctaImgRef.current, { yPercent: -4 * scale }, {
            yPercent: 4 * scale, ease: 'none',
            scrollTrigger: { trigger: this.ctaImgRef.current.parentElement, start: 'top bottom', end: 'bottom top', scrub: true }
          }).scrollTrigger);
        }
      }

      /* section reveals — two passes, since template nodes stream in */
      if (canReveal) {
        const bind = () => {
          if (!this.rootRef.current || document.visibilityState !== 'visible') return;
          this.rootRef.current.querySelectorAll('[data-reveal="1"]').forEach(el => {
            const box = el.getBoundingClientRect();
            if (!box.height) return;
            el.setAttribute('data-reveal', 'done');
            if (box.top < window.innerHeight * 0.88) return;
            gsap.set(el, { opacity: 0, y: 30 });
            const tw = gsap.to(el, {
              opacity: 1, y: 0, duration: 0.6 * scale + 0.2, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 88%', once: true }
            });
            this.triggers.push(tw.scrollTrigger);
          });
        };
        bind();
        setTimeout(bind, 900);
        setTimeout(bind, 2400);
        this._revealGuard = setTimeout(() => {
          const root = this.rootRef.current;
          if (!root) return;
          /* Only rescue when the animation loop never ran at all. A ticking clock
             means every hidden block is simply waiting its turn below the fold,
             and forcing those visible would leave their triggers armed: the block
             would flash back to hidden and replay the reveal on the way down. */
          if (gsap.ticker.frame > 5) return;
          this.triggers.forEach(st => {
            if (!st) return;
            if (st.animation) st.animation.kill();
            if (st.kill) st.kill();
          });
          this.triggers.length = 0;
          root.querySelectorAll('[data-reveal]').forEach(el => gsap.set(el, { opacity: 1, y: 0 }));
        }, 4000);
      }
    }

    /* ---------- hero shader: grain + haze + vignette ---------- */
    initGrain() {
      const cv = this.canvasRef.current;
      if (!cv) return;
      let gl;
      try { gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false }); } catch (e) { gl = null; }
      if (!gl) return;

      const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
      const fs = [
        'precision highp float;',
        'uniform vec2 r;uniform float t;',
        'float h(vec2 x){return fract(sin(dot(x,vec2(12.9898,78.233)))*43758.5453);}',
        'float n(vec2 x){vec2 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);',
        'return mix(mix(h(i),h(i+vec2(1.0,0.0)),f.x),mix(h(i+vec2(0.0,1.0)),h(i+vec2(1.0,1.0)),f.x),f.y);}',
        'void main(){vec2 uv=gl_FragCoord.xy/r;',
        'float fog=n(uv*vec2(2.6,1.6)+vec2(t*0.014,t*0.006))*0.6+n(uv*vec2(5.5,3.2)-vec2(t*0.021,0.0))*0.25;',
        'float g=h(gl_FragCoord.xy+vec2(t*57.0,t*31.0))-0.5;',
        'float d=distance(uv,vec2(0.5,0.56));',
        'float vig=smoothstep(0.34,1.02,d);',
        'vec3 col=vec3(0.014,0.02,0.026);',
        'col=mix(col,vec3(0.22,0.42,0.72),clamp(fog*0.30,0.0,1.0));',
        'float a=vig*0.72;',
        'a=max(a,fog*0.07*(1.0-vig));',
        'col+=vec3(g*0.42);',
        'a=max(a,abs(g)*0.13);',
        'gl_FragColor=vec4(clamp(col,0.0,1.0),clamp(a,0.0,1.0));}'
      ].join('\n');

      const mk = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
        return s;
      };
      const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
      if (!v || !f) return;
      const prog = gl.createProgram();
      gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      const uR = gl.getUniformLocation(prog, 'r');
      const uT = gl.getUniformLocation(prog, 't');

      const resize = () => {
        const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1 : 1.4);
        const w = Math.max(1, Math.floor(cv.clientWidth * dpr));
        const hh = Math.max(1, Math.floor(cv.clientHeight * dpr));
        if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
        gl.viewport(0, 0, cv.width, cv.height);
        gl.uniform2f(uR, cv.width, cv.height);
      };
      this.onResize = resize;
      window.addEventListener('resize', resize);
      resize();

      const start = performance.now();
      let last = 0;
      const loop = (now) => {
        this.raf = requestAnimationFrame(loop);
        if (now - last < 42) return;
        last = now;
        if (window.scrollY > window.innerHeight * 1.2) return;
        gl.uniform1f(uT, (now - start) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      this.raf = requestAnimationFrame(loop);
    }
  }


  function start() {
    /* the hover styles the canvas applied through JS are stylesheet rules now,
       so all that is left is putting the class on the element */
    document.querySelectorAll('[data-hover]').forEach(function (el) {
      el.classList.add(el.getAttribute('data-hover'));
    });
    var app = new Component(PROPS);
    document.querySelectorAll('[data-ref]').forEach(function (el) {
      var key = el.getAttribute('data-ref');
      if (app[key]) app[key].current = el;
    });
    app.componentDidMount();
    window.__velora = app;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
