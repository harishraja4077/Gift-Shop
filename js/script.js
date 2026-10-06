/* =============================================================
   STACKLY — Gift Atelier · interaction engine
   ============================================================= */
(() => {
  'use strict';

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isMobile = () => innerWidth < 1024;

  /* ---------------------------------------------------------
     1. Preloader
     --------------------------------------------------------- */
  function preloader() {
    const pl = $('#preloader');
    if (!pl) return;

    const fill = $('.pl-fill', pl);
    const num  = $('.pl-num-val', pl);
    const mark = $('.pl-mark', pl);
    if (mark) {
      mark.innerHTML = [...mark.textContent.trim()]
        .map((c, i) => `<span style="animation-delay:${0.05 + i * 0.045}s">${c === ' ' ? '&nbsp;' : c}</span>`)
        .join('');
    }

    let pct = 0;
    const done = () => {
      pct = 100;
      paint();
      setTimeout(() => {
        pl.classList.add('is-done');
        document.body.classList.remove('is-locked');
        setTimeout(() => pl.remove(), 1400);
        refresh();
      }, 320);
    };

    const paint = () => {
      if (fill) fill.style.right = `${100 - pct}%`;
      if (num) num.textContent = String(Math.round(pct)).padStart(2, '0');
    };

    document.body.classList.add('is-locked');
    // only wait on images that actually start eagerly — lazy ones below the fold
    // never resolve without a scroll, which used to stall the curtain for 5s
    const imgs = $$('img').filter((i) => i.loading !== 'lazy');
    const total = Math.min(imgs.length, 6);
    let loaded = 0;

    const tick = () => {
      pct = Math.min(99, pct + Math.random() * 11 + 3);
      paint();
      if (loaded >= total) { setTimeout(done, 1150); }
      else setTimeout(tick, 90 + Math.random() * 130);
    };

    const wait = () => { loaded++; };
    imgs.forEach(img => {
      if (img.complete) wait();
      else { img.addEventListener('load', wait, { once: true }); img.addEventListener('error', wait, { once: true }); }
    });

    setTimeout(tick, 160);
    setTimeout(done, 2600); // safety net
  }

  /* ---------------------------------------------------------
     2. Line / char / word splitting
     --------------------------------------------------------- */
  function splitText() {
    $$('[data-lines]').forEach(el => {
      if (el.dataset.done) return;
      const words = el.textContent.trim().split(/\s+/);
      el.innerHTML = words
        .map((w, i) => `<span class="ln"><span style="transition-delay:${i * 0.07}s">${w}</span></span>`)
        .join(' ');
      el.dataset.done = '1';
    });

    $$('[data-split]').forEach(el => {
      if (el.dataset.done) return;
      const txt = el.textContent.trim();
      el.innerHTML = [...txt]
        .map((c, i) => `<span style="transition-delay:${0.03 * i}s">${c === ' ' ? '&nbsp;' : c}</span>`)
        .join('');
      el.dataset.done = '1';
    });
  }

  /* ---------------------------------------------------------
     3. Scroll reveals
     --------------------------------------------------------- */
  function reveals() {
    const items = $$('[data-rev], [data-lines], [data-split], .lines, .split-ch');
    if (!items.length) return;

    if (REDUCED || !('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('is-in'));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const d = +el.dataset.rev || 0;
        const delay = d * (el.dataset.revStep ? +el.dataset.revStep : 90);
        setTimeout(() => el.classList.add('is-in'), delay);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    items.forEach(el => {
      // stagger children of [data-stagger]
      const parentStagger = el.closest('[data-stagger]');
      if (parentStagger) {
        const sibs = [...parentStagger.children].filter(c => c.matches('[data-rev]'));
        const i = sibs.indexOf(el);
        if (i > -1) el.dataset.revDelay = i;
      }
      io.observe(el);
    });
  }

  /* ---------------------------------------------------------
     4. Split line reveal (needs parent .lines.is-in)
     --------------------------------------------------------- */
  function lineReveals() {
    const groups = $$('.lines');
    if (!groups.length) return;
    if (REDUCED || !('IntersectionObserver' in window)) {
      groups.forEach(g => g.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.25 });
    groups.forEach(g => io.observe(g));
  }

  /* ---------------------------------------------------------
     5. Counters
     --------------------------------------------------------- */
  function counters() {
    const nums = $$('[data-count]');
    if (!nums.length) return;
    const run = (el) => {
      const target = parseFloat(el.dataset.count);
      const dec = (el.dataset.count.split('.')[1] || '').length;
      const suffix = el.dataset.suffix || '';
      const prefix = el.dataset.prefix || '';
      if (REDUCED) { el.textContent = prefix + target.toFixed(dec) + suffix; return; }
      const dur = 1700;
      const t0 = performance.now();
      const step = (now) => {
        const p = clamp((now - t0) / dur, 0, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = prefix + (target * eased).toFixed(dec) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!('IntersectionObserver' in window)) return nums.forEach(run);
    const io = new IntersectionObserver((en) => {
      en.forEach(e => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.5 });
    nums.forEach(n => io.observe(n));
  }

  /* ---------------------------------------------------------
     6. Nav: sticky, hide-on-scroll-down, progress, active link
     --------------------------------------------------------- */
  const scroll = { y: 0, last: 0, vel: 0 };

  function nav() {
    const bar = $('.nav');
    const prog = $('#progress');
    const top = $('.to-top');

    const onScroll = () => {
      const y = window.scrollY;
      scroll.vel = y - scroll.last;
      scroll.last = y;

      if (bar) {
        bar.classList.toggle('is-stuck', y > 40);
        if (y > 420 && scroll.vel > 0) bar.classList.add('is-hidden');
        else bar.classList.remove('is-hidden');
      }

      const max = document.documentElement.scrollHeight - innerHeight;
      if (prog) prog.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1) : 0})`;
      if (top) top.classList.toggle('is-on', y > 700);
    };

    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    top?.addEventListener('click', () =>
      scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' })
    );
  }

  /* ---------------------------------------------------------
     7. Custom cursor + magnetic buttons
     --------------------------------------------------------- */
  function cursor() {
    if (!FINE || REDUCED) return;
    const ring = $('.cur');
    const dot  = $('.cur-dot');
    if (!ring || !dot) return;

    let mx = innerWidth / 2, my = innerHeight / 2;
    let rx = mx, ry = my, dx = mx, dy = my;

    addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      dx = mx; dy = my;
      dot.style.transform = `translate(${dx}px,${dy}px)`;
      const hot = e.target.closest('a, button, .mitem, .prod, .card, .cat-card, input, textarea, select');
      ring.classList.toggle('is-hot', !!hot);
      ring.classList.toggle('is-txt', !!e.target.closest('input, textarea'));
    }, { passive: true });

    (function loop() {
      rx = lerp(rx, mx, 0.16);
      ry = lerp(ry, my, 0.16);
      ring.style.transform = `translate(${rx}px,${ry}px)`;
      requestAnimationFrame(loop);
    })();

    // magnetic
    $$('.magnet').forEach(el => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.24;
        const y = (e.clientY - r.top - r.height / 2) * 0.32;
        el.style.transform = `translate(${x}px,${y}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------------------------------------------------------
     8. Parallax (images + backgrounds) driven by rAF
     --------------------------------------------------------- */
  let paraItems = [];
  function parallax() {
    paraItems = $$('[data-para]').map(el => ({
      el,
      speed: parseFloat(el.dataset.para) || 0.14,
      host: el.closest('[data-para-host]') || el.parentElement,
      r: el.parentElement.getBoundingClientRect()
    }));
    if (REDUCED) return;
  }

  function tick() {
    const vh = innerHeight;
    for (const p of paraItems) {
      const r = p.host.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const prog = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
      p.el.style.transform = `translate3d(0, ${(prog * p.speed * 100).toFixed(2)}px, 0)`;
    }
    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------
     9. Marquee speed reacts to scroll velocity
     --------------------------------------------------------- */
  function marquee() {
    $$('.mq-track').forEach(track => {
      if (REDUCED) return;
      let base = 0;
      const dur = 34;
      track.style.animationDuration = `${dur}s`;
      let lastY = 0;
      addEventListener('scroll', () => {
        const y = scrollY;
        const v = clamp((y - lastY) * 0.55, -140, 140);
        lastY = y;
        base = lerp(base, v, 0.12);
        const d = Math.max(9, dur - Math.abs(base));
        track.style.animationDuration = `${d}s`;
        track.style.animationDirection = base < 0 ? 'reverse' : 'normal';
      }, { passive: true });
    });
  }

  /* ---------------------------------------------------------
     10. Drawer
     --------------------------------------------------------- */
  function drawer() {
    const d = $('#drawer');
    const burger = $('.burger');
    if (!d || !burger) return;

    const links = $$('nav a', d);
    links.forEach((a, i) => { a.style.animationDelay = `${0.09 * i + 0.16}s`; });

    const open = (on) => {
      d.classList.toggle('is-open', on);
      burger.classList.toggle('is-x', on);
      burger.setAttribute('aria-expanded', String(on));
      document.body.classList.toggle('is-locked', on);
    };

    burger.addEventListener('click', () => open(!d.classList.contains('is-open')));
    $('.drawer-close', d)?.addEventListener('click', () => open(false));
    $('.drawer-veil', d)?.addEventListener('click', () => open(false));
    links.forEach(a => a.addEventListener('click', () => open(false)));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  }

  /* ---------------------------------------------------------
     11. Accordion
     --------------------------------------------------------- */
  function accordion() {
    $$('.acc-item').forEach(item => {
      const q = $('.acc-q', item);
      q?.addEventListener('click', () => {
        const open = item.classList.contains('is-open');
        const group = item.closest('.acc');
        group?.querySelectorAll('.acc-item.is-open').forEach(i => {
          i.classList.remove('is-open');
          i.querySelector('.acc-q')?.setAttribute('aria-expanded', 'false');
        });
        if (!open) {
          item.classList.add('is-open');
          q.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  /* ---------------------------------------------------------
     12. Horizontal carousels (drag + arrows)
     --------------------------------------------------------- */
  function carousels() {
    $$('[data-car]').forEach(car => {
      const scope = car.closest('section') || document;
      const track = $('[data-car-track]', car)
        || $('.tst-track', car)
        || $('[data-car-track]', scope)
        || $('.tst-track', scope);
      if (!track) return;
      const prev = $('[data-car-prev]', car);
      const next = $('[data-car-next]', car);

      const step = () => (track.firstElementChild?.getBoundingClientRect().width || 340) + 18;
      prev?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
      next?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));

      // pointer drag
      let down = false, sx = 0, sl = 0, moved = false;
      track.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return;
        down = true; moved = false; sx = e.clientX; sl = track.scrollLeft;
        track.style.cursor = 'grabbing'; track.style.scrollSnapType = 'none';
      });
      addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - sx;
        if (Math.abs(dx) > 4) moved = true;
        track.scrollLeft = sl - dx;
      });
      addEventListener('pointerup', () => {
        if (!down) return;
        down = false; track.style.cursor = ''; track.style.scrollSnapType = '';
      });
      track.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    });
  }

  /* ---------------------------------------------------------
     13. Filter chips (blog / gallery)
     --------------------------------------------------------- */
  function filters() {
    $$('[data-filter-group]').forEach(group => {
      const targetSel = group.dataset.filterGroup;
      const grid = $(targetSel);
      if (!grid) return;
      const items = $$('[data-cat]', grid);

      $$('[data-filter]', group).forEach(btn => {
        btn.addEventListener('click', () => {
          $$('[data-filter]', group).forEach(b => b.classList.remove('is-on'));
          btn.classList.add('is-on');
          const f = btn.dataset.filter;

          items.forEach((it, i) => {
            const show = f === 'all' || (it.dataset.cat || '').split(' ').includes(f);
            if (show) {
              it.style.display = '';
              it.animate(
                [{ opacity: 0, transform: 'translateY(18px) scale(.98)' }, { opacity: 1, transform: 'none' }],
                { duration: 520, delay: i * 55, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }
              );
            } else {
              it.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.97)' }],
                { duration: 220, easing: 'ease', fill: 'forwards' })
              .onfinish = () => { it.style.display = 'none'; };
            }
          });

          const n = items.filter(it => f === 'all' || (it.dataset.cat || '').split(' ').includes(f)).length;
          const counter = $(`[data-filter-count="${targetSel}"]`);
          if (counter) counter.textContent = String(n).padStart(2, '0');
        });
      });
    });
  }

  /* ---------------------------------------------------------
     14. 3D tilt cards
     --------------------------------------------------------- */
  function tilt() {
    if (!FINE || REDUCED || isMobile()) return;
    $$('[data-tilt]').forEach(card => {
      const max = parseFloat(card.dataset.tilt) || 7;
      card.style.transformStyle = 'preserve-3d';
      card.style.transition = 'transform .5s cubic-bezier(.16,1,.3,1)';
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transition = 'transform .12s linear';
        card.style.transform = `perspective(900px) rotateY(${px * max}deg) rotateX(${-py * max}deg) translateZ(6px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)';
        card.style.transform = '';
      });
    });
  }

  /* ---------------------------------------------------------
     15. Spotlight on value cards
     --------------------------------------------------------- */
  function spotlight() {
    if (!FINE) return;
    $$('[data-spot]').forEach(el => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
  }

  /* ---------------------------------------------------------
     16. Lightbox gallery
     --------------------------------------------------------- */
  function lightbox() {
    const lb = $('#lightbox');
    if (!lb) return;
    const img = $('img', lb);
    const cap = $('.lb-cap', lb);
    const items = $$('[data-lb]');
    if (!items.length) return;

    let i = 0;
    const show = (n) => {
      i = (n + items.length) % items.length;
      const el = items[i];
      const src = el.dataset.lb || $('img', el)?.currentSrc || $('img', el)?.src;
      const alt = $('img', el)?.alt || '';
      img.style.opacity = '0';
      img.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }],
        { duration: 420, easing: 'ease' });
      img.src = src;
      img.alt = alt;
      if (cap) cap.textContent = el.dataset.lbTitle || alt;
      img.style.opacity = '1';
    };

    const open = (n) => { show(n); lb.classList.add('is-open'); document.body.classList.add('is-locked'); };
    const close = () => { lb.classList.remove('is-open'); document.body.classList.remove('is-locked'); };

    items.forEach((el, n) => {
      el.addEventListener('click', () => open(n));
      el.setAttribute('tabindex', '0');
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(n); } });
    });

    $('.lb-x', lb)?.addEventListener('click', close);
    $('.lb-nav.prev', lb)?.addEventListener('click', () => show(i - 1));
    $('.lb-nav.next', lb)?.addEventListener('click', () => show(i + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
    addEventListener('keydown', (e) => {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(i - 1);
      if (e.key === 'ArrowRight') show(i + 1);
    });

    // swipe
    let sx = 0;
    lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) show(dx < 0 ? i + 1 : i - 1);
    }, { passive: true });
  }

  /* ---------------------------------------------------------
     17. Toast + cart
     --------------------------------------------------------- */
  const cart = { n: 0, get() { return +(localStorage.getItem('stackly_cart') || 0); }, set(v) { this.n = v; localStorage.setItem('stackly_cart', String(v)); this.paint(); }, paint() { $$('.cart-btn .count').forEach(c => { c.textContent = this.n; c.style.display = this.n ? 'grid' : 'none'; }); } };

  function toast(msg) {
    const wrap = $('.toast-wrap');
    if (!wrap) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 6 9 17l-5-5"/></svg><span>${msg}</span>`;
    wrap.appendChild(t);
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 500); }, 2800);
  }

  function shop() {
    cart.set(cart.get());
    $$('[data-add]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        cart.set(cart.get() + 1);
        $$('.cart-btn').forEach(c => { c.classList.add('is-bump'); setTimeout(() => c.classList.remove('is-bump'), 600); });
        toast(`${btn.dataset.add || 'Item'} added to your bag`);
      });
    });
  }

  /* ---------------------------------------------------------
     18. Quick view modal
     --------------------------------------------------------- */
  function quickview() {
    const m = $('#modal');
    if (!m) return;
    const mImg = $('img', m), mTitle = $('[data-qv-title]', m),
      mPrice = $('[data-qv-price]', m), mMeta = $('[data-qv-meta]', m);

    $$('[data-qv]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const d = btn.dataset;
        if (mImg) { mImg.src = d.qv; mImg.alt = d.name || ''; }
        if (mTitle) mTitle.textContent = d.name || '';
        if (mPrice) mPrice.textContent = d.price || '';
        if (mMeta) mMeta.textContent = d.meta || '';
        m.classList.add('is-open');
        document.body.classList.add('is-locked');
      });
    });

    const close = () => { m.classList.remove('is-open'); document.body.classList.remove('is-locked'); };
    $('.modal-x', m)?.addEventListener('click', close);
    m.addEventListener('click', (e) => { if (e.target === m) close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    $('[data-qv-add]', m)?.addEventListener('click', () => {
      cart.set(cart.get() + 1);
      $$('.cart-btn').forEach(c => { c.classList.add('is-bump'); setTimeout(() => c.classList.remove('is-bump'), 600); });
      toast(`${mTitle?.textContent || 'Item'} added to your bag`);
      close();
    });
  }

  /* ---------------------------------------------------------
     18b. Shared email rules — every form on the site
     --------------------------------------------------------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const GMAIL_RE = /^[^\s@]+@gmail\.com$/i;
  const EMAIL_MSG = 'Enter a valid email address.';
  const GMAIL_MSG = 'Use a Gmail address — it must end with @gmail.com.';

  // '' when acceptable, otherwise the message to show
  function emailError(v) {
    const s = (v || '').trim();
    if (!s) return '';
    if (!EMAIL_RE.test(s)) return EMAIL_MSG;
    if (!GMAIL_RE.test(s)) return GMAIL_MSG;
    return '';
  }

  function shake(el) {
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' },
      { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }],
      { duration: 340, easing: 'ease' });
  }

  /* ---------------------------------------------------------
     19. Forms (front-end demo)
     --------------------------------------------------------- */
  function forms() {
    $$('form[data-form]').forEach(form => {
      const fields = () => $$('input, select, textarea', form);

      fields().forEach(el => {
        el.addEventListener('blur', () => {
          if (el.type !== 'email') return;
          setFieldState(el, el.required && !el.value.trim() ? '' : emailError(el.value));
        });
        el.addEventListener('input', () => {
          if (el.closest('.field')?.classList.contains('is-bad'))
            setFieldState(el, fieldError(el));
        });
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = $('.form-msg', form);
        let bad = null;
        fields().forEach(el => {
          if (!bad && fieldError(el)) bad = el;
        });
        if (bad) {
          setFieldState(bad, fieldError(bad));
          shake(bad);
          bad.focus();
          if (msg) {
            msg.innerHTML = `<svg width="15" height="15"><use href="#i-x"/></svg><span>Please fill in all the required fields.</span>`;
            msg.classList.add('is-bad', 'is-on');
            msg.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
          }
          return;
        }
        if (msg) {
          msg.classList.remove('is-bad');
          msg.classList.add('is-on');
          msg.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
        }
        if (!form.dataset.noReset) form.reset();
        setTimeout(() => { location.href = 'index.html'; }, 900);
      });
    });
  }

  /* ---------------------------------------------------------
     20. Newsletter inline validation
     --------------------------------------------------------- */
  function newsletters() {
    $$('[data-nl]').forEach(f => {
      const err = $('.nl-err', f.parentNode) || $('.nl-err', f);
      const input = $('input[type="email"]', f);
      if (!input) return;

      const flag = (bad) => {
        input.classList.toggle('is-bad', !!bad);
        if (err) err.textContent = bad || '';
      };

      input.addEventListener('input', () => {
        if (input.classList.contains('is-bad')) flag(emailError(input.value));
      });

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const bad = !input.value.trim() ? 'Enter your email address.' : emailError(input.value);
        if (bad) {
          flag(bad);
          input.focus();
          shake(input);
          return;
        }
        flag('');
        toast('Welcome to the Stackly list ✦');
        f.reset();
        setTimeout(() => { location.href = 'index.html'; }, 900);
      });
    });
  }

  /* ---------------------------------------------------------
     21. Opening-hours "open now"
     --------------------------------------------------------- */
  function hours() {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    $$('[data-open]').forEach(el => {
      const [from, to] = el.dataset.open.split('-').map(v => {
        const [h, m] = v.split(':').map(Number);
        return h * 60 + (m || 0);
      });
      if (mins >= from && mins <= to) el.classList.add('is-now');
    });
  }

  /* ---------------------------------------------------------
     21b. Copy the studio address
     --------------------------------------------------------- */
  function maps() {
    $$('[data-copy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.dataset.copy;
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;top:-100px;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch { /* clipboard unavailable */ }
          ta.remove();
        }
        toast('Address copied');
      });
    });
  }

  /* ---------------------------------------------------------
     22. Active nav link + page transition
     --------------------------------------------------------- */
  function activeNav() {
    const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.menu a[href], .drawer a[href]').forEach(a => {
      const href = (a.getAttribute('href') || '').split('/').pop().toLowerCase();
      if (href === page || (page === '' && href === 'index.html')) a.setAttribute('aria-current', 'page');
    });
  }

  function safeRoute(href) {
    if (!href) return href;
    const cleaned = href.trim();
    const path = cleaned.split(/[?#]/)[0].toLowerCase();
    if (path === '404' || path === '404.html') return 'index.html';
    return cleaned;
  }

  function pageTransition() {
    if (REDUCED) return;
    const pt = $('#pt');
    if (!pt) return;
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      const href = safeRoute(a.getAttribute('href') || '');
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      if (/^(#|mailto:|tel:|javascript:|https?:)/i.test(href) && !/^https?:/i.test(href)) return;
      if (/^https?:/i.test(href)) return;
      if (!/\.html?$/i.test(href)) return;
      e.preventDefault();
      pt.classList.add('is-in');
      setTimeout(() => { location.href = href; }, 620);
    });
  }

  /* ---------------------------------------------------------
     23. Anchor smooth scroll with nav offset
     --------------------------------------------------------- */
  function anchors() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const t = $(id);
      if (!t) return;
      e.preventDefault();
      const top = t.getBoundingClientRect().top + scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) + 18);
      scrollTo({ top, behavior: REDUCED ? 'auto' : 'smooth' });
      history.replaceState(null, '', id);
    });
  }

  /* ---------------------------------------------------------
     24. Hero entrance timeline
     --------------------------------------------------------- */
  function heroIn() {
    const hero = $('.hero, .phero');
    if (!hero) return;
    const items = $$('[data-hero-step]', hero);
    items.forEach((el, i) => setTimeout(() => el.classList.add('is-in'), 220 + i * 130));
    const lines = $$('.hero .lines, .phero .lines', hero);
    lines.forEach(l => setTimeout(() => l.classList.add('is-in'), 420));
  }

  /* ---------------------------------------------------------
     25. Floating blob drift
     --------------------------------------------------------- */
  function blobs() {
    if (REDUCED) return;
    $$('.blob').forEach((b, i) => {
      const dx = (Math.random() - 0.5) * 60;
      const dy = (Math.random() - 0.5) * 50;
      b.animate(
        [{ transform: 'translate(0,0)' }, { transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }],
        { duration: 11000 + i * 3200, iterations: Infinity, easing: 'ease-in-out' }
      );
    });
  }

  /* ---------------------------------------------------------
     26. Hero image has no intrinsic load — soften decode
     --------------------------------------------------------- */
  function eagerHero() {
    $$('.hero img, .phero img').forEach(i => { i.loading = 'eager'; i.fetchPriority = 'high'; });
  }

  /* ---------------------------------------------------------
     27. Auth pages — reveal, strength, validation
     --------------------------------------------------------- */
  const PW_LABELS = ['', 'Too easy to guess', 'Workable', 'Good', 'Excellent'];

  function pwScore(v) {
    if (!v) return 0;
    let n = 0;
    if (v.length >= 8) n++;
    if (v.length >= 12) n++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) n++;
    if (/\d/.test(v)) n++;
    if (/[^\w\s]/.test(v)) n++;
    if (/(.)\1{2,}/.test(v)) n--;
    if (/^(password|qwerty|letmein|welcome|stackly|admin)/i.test(v)) n--;
    return clamp(n, 0, 4);
  }

  function setFieldState(input, text) {
    const wrap = input.closest('.field, .checkline');
    if (!wrap) return;
    wrap.classList.toggle('is-bad', !!text);
    if (!text && input.type !== 'checkbox') wrap.classList.toggle('is-good', !!input.value.trim());
    input.setAttribute('aria-invalid', text ? 'true' : 'false');
    let err = $('.f-err', wrap);
    if (!err && text) {
      err = document.createElement('small');
      err.className = 'f-err';
      wrap.appendChild(err);
    }
    if (err) err.textContent = text || '';
  }

  function fieldError(el) {
    const v = (el.value || '').trim();
    if (el.type === 'checkbox') return el.required && !el.checked ? 'Please tick this box.' : '';
    if (!v) return el.required ? 'This field is required.' : '';
    if (el.type === 'email') return emailError(v);
    if (!el.checkValidity()) return 'Please check this field.';
    return '';
  }

  function validateField(el, partner) {
    const v = (el.value || '').trim();
    let msg = '';
    if (el.required && !v) msg = 'This field is required.';
    else if (el.type === 'email' && v) msg = emailError(v);
    else if (el.type === 'password' && v && el.dataset.min && v.length < +el.dataset.min)
      msg = `Use at least ${el.dataset.min} characters.`;
    else if (el.dataset.match) {
      const other = document.getElementById(el.dataset.match);
      if (other && v && v !== other.value) msg = 'Both passwords must match.';
    }
    if (el.type === 'checkbox' && el.required && !el.checked) msg = 'Please tick this box.';
    if (el.type === 'checkbox' && !msg) setFieldState(el, '');
    else setFieldState(el, msg);
    return !msg;
  }

  function authPages() {
    // password reveal
    $$('[data-pw-toggle]').forEach(btn => {
      const input = document.getElementById(btn.dataset.pwToggle);
      if (!input) return;
      btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.classList.toggle('is-on', show);
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        const use = $('use', btn);
        if (use) use.setAttribute('href', show ? '#i-eye-off' : '#i-eye');
        input.focus();
      });
    });

    // strength meter
    $$('[data-pw-meter]').forEach(meter => {
      const pw = document.getElementById(meter.dataset.pwMeter);
      if (!pw) return;
      const label = $('[data-pw-label]');
      const sync = () => {
        const s = pwScore(pw.value);
        meter.dataset.level = String(s);
        if (label) {
          label.textContent = pw.value ? PW_LABELS[s] : '';
          label.style.color = s <= 1 ? 'var(--rose)' : s >= 3 ? 'var(--sage)' : '';
        }
      };
      pw.addEventListener('input', sync);
      sync();
    });

    // validate on blur, clear on input
    $$('form[data-auth]').forEach(form => {
      $$('input, select, textarea', form).forEach(el => {
        el.addEventListener('blur', () => validateField(el));
        el.addEventListener('input', () => {
          if (el.closest('.field')?.classList.contains('is-bad')) validateField(el);
        });
      });
    });

    // submit
    $$('form[data-auth]').forEach(form => {
      const msg = $('.form-msg', form);
      const btn = $('button[type="submit"]', form);
      const btnTxt = btn ? $('span', btn) : null;
      const busy = form.dataset.busy || 'Working';
      const done = form.dataset.done || 'Thank you — you are all set.';

      const say = (text, bad) => {
        if (!msg) return;
        msg.innerHTML = `<svg width="15" height="15"><use href="${bad ? '#i-x' : '#i-check'}"/></svg><span>${text}</span>`;
        msg.classList.toggle('is-bad', !!bad);
        msg.classList.add('is-on');
        msg.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
        clearTimeout(say.t);
        say.t = setTimeout(() => msg.classList.remove('is-on'), 6000);
      };

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        let bad = null;
        $$('input, select, textarea', form).forEach(el => {
          if (!validateField(el) && !bad) bad = el;
        });
        if (bad) {
          say('Please check the highlighted fields.', true);
          const wrap = bad.closest('.field, .checkline');
          wrap?.classList.remove('shake');
          if (wrap) { void wrap.offsetWidth; wrap.classList.add('shake'); }
          bad.focus();
          return;
        }
        if (btn) { btn.disabled = true; btn.classList.add('is-load'); }
        if (btnTxt) btnTxt.textContent = `${busy}…`;
        idRemember(form);
        setTimeout(() => {
          say(done, false);
          toast(form.dataset.toast || done);
          form.reset();
          $$('.pw-meter', form).forEach(m => { m.dataset.level = '0'; });
          const lbl = $('[data-pw-label]', form);
          if (lbl) { lbl.textContent = ''; lbl.style.color = ''; }
          if (btn) { btn.disabled = false; btn.classList.remove('is-load'); }
          if (btnTxt) btnTxt.textContent = form.dataset.btn || 'Continue';
          if (form.dataset.go) setTimeout(() => { location.href = form.dataset.go; }, 900);
        }, 1100);
      });
    });
  }

  /* ---------------------------------------------------------
     27b. Auth role switch — User / Admin
     --------------------------------------------------------- */
  function authRole() {
    const group = $('[data-roles]');
    if (!group) return;

    const card = group.closest('.auth-card');
    const form = card && $('form[data-auth]', card);
    const h1 = card && $('.auth-head h1', card);
    const lede = card && $('.auth-head p', card);
    const sub = form && $('button[type="submit"] span', form);
    const opts = $$('[data-role]', group);

    // the markup holds the default (User) copy, so switching back is lossless
    const base = {
      h: h1 ? h1.innerHTML : '',
      p: lede ? lede.textContent : '',
      btn: form ? form.dataset.btn || '' : '',
      busy: form ? form.dataset.busy || '' : '',
      done: form ? form.dataset.done || '' : '',
      toast: form ? form.dataset.toast || '' : '',
      go: form ? form.dataset.go || '' : ''
    };

    const pick = (opt) => {
      opts.forEach(b => {
        const on = b === opt;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', String(on));
      });
      if (h1 && opt.dataset.h) h1.innerHTML = opt.dataset.h;
      if (lede && opt.dataset.p) lede.textContent = opt.dataset.p;
      if (form) {
        form.dataset.btn = opt.dataset.btn || base.btn;
        form.dataset.busy = opt.dataset.busy || base.busy;
        form.dataset.done = opt.dataset.done || base.done;
        form.dataset.toast = opt.dataset.toast || base.toast;
        form.dataset.go = opt.dataset.go || base.go;
      }
      if (sub) sub.textContent = (opt.dataset.btn || base.btn);
    };

    group.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-role]');
      if (opt) pick(opt);
    });

    group.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = opts.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const next = opts[(i + (e.key === 'ArrowRight' ? 1 : opts.length - 1)) % opts.length];
      next.focus();
      pick(next);
    });

    pick($('[data-role].is-on', group) || opts[0]);
  }

  /* ---------------------------------------------------------
     27c. Signed-in identity
     Whatever email signs in becomes the account shown across
     the dashboards, so the shell never shows a stale demo name.
     --------------------------------------------------------- */
  const ID_KEY = 'stackly_user';

  const ID_STORE = {
    read() { try { return JSON.parse(localStorage.getItem(ID_KEY)) || null; } catch (err) { return null; } },
    write(p) { try { localStorage.setItem(ID_KEY, JSON.stringify(p)); } catch (err) {} },
    clear() { try { localStorage.removeItem(ID_KEY); } catch (err) {} }
  };

  // "elena.marchetti" / "ELENA_MARCHETTI" -> readable words
  function idWords(s) {
    return String(s || '')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .split(/[._\-\s]+/)
      .filter(w => /\w/.test(w));
  }

  function idTitle(s) {
    return idWords(s).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  // an email is the only thing a demo sign-in can trust, so read the name off it
  function idFromEmail(email) {
    const local = String(email || '').split('@')[0];
    const parts = idWords(local);
    const first = idTitle(parts.shift()) || 'Member';
    const last = idTitle(parts.join(' '));
    return { first, last, full: [first, last].filter(Boolean).join(' ') };
  }

  function idInitials(name) {
    const w = idWords(name);
    if (!w.length) return 'M';
    return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  }

  // remember which email signed in (called from the auth submit handler)
  function idRemember(form) {
    const mail = $('input[name="email"]', form);
    if (!mail || !mail.value.trim()) return;
    const email = mail.value.trim();
    const fromForm = idTitle($('input[name="name"], input[name="first"]', form)?.value || '');
    const guess = idFromEmail(email);
    const name = fromForm || guess.full;
    const id = { email, name, first: name.split(' ')[0], last: name.split(' ').slice(1).join(' ') };
    ID_STORE.write(id);
    idPaint(id);
  }

  function idPaint(id) {
    if (!id) return;
    const set = (sel, val) => {
      if (!val) return;
      $$(sel).forEach(el => {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = val;
        else el.textContent = val;
      });
    };
    set('[data-user-name]', id.name);
    set('[data-user-first]', id.first);
    set('[data-user-last]', id.last);
    set('[data-user-avatar]', idInitials(id.name));

    // emails are long and get clipped in the sidebar, so keep the full one reachable
    if (id.email) {
      $$('[data-user-email]').forEach(el => {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = id.email;
        else el.textContent = id.email;
        el.setAttribute('title', id.email);
      });
    }
  }

  function identity() {
    idPaint(ID_STORE.read());

    // keep the saved copy in step with profile edits
    $$('form[data-app-form]').forEach(form => {
      const mail = $('input[name="email"]', form);
      const first = $('input[name="first"], input[name="last"]', form);
      if (!mail && !first) return;
      form.addEventListener('submit', () => {
        const cur = ID_STORE.read();
        if (!cur) return;
        const email = (mail && mail.value.trim()) || cur.email;
        const name = [
          (first && $('input[name="first"]', form)?.value.trim()) || cur.first,
          (first && $('input[name="last"]', form)?.value.trim()) || cur.last
        ].filter(Boolean).join(' ');
        ID_STORE.write({ email, name, first: name.split(' ')[0], last: name.split(' ').slice(1).join(' ') });
      }, true);
    });

    // signing out forgets the email so the next visit starts clean
    $$('[data-signout]').forEach(a => {
      a.addEventListener('click', () => ID_STORE.clear());
    });
  }

  /* ---------------------------------------------------------
     28. Error page — "Go Back" returns through history
     --------------------------------------------------------- */
  function errorPage() {
    const back = $('[data-err-back]');
    if (back) {
      back.addEventListener('click', () => {
        const ref = document.referrer;
        if (ref && ref.startsWith(location.origin)) {
          window.location.href = ref;
          return;
        }
        if (window.history.length > 1) window.history.back();
        else window.location.href = 'index.html';
      });
    }
  }

  /* ---------------------------------------------------------
     30. Dashboards
     --------------------------------------------------------- */
  const NF = new Intl.NumberFormat('en-US');

  const fmtNum = (v, dec, sep) => {
    const s = v.toFixed(dec);
    if (sep === '0') return s;
    const [i, f] = s.split('.');
    return NF.format(+i) + (f ? '.' + f : '');
  };

  // page key, used to pick the right notification set
  const PAGE = (() => {
    const f = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
    return f.replace('.html', '') || 'dashboard';
  })();

  /* ---------- shell: sidebar, theme, progress, popover ---------- */
  // The drawer freezes the page behind it. The viewport — not <body> — is the
  // scroller here, because `html { overflow-x: clip }` stops body's overflow
  // ever reaching it, so the lock has to sit on <html>. The matching CSS only
  // exists inside the <=1024px block, so a drawer left open across a resize
  // unlocks itself instead of stranding the desktop scroll.
  const lockSide = (on) => {
    const root = document.documentElement;
    const was = root.classList.contains('side-locked');
    // This page scrolls in two places — the viewport and <body> (which became a
    // scroller of its own in 33.1) — and each drops a classic scrollbar the
    // moment it locks. Both widths are read up front and handed back as
    // padding, so the layout does not slide by even a pixel.
    const gutter = on && !was
      ? Math.max(0, innerWidth - root.clientWidth) + Math.max(0, document.body.offsetWidth - document.body.clientWidth)
      : null;
    root.classList.toggle('side-locked', on);
    document.body.classList.toggle('side-locked', on);
    if (gutter !== null) root.style.setProperty('--side-gutter', gutter + 'px');
    if (!on) root.style.removeProperty('--side-gutter');
  };

  function appShell() {
    const side = $('.side');
    const veil = $('.side-veil');
    const open = (on) => {
      if (side) side.classList.toggle('is-open', on);
      if (veil) veil.classList.toggle('is-on', on);
      lockSide(!!on);
      const btn = $('.side-toggle');
      if (btn) btn.setAttribute('aria-expanded', String(!!on));
    };
    $$('.side-toggle').forEach(b => b.addEventListener('click', () => open(!side.classList.contains('is-open'))));
    if (veil) veil.addEventListener('click', () => open(false));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
    if (innerWidth <= 1024) $$('.side-nav a').forEach(a => a.addEventListener('click', () => open(false)));

    // stagger indices for the shell entrance animations
    $$('.side-nav a').forEach((a, i) => a.style.setProperty('--i', i));
    $$('.app-tools > *').forEach((a, i) => a.style.setProperty('--i', i));

    // local theme preference for the app surface
    const KEY = 'aur-app-theme';
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (err) {}
    const paintTheme = (dark) => {
      const b = $('[data-theme]');
      if (!b) return;
      b.setAttribute('aria-pressed', String(dark));
      const ic = b.querySelector('svg use');
      if (ic) ic.setAttribute('href', dark ? '#i-sun' : '#i-moon');
      b.setAttribute('aria-label', dark ? 'Switch to the cream theme' : 'Switch to the ink theme');
    };
    if (saved === 'dark') { document.body.classList.add('app-dark'); paintTheme(true); }
    $$('[data-theme]').forEach(b => b.addEventListener('click', () => {
      const dark = document.body.classList.toggle('app-dark');
      paintTheme(dark);
      try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch (err) {}
      // replot anything that reads its colours from CSS variables
      document.body.classList.add('app-flip');
      b.classList.add('is-swap');
      setTimeout(() => { document.body.classList.remove('app-flip'); b.classList.remove('is-swap'); }, 620);
      $$('.chart .tip').forEach(t => t.classList.remove('is-on'));
      toast(dark ? 'Ink theme on' : 'Cream theme on');
    }));

    appProgress();
    appNotifications();
    appShortcuts();
  }

  // reading-progress rail pinned under the top bar
  function appProgress() {
    const pad = $('.app-body-pad');
    if (!pad) return;
    const bar = document.createElement('div');
    bar.className = 'app-prog';
    bar.innerHTML = '<i></i>';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    const fill = $('i', bar);
    let raf = 0;
    const paint = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      const k = max > 40 ? clamp(scrollY / max, 0, 1) : 0;
      fill.style.transform = `scaleX(${k})`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    paint();
  }

  const NOTES = {
    'admin': [
      ['alert', 'fi--rose', 'Order #AU-2301 failed payment', 'Margot Besnard needs a new card.', '1 hour ago', 1],
      ['bag', 'fi--gold', 'New order #AU-2312', '$198.00 awaiting packing in Salem.', '4 min ago', 1],
      ['alert', 'fi--gold', 'Neroli candle below reorder point', '3 units left against a threshold of 12.', '2 hours ago', 1],
      ['users', 'fi--sage', 'Tobias Lang reached Gold tier', 'Curator note added to his profile.', '3 hours ago', 0],
      ['star', 'fi--rose', 'New 5 star review', '“The autumn amber box made my week.”', 'Yesterday', 0]
    ],
    'admin-orders': [
      ['alert', 'fi--rose', '#AU-2301 needs a new card', 'Payment failed twice — retry or cancel.', '1 hour ago', 1],
      ['box', 'fi--gold', '#AU-2308 ready to seal', 'Marco has 4 parcels in the queue.', '22 min ago', 1],
      ['truck', 'fi--sage', 'DHL collection confirmed', '18 parcels collected from the studio.', '3 hours ago', 0],
      ['mail', 'fi--gold', 'Refund #AU-2285 issued', '$68.00 returned to the original card.', 'Yesterday', 0]
    ],
    'admin-products': [
      ['alert', 'fi--rose', 'Neroli candle 200g critically low', '3 units left — reorder at 12.', '2 hours ago', 1],
      ['alert', 'fi--rose', 'Bone china teacup critically low', '5 units left — reorder at 15.', '4 hours ago', 1],
      ['box', 'fi--gold', 'PO-4471 acknowledged by supplier', '60 units of neroli wax due 14 Nov.', 'Yesterday', 0],
      ['tag', 'fi--sage', 'Stackly No. 04 price reviewed', 'Margin holds at 62% after the review.', 'Yesterday', 0]
    ],
    'admin-customers': [
      ['users', 'fi--gold', 'Tobias Lang reached Gold tier', 'Automatically promoted on his 4th order.', '3 hours ago', 1],
      ['mail', 'fi--rose', 'Three reviews awaiting moderation', 'All four stars, published in the journal.', '5 hours ago', 1],
      ['sparkle', 'fi--sage', 'Margot Besnard updated her address', 'Gift address for 22 Rue des Archives.', 'Yesterday', 0]
    ],
    'admin-analytics': [
      ['chart', 'fi--sage', 'Weekly report is ready', 'Revenue +18.4% against the rolling year.', '2 hours ago', 1],
      ['alert', 'fi--gold', 'Two cohorts dipped below 80%', 'June and July month-3 retention softened.', 'Yesterday', 0],
      ['chart', 'fi--sage', 'Japan is the fastest growing market', '+34% month on month.', 'Yesterday', 0]
    ],
    'admin-settings': [
      ['shield', 'fi--sage', 'Studio email verified', 'info@thestackly.com is confirmed.', '2 days ago', 0],
      ['key', 'fi--rose', 'Marco Tosi signed in from a new device', 'Safari on macOS, Salem.', 'Yesterday', 1],
      ['cog', 'fi--gold', 'Payout schedule changed', 'Next payout moved to 02 Nov.', '3 days ago', 0]
    ],
    'dashboard': [
      ['truck', 'fi--gold', 'Box No. 03 is in transit', 'DHL tracking 4471 8820 — arrives 12 Nov.', '2 days ago', 1],
      ['star', 'fi--gold', '180 points awarded', 'Added after order #AU-2291 was delivered.', '4 days ago', 1],
      ['sparkle', 'fi--rose', 'Early access is open', 'Seasonal collection previews are live for Gold.', '1 week ago', 1],
      ['gift', 'fi--sage', 'Winter restock reserved', '4 items held for your 02 Dec parcel.', '1 week ago', 0],
      ['check', 'fi--sage', 'Review published', 'Your Neroli candle note is on the journal.', '2 weeks ago', 0]
    ],
    'dashboard-orders': [
      ['truck', 'fi--gold', '#AU-2291 out for delivery', 'DHL 4471 8820 — out for delivery in Salem.', '2 days ago', 1],
      ['mail', 'fi--sage', 'Invoice #AU-2291 ready', 'Download it any time from the row menu.', '3 days ago', 1],
      ['check', 'fi--sage', '#AU-1966 refunded in full', '$98.00 returned to Visa 4471.', '5 months ago', 0]
    ],
    'dashboard-subscriptions': [
      ['gift', 'fi--gold', 'Box No. 04 is being composed', 'Lucia curated the autumn amber selection.', '2 days ago', 1],
      ['tag', 'fi--gold', 'Winter restock charged', '$34.00 to Visa ending 4471.', '1 week ago', 1],
      ['clock', 'fi--rose', 'Cellar Notes is paused', 'Resume any time, nothing is lost.', '2 weeks ago', 0]
    ],
    'dashboard-addresses': [
      ['pin', 'fi--gold', 'Studio pickup address added', 'Collect only, 10–18, MMR Complex, Chinna Thirupathi.', '3 weeks ago', 0],
      ['truck', 'fi--sage', 'Duties prepaid switched on', 'Applied to every international parcel.', '1 month ago', 0]
    ],
    'dashboard-wishlist': [
      ['bell', 'fi--gold', 'Bone china teacup is back in stock', 'Two left — you saved it to your wishlist.', '4 hours ago', 1],
      ['bell', 'fi--rose', 'Price drop on silk ribbon set', 'Now $74.00, down from $82.00.', '2 days ago', 1],
      ['alert', 'fi--gold', 'Stackly No. 04 is nearly gone', 'Low stock before the 14 Nov dispatch.', '3 days ago', 0]
    ],
    'dashboard-profile': [
      ['shield', 'fi--sage', 'Two-step verification is on', 'Authenticator app, confirmed 4 months ago.', '4 months ago', 0],
      ['key', 'fi--gold', '3 active sessions', 'Chrome on macOS, Safari on iPhone, the atelier tablet.', 'Yesterday', 1],
      ['mail', 'fi--rose', 'Confirm your new email', 'We sent a link to your address.', 'Yesterday', 1]
    ]
  };

  function appNotifications() {
    const btn = $('[data-bell]') || $('.app-tools .icon-btn[aria-label="Notifications"]');
    const tools = $('.app-tools');
    if (!btn || !tools) return;

    const list = NOTES[PAGE] || NOTES.dashboard;
    const unread = list.filter(n => n[5]).length;

    const pop = document.createElement('div');
    pop.className = 'app-pop';
    pop.id = 'app-notifs';
    pop.innerHTML =
      `<div class="app-pop-hd"><b>Notifications</b><span data-notif-read>Mark all read</span></div>` +
      `<ul>${list.map(([ic, tint, title, body, time, un]) =>
        `<li class="${un ? 'unread' : ''}" role="button" tabindex="0">` +
          `<span class="np-ic ${tint}"><svg aria-hidden="true"><use href="#i-${ic}"/></svg></span>` +
          `<span><b>${title}</b><p>${body}</p><time>${time}</time></span>` +
          `<span class="np-dot"></span></li>`).join('')}</ul>` +
      `<div class="app-pop-ft"><a class="btn btn--ghost btn--sm btn--full" href="contact.html">Contact the studio</a></div>`;
    tools.appendChild(pop);

    const dot = $('.dot', btn);
    if (dot && !unread) dot.remove();
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'app-notifs');

    const setOpen = (on) => {
      pop.classList.toggle('is-open', on);
      btn.setAttribute('aria-expanded', String(on));
      if (on) {
        // rows cascade in
        $$('li', pop).forEach((li, i) => {
          li.style.animation = 'rowSlideIn .5s var(--e-out) backwards';
          li.style.animationDelay = `${i * 55}ms`;
          setTimeout(() => { li.style.animation = ''; }, 900 + i * 55);
        });
      }
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!pop.classList.contains('is-open')); });
    document.addEventListener('click', (e) => { if (!pop.contains(e.target) && e.target !== btn) setOpen(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    $$('li', pop).forEach(li => {
      const go = () => { li.classList.remove('unread'); toast('Marked as read'); };
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    const readAll = $('[data-notif-read]', pop);
    if (readAll) readAll.addEventListener('click', () => {
      $$('li.unread', pop).forEach(li => li.classList.remove('unread'));
      const d = $('.dot', btn);
      if (d) d.remove();
      toast('All notifications marked as read');
    });
  }

  /* ---------- contextual dialogs ----------
     Every row menu and toolbar button on the dashboards points at the one
     #m-quick shell; data-quick picks the copy, fields and actions for it. */
  const QUICK = {
    'order-admin': {
      title: 'Order actions', sub: 'Fulfilment, paperwork and refunds.',
      scope: '#${ref}',
      fields: [['note', 'Internal note for the studio', 'textarea', '']],
      actions: [
        ['eye', 'Open full order', 'ghost', 'Order workspace opened', true],
        ['truck', 'Mark as packed', 'gold', 'Packing slip sent to the printer', true],
        ['mail', 'Email the customer', 'ghost', 'Reply draft opened', false],
        ['refresh', 'Retry payment', 'ghost', 'Payment retried', true],
        ['alert', 'Cancel and refund', 'danger', 'Order cancelled and refunded', true]
      ]
    },
    'order-new': {
      title: 'New order', sub: 'Take a studio order from the workbench.',
      fields: [
        ['who', 'Customer', 'text', 'Margot Besnard'],
        ['box', 'Box selection', 'select', 'Autumn Amber No. 04', ['Autumn Amber No. 04', 'Neroli & Bone China', 'Silk Ribbon Set', 'Travel Espresso Case']],
        ['note', 'Gift message', 'textarea', 'With our compliments — enjoy the season.']
      ],
      actions: [
        ['check', 'Create order', 'gold', 'Order created and packing started', true],
        ['dl', 'Print workbench sheet', 'ghost', 'Workbench sheet queued', false]
      ]
    },
    'product-add': {
      title: 'Add a product', sub: 'New pieces join the catalogue as drafts.',
      fields: [
        ['pn', 'Product name', 'text', ''],
        ['sku', 'SKU', 'text', 'AUR-'],
        ['pr', 'Price', 'text', '$'],
        ['st', 'Opening stock', 'text', '0'],
        ['cat', 'Category', 'select', 'Home fragrance', ['Home fragrance', 'Table', 'Travel', 'Gift sets', 'Wellness']],
        ['cd', 'Curator note', 'textarea', '']
      ],
      actions: [
        ['plus', 'Create draft', 'gold', 'Draft product created', true],
        ['dl', 'Import a supplier CSV', 'ghost', 'CSV import ready', false]
      ]
    },
    'product-row': {
      title: 'Product actions', sub: 'Stock, pricing and storefront copy.',
      scope: '#${ref}',
      fields: [
        ['st', 'Stock on hand', 'text', ''],
        ['rp', 'Reorder point', 'text', '']
      ],
      actions: [
        ['edit', 'Edit product', 'ghost', 'Editor opened', false],
        ['box', 'Adjust stock', 'gold', 'Stock level updated', true],
        ['eye', 'View on storefront', 'ghost', 'Storefront preview opened', false],
        ['trash', 'Archive product', 'danger', 'Product archived', true]
      ]
    },
    'customer-row': {
      title: 'Customer actions', sub: 'Tier, correspondence and account health.',
      scope: '#${ref}',
      fields: [['note', 'Note on the profile', 'textarea', '']],
      actions: [
        ['users', 'Open profile', 'ghost', 'Profile opened', false],
        ['mail', 'Send an email', 'ghost', 'Compose window opened', false],
        ['star', 'Adjust loyalty tier', 'ghost', 'Tier updated', true],
        ['shield', 'Restrict the account', 'danger', 'Account restricted', true]
      ]
    },
    'invite': {
      title: 'Invite a colleague', sub: 'They get a single-use link that expires in 72 hours.',
      fields: [
        ['em', 'Email address', 'text', ''],
        ['rl', 'Role', 'select', 'Dispatch', ['Dispatch', 'Client care', 'Studio manager', 'Accounts']],
        ['note', 'Note', 'textarea', 'Welcome to the atelier.']
      ],
      actions: [
        ['mail', 'Send the invitation', 'gold', 'Invitation sent', true],
        ['eye', 'Preview the link', 'ghost', 'Preview opened', false]
      ]
    },
    'subs-manage': {
      title: 'Manage subscriptions', sub: 'Every plan in one place.',
      scope: '#${ref}',
      actions: [
        ['edit', 'Edit cadence', 'ghost', 'Cadence editor opened', false],
        ['gift', 'Send a gift box early', 'gold', 'Parcel marked for dispatch', true],
        ['clock', 'Pause the plan', 'ghost', 'Plan paused', true],
        ['trash', 'Cancel the plan', 'danger', 'Plan cancelled', true]
      ]
    },
    'my-order': {
      title: 'Order actions', sub: 'Track, reorder or ask the studio.',
      scope: '#${ref}',
      actions: [
        ['truck', 'Track this parcel', 'ghost', 'Live tracking opened', false],
        ['refresh', 'Reorder these items', 'gold', 'Added to your basket', false],
        ['dl', 'Download the invoice', 'ghost', 'Invoice download started', false],
        ['mail', 'Contact the studio', 'ghost', 'Message sent to Salem', true]
      ]
    },
    'addr': {
      title: 'Address details', sub: 'Used on invoices and delivery notes.',
      fields: [
        ['lb', 'Label', 'select', 'Home', ['Home', 'Studio', 'Gift recipient', 'Other']],
        ['fn', 'Full name', 'text', 'Elena Marchetti'],
        ['st', 'Street and number', 'text', 'MMR Complex, Chinna Thirupathi'],
        ['ct', 'City', 'text', 'Salem'],
        ['pc', 'Postcode', 'text', '50122'],
        ['co', 'Country', 'select', 'India', ['India', 'France', 'Japan', 'United Kingdom', 'United States']],
        ['ch', 'Studio collection', 'switch', '', 'Collect from the atelier instead of delivery.']
      ],
      actions: [
        ['check', 'Save address', 'gold', 'Address saved', true],
        ['trash', 'Remove this address', 'danger', 'Address removed', true]
      ]
    },
    'wishlist-add': {
      title: 'Save a box', sub: 'We will tell you the moment it is back.',
      fields: [
        ['bx', 'Box', 'select', 'Autumn Amber No. 04', ['Autumn Amber No. 04', 'Neroli & Bone China', 'Silk Ribbon Set', 'Travel Espresso Case', 'Cellar Notes']],
        ['nt', 'Why you saved it', 'textarea', ''],
        ['pr', 'Tell me if the price drops', 'switch', '', 'One email, never more.']
      ],
      actions: [
        ['heart', 'Save to wishlist', 'gold', 'Saved to your wishlist', true],
        ['eye', 'Preview the box', 'ghost', 'Preview opened', false]
      ]
    },
    'wishlist-share': {
      title: 'Sharing', sub: 'Let a few people know before you commit.',
      fields: [
        ['em', 'Share with', 'text', ''],
        ['ms', 'Message', 'textarea', 'Thinking of you for the season.']
      ],
      actions: [
        ['mail', 'Send the invitation', 'gold', 'Invitations sent', true]
      ]
    },
    'sub-edit': {
      title: 'Edit your plan', sub: 'Changes apply from the next box.',
      scope: '#${ref}',
      fields: [
        ['cd', 'Cadence', 'select', 'Every 6 weeks', ['Every month', 'Every 6 weeks', 'Every quarter', 'Seasonal']],
        ['bn', 'Box selection', 'select', 'Autumn Amber No. 04', ['Autumn Amber No. 04', 'Neroli & Bone China', 'Silk Ribbon Set', 'Surprise me']],
        ['nt', 'Note for the curator', 'textarea', ''],
        ['pa', 'Pause deliveries', 'switch', '', 'Hold the plan without losing anything.']
      ],
      actions: [
        ['check', 'Save the plan', 'gold', 'Plan updated', true],
        ['alert', 'Cancel the plan', 'danger', 'Plan cancelled', true]
      ]
    },
    'pay-add': {
      title: 'Add a payment method', sub: 'Stored with our processor, never on our servers.',
      fields: [
        ['bn', 'Cardholder name', 'text', 'Elena Marchetti'],
        ['cd', 'Card number', 'text', ''],
        ['ex', 'Expiry', 'text', 'MM / YY'],
        ['cv', 'Security code', 'text', ''],
        ['df', 'Default for the atelier', 'switch', '', 'Charge this card for every plan.']
      ],
      actions: [
        ['lock', 'Save the card', 'gold', 'Card saved securely', true],
        ['shield', 'Why we are safe', 'ghost', 'Security notes opened', false]
      ]
    },
    'photo': {
      title: 'Profile photo', sub: 'Square, at least 600 by 600 pixels.',
      fields: [['fi', 'Image file', 'file', '']],
      actions: [
        ['check', 'Use this photo', 'gold', 'Profile photo updated', true],
        ['trash', 'Remove photo', 'danger', 'Photo removed', true]
      ]
    },
    'password': {
      title: 'Change password', sub: 'You will stay signed in on this device only.',
      fields: [
        ['cu', 'Current password', 'password', ''],
        ['np', 'New password', 'password', ''],
        ['cf', 'Confirm new password', 'password', '']
      ],
      actions: [
        ['lock', 'Update password', 'gold', 'Password updated', true]
      ]
    }
  };

  function quickFields(fields) {
    return fields.map(([name, label, type, value, extra]) => {
      const id = `q-${name}`;
      if (type === 'switch') {
        return `<div class="q-sw"><div><b style="font-size:.9rem">${label}</b>` +
          (extra ? `<small>${extra}</small>` : '') + `</div>` +
          `<button class="sw" type="button" role="switch" aria-checked="false" data-switch style="margin-left:auto"></button></div>`;
      }
      let ctrl;
      if (type === 'select') {
        const opts = [value, ...(extra || [])].filter((v, i, a) => a.indexOf(v) === i)
          .map(o => `<option>${o}</option>`).join('');
        ctrl = `<select id="${id}" name="${name}">${opts}</select>`;
      } else if (type === 'textarea') {
        ctrl = `<textarea id="${id}" name="${name}" placeholder=" "></textarea>`;
      } else if (type === 'file') {
        return `<div class="q-drop" data-q-file><svg aria-hidden="true"><use href="#i-plus"/></svg>` +
          `<b>Drop an image or browse</b><small data-q-file-name>Nothing chosen yet</small>` +
          `<input type="file" accept="image/*" hidden></div>`;
      } else {
        ctrl = `<input id="${id}" name="${name}" type="${type === 'password' ? 'password' : 'text'}" placeholder=" " value="${value || ''}">`;
      }
      return `<div class="field">${ctrl}<label for="${id}">${label}</label></div>`;
    }).join('');
  }

  function appQuick() {
    const modal = $('#m-quick');
    if (!modal) return;
    const box = $('.app-modal-box', modal);
    const head = $('.panel-hd', box);
    const title = $('.panel-hd h2', box);
    const sub = $('.panel-hd p', box);
    const body = $('.panel-bd', box);
    if (!body) return;

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-modal-open="m-quick"]');
      if (!btn) return;
      const cfg = QUICK[btn.dataset.quick];
      if (!cfg) return;

      const row = btn.closest('tr, .lrow, .card, li');
      let ref = '';
      if (row) {
        const cell = row.querySelector('.t-strong, .lrow-main b, .card-t b, b');
        if (cell) ref = cell.textContent.trim();
      }
      if (cfg.scope) sub.textContent = cfg.scope.replace('${ref}', ref || cfg.sub);
      else sub.textContent = cfg.sub;
      title.textContent = ref && cfg.scope ? ref : cfg.title;

      const fields = cfg.fields ? quickFields(cfg.fields) : '';
      const acts = cfg.actions.map(([ic, label, kind, msg, close]) => {
        // with fields present the primary action submits the form instead
        const submit = fields && kind === 'gold';
        const attrs = submit ? 'type="submit" form="q-form" data-toast="' + msg + '"'
          : `type="button"${close ? ' data-modal-close' : ''} data-toast="${msg}"`;
        return `<button class="btn btn--${kind} btn--full" ${attrs}>` +
          `<svg aria-hidden="true"><use href="#i-${ic}"/></svg> ${label}</button>`;
      }).join('');

      body.innerHTML =
        (ref && cfg.scope ? `<div class="q-ref"><span class="mono">${ref}</span><span class="st st--wait">${row ? (($('.st', row) || {}).textContent || 'Queued').trim() : 'Queued'}</span></div>` : '') +
        (fields ? `<form class="app-form q-form" id="q-form" novalidate>${fields}</form>` : '') +
        `<div class="q-acts">${acts}</div>`;

      appBind(body);
      const form = $('.q-form', body);
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const missing = $$('[required]', form).filter(el => !el.value.trim());
          if (missing.length) {
            missing[0].focus();
            toast(`Fill in ${missing.length === 1 ? 'the highlighted field' : `${missing.length} fields`}`);
            return;
          }
          toast(cfg.title.replace(/s$/, '') + ' saved');
          appCloseModal(modal);
          setTimeout(() => { location.href = 'index.html'; }, 900);
        });
      }
      bindQuickFile(body);
      if (!REDUCED) {
        body.animate(
          [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' }
        );
      }
    }, true);
  }

  function bindQuickFile(scope) {
    const drop = $('[data-q-file]', scope);
    if (!drop) return;
    const input = $('input', drop);
    const name = $('[data-q-file-name]', drop);
    const pick = () => input.click();
    drop.addEventListener('click', pick);
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (!f) return;
      name.textContent = `${f.name} · ${(f.size / 1024).toFixed(0)} KB`;
      drop.classList.add('is-on');
      toast('Image ready to upload');
    });
  }

  function appShortcuts() {
    const input = $('.app-search input');
    if (!input) return;
    addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
    });

    // Enter treats the top-bar search as a real query, so it lands on the 404
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const pt = $('#pt');
      const target = 'index.html';
      if (pt && !REDUCED) {
        pt.classList.add('is-in');
        setTimeout(() => { location.href = target; }, 620);
      } else {
        location.href = target;
      }
    });

    // route the top-bar search into the table filter when there is one
    const dtSearch = $('[data-dt-search]');
    if (!dtSearch) return;
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        dtSearch.value = input.value;
        dtSearch.dispatchEvent(new Event('input'));
        const panel = dtSearch.closest('.panel');
        if (panel) panel.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
      }, 260);
    });
  }

  /* ---------- unified reveal engine ---------- */
  function appReveal() {
    const pad = $('.app-body-pad');
    if (!pad) return;

    if (REDUCED || !('IntersectionObserver' in window)) {
      $$('[data-rise]').forEach(el => el.classList.add('is-up'));
      $$('.kpi, .chart, .ring, .legend').forEach(el => el.classList.add('is-in', 'is-up'));
      $$('.bar i').forEach(i => { i.style.width = i.dataset.w || i.style.getPropertyValue('--w') || '0%'; });
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        el.classList.add('is-up');
        // KPI cards animate with their own block rather than being watched twice
        $$('.kpi', el).forEach(k => k.classList.add('is-up'));
        const paint = (el.dataset.paint || '');
        if (paint.includes('chart')) $$('.chart', el).forEach(c => c.classList.add('is-in'));
        if (paint.includes('ring')) $$('.ring', el).forEach(r => r.classList.add('is-in'));
        if (paint.includes('bars')) appBarsIn(el);
        io.unobserve(el);
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -6% 0px' });

    // 1. top level blocks fade up as a sequence
    [...pad.children].forEach((el, i) => {
      if (el.matches('.toolbar-strip')) return;
      el.setAttribute('data-rise', '');
      el.style.setProperty('--d', `${Math.min(i, 6) * 70}ms`);
      io.observe(el);
    });

    // 2. painted components mark their nearest revealed block
    $$('.chart').forEach(c => {
      const host = c.closest('[data-rise]');
      if (host) host.dataset.paint = (host.dataset.paint ? host.dataset.paint + ' chart' : 'chart');
      else { c.setAttribute('data-rise', ''); c.dataset.paint = 'chart'; io.observe(c); }
    });
    $$('.ring').forEach(r => {
      const host = r.closest('[data-rise]');
      if (host) host.dataset.paint = (host.dataset.paint ? host.dataset.paint + ' ring' : 'ring');
      else { r.setAttribute('data-rise', ''); r.dataset.paint = 'ring'; io.observe(r); }
    });
    $$('.panel, .app-mini').forEach(p => {
      if (p.querySelector('.bar')) p.dataset.paint = p.dataset.paint ? p.dataset.paint + ' bars' : 'bars';
    });

    // 3. KPI cards only animate alone, never inside an already-observed block
    $$('.kpi').forEach((k, i) => {
      if (k.closest('[data-rise]')) return;
      k.setAttribute('data-rise', '');
      k.style.setProperty('--d', `${i * 80}ms`);
      io.observe(k);
    });

    // 4. list internals cascade once their block is visible (delay only,
    //    the row animation itself is gated on .is-up in CSS)
    const cascade = (sel) => {
      $$(sel).forEach(list => {
        [...list.children].forEach((li, i) => {
          li.style.setProperty('--d', `${Math.min(i, 12) * 55}ms`);
        });
      });
    };
    cascade('.feed');
    cascade('.lrow');
    cascade('.dt tbody');
  }

  // paints bars, legends and table rows inside a freshly revealed block
  function appBarsIn(scope) {
    $$('.bar-row', scope).forEach((row, i) => {
      const bar = $('.bar', row);
      const fill = bar && bar.firstElementChild;
      if (!fill) return;
      const w = fill.dataset.w || fill.style.getPropertyValue('--w') || '0%';
      fill.style.width = '0%';
      bar.style.setProperty('--d', `${i * 70}ms`);
      requestAnimationFrame(() => setTimeout(() => { fill.style.width = w; }, 40));
    });
    $$('.legend', scope).forEach(lg => {
      [...lg.children].forEach((d, i) => d.style.setProperty('--d', `${180 + i * 60}ms`));
    });
  }

  // bars fill on first view even when the host block was already on screen
  function appBars() {
    const seen = new WeakSet();
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting || seen.has(e.target)) return;
        seen.add(e.target);
        appBarsIn(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.15 });
    $$('.panel, .plan, .app-mini').forEach(p => { if (p.querySelector('.bar')) io.observe(p); });
  }

  /* ---------- counters ---------- */
  function appCounters() {
    $$('[data-count]').forEach(el => {
      if (el.dataset.counted) return;
      el.dataset.counted = '1';
      const target = parseFloat(el.dataset.count);
      if (Number.isNaN(target)) return;
      const pre = el.dataset.pre ?? el.dataset.prefix ?? '';
      const suf = el.dataset.suf ?? el.dataset.suffix ?? '';
      const dec = Number(el.dataset.dec ?? ((el.dataset.count.split('.')[1] || '').length));
      const sep = el.dataset.sep ?? '1';
      const put = (k) => { el.textContent = pre + fmtNum(target * k, dec, sep) + suf; };
      const run = () => {
        if (REDUCED) { put(1); return; }
        const dur = 1500 + target * 1.6;
        const t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / dur);
          put(1 - Math.pow(1 - k, 3));
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      if (!('IntersectionObserver' in window)) return run();
      const o = new IntersectionObserver((en) => en.forEach(x => {
        if (x.isIntersecting) { run(); o.disconnect(); }
      }), { threshold: .35 });
      o.observe(el);
    });
  }

  // count a bare number out of existing markup, e.g. "$48.2k" or "318"
  function countText(el, dur) {
    const txt = (el.textContent || '').trim();
    const m = txt.match(/^([^0-9.,-]*)(-?[\d.,]+)(.*)$/);
    if (!m) return;
    const [, pre, num, suf] = m;
    const target = parseFloat(num.replace(/,/g, ''));
    if (Number.isNaN(target)) return;
    const dec = (num.split('.')[1] || '').length;
    const put = (k) => { el.textContent = pre + fmtNum(target * k, dec) + suf; };
    if (REDUCED) { put(1); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = clamp((t - t0) / (dur || 1400), 0, 1);
      put(1 - Math.pow(1 - k, 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- charts ---------- */
  function appCharts() {
    $$('[data-chart]').forEach((chart, ci) => {
      const kind = chart.dataset.chart;
      let data, labels;
      try { data = JSON.parse(chart.dataset.data || '[]'); } catch (err) { data = []; }
      try { labels = JSON.parse(chart.dataset.labels || '[]'); } catch (err) { labels = []; }
      if (!data.length) return;

      const W = 700, H = 224, padL = 44, padR = 16, padT = 16, padB = 30;
      const gid = `dgrad${ci}`;
      const max = Math.max(...data, 1) * 1.14;
      const span = W - padL - padR;
      const step = span / Math.max(1, data.length - (kind === 'bar' ? 0 : 1));
      const y = (v) => padT + (1 - v / max) * (H - padT - padB);
      const nice = (v) => {
        const a = Math.abs(v);
        if (a >= 1000) return NF.format(Math.round(v));
        if (a >= 100) return String(Math.round(v));
        if (a >= 10) return String(Math.round(v));
        return (Math.round(v * 10) / 10).toString();
      };
      let s = '';

      // grid + value axis
      for (let g = 0; g <= 4; g++) {
        const yy = padT + (H - padT - padB) / 4 * g;
        s += `<line class="grid-l" x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}"/>`;
        s += `<text class="v-t" x="${padL - 9}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${nice(max * (1 - g / 4))}</text>`;
      }

      const barW = kind === 'bar' ? Math.min(42, step * .56) : 0;
      const cx = (i) => kind === 'bar' ? padL + step * (i + .5) : padL + step * i;

      if (kind === 'bar') {
        data.forEach((v, i) => {
          const h = H - padB - y(v);
          const x = cx(i) - barW / 2;
          s += `<rect class="bar-r${i === 0 ? '' : ''}" x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1.5, h).toFixed(1)}" rx="6" style="transition-delay:${i * 65}ms"/>`;
        });
      }

      if (kind === 'line' || kind === 'area') {
        const pts = data.map((v, i) => [cx(i), y(v)]);
        const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
        s += `<path class="draw-in" style="--len:2400" d="${d}"/>`;
        if (kind === 'area') s += `<path class="area-f" d="${d} L${pts[pts.length - 1][0].toFixed(1)} ${H - padB} L${padL} ${H - padB} Z"/>`;
        s += `<path class="glow" d="${d}"/>`;
        pts.forEach((p, i) => {
          s += `<circle class="pt-c" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" style="--pd:${520 + i * 60}ms"/>`;
        });
        s += `<rect class="hl" x="0" y="${padT}" width="${W}" height="${H - padT - padB}"/>`;
      }

      // category axis, thinned out so labels never collide
      labels.forEach((l, i) => {
        const every = labels.length > 8 ? 2 : 1;
        if (i % every !== 0 && i !== labels.length - 1) return;
        s += `<text class="axis-t" x="${cx(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${l}</text>`;
      });

      chart.insertAdjacentHTML('afterbegin',
        `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${chart.dataset.chart} chart">` +
        `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="#c09b5b" stop-opacity=".36"/>` +
        `<stop offset="1" stop-color="#c09b5b" stop-opacity="0"/></linearGradient></defs>${s}</svg>`);
      chart.querySelector('.area-f')?.setAttribute('fill', `url(#${gid})`);
      // a preserveAspectRatio="none" svg would squash the strokes; keep it proportional
      const svg = $('svg', chart);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      const tip = document.createElement('div');
      tip.className = 'tip';
      chart.appendChild(tip);

      const place = (i) => {
        const cr = chart.getBoundingClientRect();
        const sr = svg.getBoundingClientRect();
        const kx = sr.width / W, ky = sr.height / H;
        tip.style.left = (sr.left - cr.left + cx(i) * kx) + 'px';
        tip.style.top = (sr.top - cr.top + (kind === 'bar' ? H - padB : y(data[i])) * ky) + 'px';
      };

      const NS = 'http://www.w3.org/2000/svg';
      const hot = (i) => {
        chart.classList.add('is-hi');
        $$('.bar-r', chart).forEach((r, n) => r.classList.toggle('is-hi', n === i));
        const pts = $$('.pt-c', chart);
        pts.forEach((p, n) => p.classList.toggle('is-on', n === i));
        if (labels[i] !== undefined) {
          tip.innerHTML = `<b>${labels[i]}</b><small>${kind === 'bar' ? nice(data[i]) + ' units' : '$' + fmtNum(data[i], 0)}</small>`;
        }
        place(i);
        tip.classList.add('is-on');
      };
      const cold = () => {
        chart.classList.remove('is-hi');
        $$('.bar-r.is-hi', chart).forEach(r => r.classList.remove('is-hi'));
        $$('.pt-c.is-on', chart).forEach(p => p.classList.remove('is-on'));
        tip.classList.remove('is-on');
      };

      data.forEach((v, i) => {
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('class', 'hit');
        r.setAttribute('x', (kind === 'bar' ? cx(i) - step / 2 : cx(i) - step / 2).toFixed(1));
        r.setAttribute('y', padT);
        r.setAttribute('width', step.toFixed(1));
        r.setAttribute('height', H - padT - padB);
        svg.appendChild(r);
        r.addEventListener('mouseenter', () => hot(i));
        r.addEventListener('mouseleave', cold);
      });

      addEventListener('resize', () => { if (chart.classList.contains('is-hi')) cold(); }, { passive: true });
    });
  }

  /* ---------- donut rings ---------- */
  const PALETTE = ['#c09b5b', '#b0715f', '#6f8069', '#3a2e26', '#9db096', '#8e6e3c'];

  function appRings() {
    $$('[data-ring]').forEach((ring) => {
      let parts;
      try { parts = JSON.parse(ring.dataset.ring); } catch (err) { return; }
      const g = ring.querySelector('.ring-arcs');
      const legend = ring.parentElement.querySelector('[data-ring-legend]');
      if (!g) return;

      const R = 42, C = 2 * Math.PI * R;
      const tot = parts.reduce((a, p) => a + (+p[1] || 0), 0) || 1;
      const GAP = Math.min(3.4, C / parts.length * .1);

      let off = 0;
      const arcs = parts.map(([label, raw], i) => {
        const v = +raw || 0;
        const len = (v / tot) * C;
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('class', 'arc');
        c.setAttribute('cx', 50); c.setAttribute('cy', 50); c.setAttribute('r', R);
        c.setAttribute('stroke', PALETTE[i % PALETTE.length]);
        c.setAttribute('stroke-dashoffset', (-off).toFixed(2));
        c.style.transitionDelay = `${i * 110}ms`;
        g.appendChild(c);
        off += len;
        return { node: c, label, v, end: Math.max(0, len - GAP).toFixed(2), C, i };
      });

      const centre = $('.ring-c b', ring);
      const centreRaw = centre ? centre.textContent.trim() : '';

      const paint = () => {
        arcs.forEach(a => a.node.setAttribute('stroke-dasharray', `0 ${a.C}`));
        requestAnimationFrame(() => setTimeout(() => {
          arcs.forEach(a => a.node.setAttribute('stroke-dasharray', `${a.end} ${a.C}`));
        }, REDUCED ? 0 : 40));
        if (centre) {
          centre.textContent = centreRaw;
          setTimeout(() => countText(centre, 1300), REDUCED ? 0 : 260);
        }
      };

      if (legend) {
        legend.innerHTML = parts.map(([label, raw], i) =>
          `<div style="--d:${i * 70}ms" data-i="${i}"><i style="background:${PALETTE[i % PALETTE.length]}"></i>` +
          `<span>${label}</span><b>${raw}</b></div>`).join('');
      }

      if (REDUCED || !('IntersectionObserver' in window)) { paint(); }
      else {
        const io = new IntersectionObserver((en) => en.forEach(e => {
          if (e.isIntersecting) { paint(); io.disconnect(); }
        }), { threshold: .3 });
        io.observe(ring);
      }

      // legend ↔ arc hover, and a bigger slice on focus
      if (legend) {
        arcs.forEach((a) => {
          const li = legend.querySelector(`[data-i="${a.i}"]`);
          if (!li) return;
          const on = () => { a.node.classList.add('lit'); arcs.forEach(o => { if (o !== a) o.node.classList.add('dim'); }); };
          const off = () => { a.node.classList.remove('lit', 'dim'); };
          li.addEventListener('mouseenter', on);
          li.addEventListener('mouseleave', off);
          a.node.addEventListener('mouseenter', on);
          a.node.addEventListener('mouseleave', off);
        });
      }
    });
  }

  /* ---------- sortable / filterable / paginated table ---------- */
  const normSt = (s) => {
    const t = (s || '').toLowerCase();
    if (/deliver|complete|active|paid|confirmed|shipped|in stock|healthy/.test(t)) return 'done';
    if (/pending|prep|await|processing|review|composing|scheduled|low|soon|transit/.test(t)) return 'pend';
    if (/cancell|refund|failed|low stock|reorder|exception|out of/.test(t)) return 'bad';
    return 'busy';
  };

  function dataTable() {
    $$('[data-dt]').forEach((tbl) => {
      const wrap = tbl.closest('[data-dt-wrap]') || tbl.parentElement;
      const scope = tbl.closest('[data-dt-scope]') || document;
      const body = $('tbody', tbl);
      const rows = $$('tbody tr', tbl);
      if (!rows.length) return;

      const search = $('[data-dt-search]', scope);
      const empty = $('[data-dt-empty]', scope);
      const pagerBox = $('[data-dt-pager]', scope);
      const chips = $$('[data-filter]', scope);
      const per = Number(tbl.dataset.dtPage || 8);
      let sortKey = '', dir = 1, page = 1, filter = 'all', painted = false;

      rows.forEach((tr) => {
        const st = tr.querySelector('.st');
        tr.dataset.g = normSt(st ? st.textContent : '');
      });

      const cellsOf = (tr) => $$('td', tr);
      const val = (td) => {
        const raw = (td.dataset.sort || td.textContent).trim();
        const num = parseFloat(raw.replace(/[^0-9.-]/g, ''));
        return !/\d/.test(raw) || Number.isNaN(num) ? raw.toLowerCase() : num;
      };

      const stagger = (visible) => {
        body.classList.remove('stagger');
        void body.offsetWidth;
        visible.forEach((tr, i) => tr.style.setProperty('--d', `${Math.min(i, 10) * 45}ms`));
        body.classList.add('stagger');
      };

      const paint = (animate) => {
        const q = (search && search.value || '').toLowerCase().trim();
        const visible = rows.filter((tr) => {
          if (filter !== 'all' && tr.dataset.g !== filter) return false;
          if (!q) return true;
          return tr.textContent.toLowerCase().includes(q);
        });
        const pages = Math.max(1, Math.ceil(visible.length / per));
        page = clamp(page, 1, pages);
        rows.forEach(tr => { tr.hidden = true; });
        visible.forEach((tr, i) => {
          tr.hidden = i < (page - 1) * per || i >= page * per;
        });
        if (animate) stagger(visible.slice((page - 1) * per, page * per));

        if (empty) {
          empty.hidden = visible.length !== 0;
          if (wrap) wrap.hidden = visible.length === 0;
        }
        $$('[data-dt-clear]', scope).forEach(b => { b.disabled = !q; });
        $$('[data-dt-count]', scope).forEach(el => { el.textContent = visible.length; });

        if (!pagerBox) return;
        pagerBox.innerHTML = '';
        if (pages < 2 && !q) return;
        const mk = (label, target, dis, on) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.innerHTML = label;
          b.disabled = dis;
          if (on) b.classList.add('is-on');
          b.setAttribute('aria-label', /^\d+$/.test(label) ? `Page ${label}` : label);
          b.addEventListener('click', () => { page = target; paint(true); });
          pagerBox.appendChild(b);
        };
        mk('Prev', page - 1, page === 1);
        const win = [];
        for (let p = 1; p <= pages; p++) {
          if (p === 1 || p === pages || Math.abs(p - page) <= 1) win.push(p);
          else if (win[win.length - 1] !== '…') win.push('…');
        }
        win.forEach((p) => {
          if (p === '…') {
            const s = document.createElement('span');
            s.textContent = '…';
            s.style.opacity = '.4';
            pagerBox.appendChild(s);
          } else mk(String(p), p, false, p === page);
        });
        mk('Next', page + 1, page === pages);
      };

      // sorting gets a FLIP animation so rows glide instead of jumping
      $$('th.sortable', tbl).forEach((th) => {
        th.setAttribute('role', 'button');
        th.setAttribute('tabindex', '0');
        const go = () => {
          const key = th.dataset.sort;
          if (!key) return;
          dir = sortKey === key ? dir * -1 : 1;
          sortKey = key;
          $$('th', tbl).forEach(o => { o.removeAttribute('data-dir'); o.removeAttribute('aria-sort'); });
          th.dataset.dir = dir === 1 ? 'asc' : 'desc';
          th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
          const i = $$('th', tbl).indexOf(th);

          const first = new Map();
          rows.forEach(r => first.set(r, r.getBoundingClientRect().top));
          rows.sort((a, b) => {
            const x = val(cellsOf(a)[i]), y = val(cellsOf(b)[i]);
            return x > y ? dir : x < y ? -dir : 0;
          });
          rows.forEach(r => body.appendChild(r));
          if (!REDUCED) {
            rows.forEach((r) => {
              const d = first.get(r) - r.getBoundingClientRect().top;
              if (!d) return;
              r.style.transform = `translateY(${d}px)`;
              r.classList.add('flip');
            });
            requestAnimationFrame(() => {
              rows.forEach(r => { r.style.transform = ''; });
              setTimeout(() => rows.forEach(r => r.classList.remove('flip')), 500);
            });
          }
          page = 1;
          paint(false);
        };
        th.addEventListener('click', go);
        th.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        });
      });

      if (search) search.addEventListener('input', () => { page = 1; paint(painted); });
      search && addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && search.value) { search.value = ''; page = 1; paint(true); }
      });

      chips.forEach((chip) => {
        const f = chip.dataset.filter;
        chip.addEventListener('click', () => {
          filter = filter === f && f !== 'all' ? 'all' : f;
          chips.forEach(c => {
            const on = c.dataset.filter === filter;
            c.classList.toggle('is-on', on);
            c.setAttribute('aria-selected', String(on));
          });
          page = 1;
          paint(true);
          const n = rows.filter(tr => filter === 'all' || tr.dataset.g === filter).length;
          toast(`${n} ${chip.textContent.trim().toLowerCase()}`);
        });
      });

      $$('[data-dt-clear]', scope).forEach(b => b.addEventListener('click', () => {
        if (search) { search.value = ''; search.dispatchEvent(new Event('input')); }
        chips.forEach(c => {
          const on = c.dataset.filter === 'all';
          c.classList.toggle('is-on', on);
          c.setAttribute('aria-selected', String(on));
        });
        filter = 'all';
        page = 1;
        paint(true);
        toast('Filters cleared');
      }));

      // stagger the first page once its block scrolls into view
      paint(false);
      const host = tbl.closest('[data-rise]') || scope;
      if (REDUCED || !('IntersectionObserver' in window)) painted = true;
      else {
        const io = new IntersectionObserver((en) => en.forEach(e => {
          if (e.isIntersecting) { painted = true; stagger(rows.slice(0, per)); io.disconnect(); }
        }), { threshold: .05 });
        io.observe(host);
      }
    });
  }

  /* ---------- tabs + segmented range switcher ---------- */
  function appTabs() {
    $$('[data-panel]').forEach((grp) => {
      const btns = $$('[data-tab]', grp);
      const panes = $$('[data-pane]', grp);
      btns.forEach(b => b.addEventListener('click', () => {
        btns.forEach(o => {
          o.classList.toggle('is-on', o === b);
          o.setAttribute('aria-selected', String(o === b));
        });
        panes.forEach(p => {
          const on = p.dataset.pane === b.dataset.tab;
          p.hidden = !on;
          if (on && !REDUCED) p.animate(
            [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
            { duration: 460, easing: 'cubic-bezier(.16,1,.3,1)' }
          );
        });
      }));
    });

    $$('[data-seg]').forEach((seg) => {
      const btns = $$('button', seg);
      const fit = () => {
        const on = seg.querySelector('button.is-on') || btns[0];
        if (!on) return;
        seg.style.setProperty('--seg-w', on.offsetWidth + 'px');
        seg.style.setProperty('--seg-x', on.offsetLeft + 'px');
      };
      btns.forEach(b => b.addEventListener('click', () => {
        if (b.classList.contains('is-on')) return;
        btns.forEach(o => {
          o.classList.toggle('is-on', o === b);
          o.setAttribute('aria-selected', String(o === b));
        });
        fit();
        const tgt = document.querySelector(seg.dataset.seg);
        const val = b.dataset.val;
        if (tgt && val) {
          const kpi = tgt.querySelector('[data-seg-val]') || tgt;
          if (kpi === tgt) kpi.dataset.val = val;
          else {
            kpi.textContent = val;
            if (!REDUCED) kpi.animate(
              [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
              { duration: 440, easing: 'cubic-bezier(.16,1,.3,1)' }
            );
          }
        }
      }));
      fit();
      addEventListener('resize', fit);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
      setTimeout(fit, 80);
    });
  }

  /* ---------- forms, modals, switches, copy ---------- */
  function appCloseModal(m) {
    if (!m) return;
    m.classList.remove('is-open');
    const opener = $(`[data-modal-open="${m.id}"]`);
    if (opener) opener.focus();
    if (!$('.app-modal.is-open')) document.body.classList.remove('is-locked');
  }

  // binds the small behaviour hooks; safe to call again for injected markup
  function appBind(scope) {
    $$('[data-modal-close]', scope).forEach(b => {
      if (b.dataset.appBound) return;
      b.dataset.appBound = '1';
      b.addEventListener('click', () => appCloseModal(b.closest('.app-modal')));
    });
    $$('[data-toast]', scope).forEach(b => {
      if (b.dataset.appBound) return;
      b.dataset.appBound = '1';
      b.addEventListener('click', () => toast(b.dataset.toast));
    });
    $$('[data-switch]', scope).forEach(sw => {
      if (sw.dataset.appBound) return;
      sw.dataset.appBound = '1';
      sw.addEventListener('click', () => {
        const on = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', String(on));
        const row = sw.closest('div');
        const label = row ? (($('b', row) || {}).textContent || '').trim() : '';
        if (label) toast(`${label} turned ${on ? 'on' : 'off'}`);
      });
    });
    $$('[data-copy]', scope).forEach(b => {
      if (b.dataset.appBound) return;
      b.dataset.appBound = '1';
      b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied to clipboard'); }
        catch (err) { toast('Copy failed'); }
      });
    });
  }

  function appForms() {
    $$('[data-app-form]').forEach(f => {
      const fields = () => $$('input, select, textarea', f);
      const syncFilledState = (el) => {
        const field = el.closest('.field');
        if (!field) return;
        const hasValue = el.type === 'select-one' ? el.value !== '' : el.value.trim() !== '';
        field.classList.toggle('is-filled', hasValue);
      };

      fields().forEach(el => {
        syncFilledState(el);
        el.addEventListener('blur', () => {
          if (el.type !== 'email') return;
          setFieldState(el, el.required && !el.value.trim() ? '' : emailError(el.value));
        });
        el.addEventListener('input', () => {
          syncFilledState(el);
          if (el.closest('.field')?.classList.contains('is-bad'))
            setFieldState(el, fieldError(el));
        });
        el.addEventListener('change', () => syncFilledState(el));
      });

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        let bad = null;
        fields().forEach(el => {
          if (!bad && fieldError(el)) bad = el;
        });
        if (bad) {
          setFieldState(bad, fieldError(bad));
          shake(bad);
          bad.focus();
          toast('Fill in all the required fields');
          return;
        }

        const btn = $('button[type="submit"]', f);
        const label = btn ? btn.innerHTML : '';
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span class="spin" aria-hidden="true"></span> Saving…';
        }
        setTimeout(() => {
          if (btn) { btn.disabled = false; btn.innerHTML = label; }
          toast((f.dataset.msg) || 'Saved');
          f.reset();
          fields().forEach(el => {
            setFieldState(el, '');
            syncFilledState(el);
          });
          setTimeout(() => { location.href = 'index.html'; }, 700);
        }, 900);
      });
    });

    // modal: open, close, focus trap, escape
    $$('[data-modal-open]').forEach(b => b.addEventListener('click', () => {
      const m = $('#' + b.dataset.modalOpen);
      if (!m) return;
      m.classList.add('is-open');
      document.body.classList.add('is-locked');
      setTimeout(() => {
        const first = $('input, select, textarea, button', m);
        if (first) first.focus();
      }, 260);
    }));
    $$('.app-modal').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) appCloseModal(m); }));
    addEventListener('keydown', (e) => {
      const open = $('.app-modal.is-open');
      if (!open) return;
      if (e.key === 'Escape') { appCloseModal(open); return; }
      if (e.key !== 'Tab') return;
      const f = $$('button, input, select, textarea, a[href]', open).filter(el => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    appBind(document);

    // cursor-following highlight on the small solid buttons
    if (FINE) $$('.app-body .btn--sm').forEach(b => b.addEventListener('mousemove', (e) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      b.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }));

    // lazily fade in the dashboard thumbnails once they decode
    $$('.skel-img img').forEach(img => {
      const go = () => { img.classList.add('is-in'); img.parentElement.classList.remove('skel'); };
      if (img.complete && img.naturalWidth) setTimeout(go, 120);
      else { img.addEventListener('load', go, { once: true }); img.addEventListener('error', () => img.remove(), { once: true }); }
    });
  }

  /* lazy dashboard thumbnails fade + settle in once decoded */
  function appImages() {
    $$('.lrow-thumb img, .skel-img img').forEach((img) => {
      const show = () => {
        img.classList.add('is-in');
        img.style.transitionDelay = `${Math.floor(Math.random() * 180)}ms`;
      };
      if (img.complete && img.naturalWidth) return show();
      img.addEventListener('load', show, { once: true });
      img.addEventListener('error', () => img.classList.add('is-in'), { once: true });
    });
  }

  function dashboard() {
    if (!$('.app-body-pad')) return;
    dashboardSectionActions();
    appCharts();
    appRings();
    appTabs();
    appBars();
    appReveal();
    appCounters();
    dataTable();
    appShell();
    appQuick();
    appForms();
    appImages();
  }

  function dashboardSectionActions() {
    const main = $('.app-main');
    if (!main) return;

    const isFilter = (control) =>
      control.matches('button[data-filter], button[data-dt-clear]') ||
      control.matches('.seg[data-seg] button');

    main.addEventListener('click', (event) => {
      const origin = event.target instanceof Element ? event.target : event.target.parentElement;
      const control = origin && origin.closest('a[href], button');
      if (!control || control.closest('.app-top') || control.closest('form[data-app-form]') || control.hasAttribute('data-signout') || isFilter(control)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign('index.html');
    }, true);

    main.addEventListener('submit', (event) => {
      const form = event.target;
      if (form && form.closest('form[data-app-form]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign('index.html');
    }, true);
  }

  /* ---------------------------------------------------------
     29. Bootstrap
     --------------------------------------------------------- */
  function refresh() { splitText(); reveals(); lineReveals(); }

  function init() {
    const app = !!$('.app-body');
    splitText();
    preloader();
    reveals();
    lineReveals();
    if (!app) counters();          // the dashboards run their own counter engine
    nav();
    cursor();
    parallax();
    marquee();
    drawer();
    accordion();
    carousels();
    filters();
    tilt();
    spotlight();
    lightbox();
    shop();
    quickview();
    forms();
    newsletters();
    hours();
    maps();
    activeNav();
    pageTransition();
    anchors();
    heroIn();
    blobs();
    eagerHero();
    authPages();
    authRole();
    identity();
    errorPage();
    if (app) dashboard();
    if (!REDUCED) requestAnimationFrame(tick);
  }

  let rt;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { parallax(); refresh(); }, 220);
  });

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
})();
