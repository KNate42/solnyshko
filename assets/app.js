(() => {
  'use strict';

  // ——— Что можно поменять ———
  const ANSWER = { day: 29, month: 12 }; // годовщина: 29 декабря
  const START = { day: 14, month: 2 }; // с какой даты стартуют барабаны
  const TEXT = {
    dateHints: ['Не то. Подумай ещё', 'Подсказка: это было зимой', 'Подсказка: прямо перед Новым годом'],
    dateMonthRight: 'Месяц верный. А день?',
    dateDayRight: 'День верный. А месяц?',
    loveNo: 'Не верю :)',
    giftNo: 'А я всё равно покажу :)',
  };

  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const THEME = ['#0b0a26', '#0c0d31', '#141c51', '#273a82', '#a3b9ee'];
  const STORAGE_KEY = 'solnyshko:opened';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reduceMotion ? Math.min(ms, 250) : ms));
  const vibrate = (pattern) => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* не везде есть */ } };
  const storage = {
    get() { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; } },
    set() { try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* приватный режим */ } },
    clear() { try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* приватный режим */ } },
  };

  const screens = {};
  $$('.screen').forEach((s) => { screens[s.dataset.screen] = s; });
  const skyLayers = $$('.sky__layer');
  const progress = $('.progress');
  const progressItems = $$('li', progress);
  const themeMeta = $('meta[name="theme-color"]');
  const picker = $('.picker');
  let current = screens.intro;
  let busy = false;
  let attempts = 0;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // ——— Небо ———
  let coverTimer = 0;
  function setStage(n) {
    root.dataset.stage = String(n);
    themeMeta.setAttribute('content', THEME[n]);
    skyLayers[n].classList.remove('is-covered');
    skyLayers[n].classList.add('is-on');
    // когда новый слой проявился, нижние можно не рисовать
    clearTimeout(coverTimer);
    coverTimer = setTimeout(() => {
      skyLayers.forEach((layer, i) => layer.classList.toggle('is-covered', i < n));
    }, 3200);
  }

  function scatterStars() {
    const counts = [26, 34, 12];
    $$('.stars i').forEach((el, group) => {
      const shadows = [];
      for (let k = 0; k < counts[group]; k++) {
        const x = (Math.random() * 100).toFixed(2);
        const y = (Math.pow(Math.random(), 1.5) * 74).toFixed(2);
        const a = (0.55 + Math.random() * 0.45).toFixed(2);
        const blur = group === 2 ? '1px' : '0';
        shadows.push(`${x}vw ${y}vh ${blur} 0 rgba(255, ${238 + (k % 3) * 6}, ${226 + (k % 4) * 8}, ${a})`);
      }
      el.style.boxShadow = shadows.join(',');
    });
  }

  function pulseSun() {
    if (reduceMotion || !Element.prototype.animate) return;
    $('.sun__glow').animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.35 }, { transform: 'scale(1)' }],
      { duration: 1500, easing: 'ease-in-out' }
    );
  }

  // Шарик света летит от нажатой кнопки к солнцу (или к горизонту, пока солнце за холмами)
  function flyOrb(fromEl) {
    if (reduceMotion || !Element.prototype.animate) return Promise.resolve();
    const from = fromEl.getBoundingClientRect();
    const sun = $('.sun__disc').getBoundingClientRect();
    const x0 = from.left + from.width / 2;
    const y0 = from.top + from.height / 2;
    const x1 = sun.left + sun.width / 2;
    const y1 = Math.min(sun.top + sun.height / 2, window.innerHeight * 0.8);
    const orb = document.createElement('div');
    orb.className = 'orb';
    document.body.appendChild(orb);
    const anim = orb.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.4)`, opacity: 0 },
      { transform: `translate(${x0}px, ${y0 - 34}px) scale(1)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${x1}px, ${y1}px) scale(.55)`, opacity: 0.95, offset: 0.86 },
      { transform: `translate(${x1}px, ${y1}px) scale(2.4)`, opacity: 0 },
    ], { duration: 1150, easing: 'cubic-bezier(.45, .05, .25, 1)', fill: 'forwards' });
    return new Promise((resolve) => {
      anim.onfinish = () => { orb.remove(); resolve(); };
      anim.oncancel = anim.onfinish;
    });
  }

  // ——— Экраны ———
  $$('.screen').forEach((screen) => {
    $$('.reveal', screen).forEach((el, i) => el.style.setProperty('--i', i));
  });

  async function hide(screen) {
    screen.classList.add('is-leaving');
    await wait(450);
    screen.hidden = true;
    screen.classList.remove('is-leaving', 'is-in');
  }

  function reveal(screen) {
    screen.hidden = false;
    if (screen === screens.date) wheels.forEach((w) => w.sync());
    screen.getBoundingClientRect(); // чтобы переход стартовал с начального состояния
    screen.classList.add('is-in');
    current = screen;
    const heading = $('[tabindex="-1"]', screen);
    if (heading) heading.focus({ preventScroll: true });
  }

  // ——— Барабаны даты ———
  function createWheel(el, labels, initial) {
    const list = $('ol', el);
    labels.forEach((label, i) => {
      const li = document.createElement('li');
      li.textContent = label;
      li.dataset.i = String(i);
      list.appendChild(li);
    });
    const items = Array.from(list.children);
    const last = items.length - 1;
    let itemH = 46;
    let index = -1;
    let frame = 0;
    let target = -1; // куда барабан едет сейчас: быстрые нажатия стрелок считаются от цели, а не от текущей позиции
    const clamp = (i) => Math.max(0, Math.min(last, i));

    function render() {
      frame = 0;
      const pos = el.scrollTop / itemH;
      const from = clamp(Math.floor(pos) - 3);
      const to = clamp(Math.ceil(pos) + 3);
      for (let k = from; k <= to; k++) {
        const d = k - pos;
        items[k].style.transform = `perspective(340px) rotateX(${(-d * 20).toFixed(2)}deg)`;
        items[k].style.opacity = Math.max(0.1, 1 - Math.abs(d) * 0.3).toFixed(3);
      }
      const i = clamp(Math.round(pos));
      if (i === target) target = -1;
      if (i !== index) {
        if (index >= 0) items[index].classList.remove('is-active');
        items[i].classList.add('is-active');
        index = i;
        el.setAttribute('aria-valuenow', String(i + 1));
        el.setAttribute('aria-valuetext', labels[i]);
      }
    }

    function scrollToIndex(i) {
      target = clamp(i);
      el.scrollTo({ top: target * itemH, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    el.setAttribute('aria-valuemin', '1');
    el.setAttribute('aria-valuemax', String(labels.length));
    el.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(render); }, { passive: true });
    // если барабан крутят пальцем или колесом, запомненная цель больше не актуальна
    ['pointerdown', 'wheel'].forEach((type) => el.addEventListener(type, () => { target = -1; }, { passive: true }));
    list.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (li) scrollToIndex(Number(li.dataset.i));
    });
    el.addEventListener('keydown', (e) => {
      const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 };
      if (e.key in steps) { e.preventDefault(); scrollToIndex((target >= 0 ? target : index) + steps[e.key]); }
      else if (e.key === 'Home') { e.preventDefault(); scrollToIndex(0); }
      else if (e.key === 'End') { e.preventDefault(); scrollToIndex(last); }
    });

    return {
      get value() { return clamp(Math.round(el.scrollTop / itemH)); },
      sync() {
        itemH = items[0].offsetHeight || itemH;
        el.scrollTop = initial * itemH;
        render();
      },
    };
  }

  const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const dayWheel = createWheel($('[data-wheel="day"]'), days, START.day - 1);
  const monthWheel = createWheel($('[data-wheel="month"]'), MONTHS, START.month - 1);
  const wheels = [dayWheel, monthWheel];

  // ——— Типографика: короткие слова, тире и смайлик не остаются в конце/начале строки одни ———
  function typograph(s) {
    const words = s.replace(/\s+/g, ' ').trim().split(' ');
    let out = words[0];
    for (let i = 1; i < words.length; i++) {
      const prev = words[i - 1].replace(/^[«("]+/, '');
      const next = words[i];
      const glue = /^[а-яё]{1,2}$/i.test(prev) || next === '—' || next.indexOf(':)') === 0;
      out += (glue ? '\u00A0' : ' ') + next;
    }
    return out;
  }

  $$('.question, .lead').forEach((el) => { el.textContent = typograph(el.textContent); });

  // ——— Письмо: делим на предложения, чтобы проявлять их по очереди ———

  function prepareLetter() {
    const blocks = [$('.letter__hello'), ...$$('.letter__body p'), $('.letter__thanks')];
    const units = [];
    blocks.forEach((block) => {
      const text = block.textContent.replace(/\s+/g, ' ').trim();
      const sentences = text.replace(/([.!?…)]+)\s+(?=[А-ЯЁA-Z«])/g, '$1\n').split('\n');
      block.textContent = '';
      sentences.forEach((sentence, i) => {
        const span = document.createElement('span');
        span.className = 's';
        span.textContent = typograph(sentence);
        block.appendChild(span);
        units.push(span);
        if (i < sentences.length - 1) block.appendChild(document.createTextNode(' '));
      });
    });
    return units;
  }

  const letterUnits = prepareLetter();

  function lightUp(step) {
    letterUnits.forEach((unit, i) => {
      setTimeout(() => unit.classList.add('is-lit'), reduceMotion ? 0 : i * step);
    });
  }

  // ——— Сердечки на холсте ———
  const particles = createParticles($('.particles'));

  function createParticles(canvas) {
    const ctx = canvas.getContext('2d');
    const HEART = new Path2D('M12 20.7C7.2 17 3 13.4 3 9.3 3 6.6 5.1 4.5 7.8 4.5c1.7 0 3.2.9 4.2 2.3 1-1.4 2.5-2.3 4.2-2.3 2.7 0 4.8 2.1 4.8 4.8 0 4.1-4.2 7.7-9 11.4Z');
    const COLORS = ['#f27ba1', '#ff9fbd', '#ffc3d4', '#ffd27a', '#fff0c4'];
    const SPRITE = 64;
    const PAD = 16;
    const sprites = COLORS.map((color) => {
      const c = document.createElement('canvas');
      c.width = c.height = SPRITE + PAD * 2;
      const g = c.getContext('2d');
      g.shadowColor = color;
      g.shadowBlur = 14;
      g.translate(PAD, PAD);
      g.scale(SPRITE / 24, SPRITE / 24);
      g.fillStyle = color;
      g.fill(HEART);
      return c;
    });
    const list = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let lastT = 0;
    let ambient = false;
    let spawnClock = 0;

    function resize() {
      const r = canvas.getBoundingClientRect();
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      if (r.width === w && r.height === h && nextDpr === dpr) return;
      w = r.width;
      h = r.height;
      dpr = nextDpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    function add(x, y, o) {
      list.push({
        x, y,
        vx: o.vx || 0,
        vy: o.vy,
        size: o.size,
        sprite: sprites[(Math.random() * sprites.length) | 0],
        rot: (Math.random() - 0.5) * 0.7,
        spin: (Math.random() - 0.5) * 0.8,
        sway: 6 + Math.random() * 16,
        phase: Math.random() * Math.PI * 2,
        freq: 0.15 + Math.random() * 0.2,
        age: 0,
        life: o.life,
        alpha: o.alpha,
        burst: !!o.burst,
      });
    }

    function addAmbient(y) {
      add(Math.random() * w, y, {
        vy: -(16 + Math.random() * 24),
        size: 9 + Math.random() * 13,
        life: 60,
        alpha: 0.35 + Math.random() * 0.4,
      });
    }

    function tick(t) {
      const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
      lastT = t;
      if (ambient) {
        spawnClock += dt;
        if (spawnClock > 0.9 && list.length < 22) { spawnClock = 0; addAmbient(h + 30); }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.burst) {
          const drag = Math.exp(-2.4 * dt);
          p.vx *= drag;
          p.vy = p.vy * drag - 26 * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        let a;
        if (p.burst) a = p.alpha * (1 - Math.pow(p.age / p.life, 2));
        else a = p.alpha * Math.min(1, p.age / 1.5, p.y / (h * 0.14), p.life - p.age);
        if (p.age >= p.life || p.y < -40 || a <= 0) { list.splice(i, 1); continue; }
        const x = p.x + Math.sin(p.phase + p.age * p.freq * Math.PI * 2) * p.sway;
        const s = p.size * (SPRITE + PAD * 2) / SPRITE;
        const cos = Math.cos(p.rot) * dpr;
        const sin = Math.sin(p.rot) * dpr;
        ctx.globalAlpha = a;
        ctx.setTransform(cos, sin, -sin, cos, x * dpr, p.y * dpr);
        ctx.drawImage(p.sprite, -s / 2, -s / 2, s, s);
      }
      if (list.length || ambient) raf = requestAnimationFrame(tick);
      else { raf = 0; lastT = 0; }
    }

    function run() { if (!raf) raf = requestAnimationFrame(tick); }

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });

    return {
      start() {
        resize();
        if (reduceMotion) return;
        ambient = true;
        for (let k = 0; k < 7; k++) addAmbient(h * (0.35 + Math.random() * 0.6));
        run();
      },
      setAmbient(on) {
        if (reduceMotion || on === ambient) return;
        ambient = on;
        if (on) {
          for (let k = 0; k < 5; k++) addAmbient(h * (0.3 + Math.random() * 0.6));
          run();
        } else {
          // оставшиеся сердечки плавно гаснут за секунду, после чего цикл останавливается
          list.forEach((p) => { if (!p.burst) p.life = Math.min(p.life, p.age + 1); });
        }
      },
      burst(x, y, n) {
        resize();
        for (let k = 0; k < n; k++) {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
          const speed = 140 + Math.random() * 230;
          add(x, y, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 10 + Math.random() * 14,
            life: 1.3 + Math.random() * 0.9,
            alpha: 0.95,
            burst: true,
          });
        }
        run();
      },
    };
  }

  // ——— Сценарий ———
  async function start() {
    busy = true;
    if (document.fonts) document.fonts.load('1em "Great Vibes"', 'Мое солнышко').catch(() => {});
    await hide(current);
    setStage(1);
    progress.classList.add('is-on');
    await wait(500);
    reveal(screens.date);
    busy = false;
  }

  async function advance(fromEl, step, next) {
    const orb = flyOrb(fromEl);
    await wait(250);
    await hide(current);
    await orb;
    progressItems[step - 1].classList.add('is-done');
    pulseSun();
    setStage(step + 1);
    await wait(700);
    reveal(next);
  }

  async function checkDate() {
    const day = dayWheel.value + 1;
    const month = monthWheel.value + 1;
    const note = $('[data-note="date"]');
    if (day === ANSWER.day && month === ANSWER.month) {
      busy = true;
      note.textContent = '';
      vibrate(12);
      await advance($('[data-action="check-date"]'), 1, screens.love);
      busy = false;
      return;
    }
    attempts += 1;
    if (month === ANSWER.month) note.textContent = TEXT.dateMonthRight;
    else if (day === ANSWER.day) note.textContent = TEXT.dateDayRight;
    else note.textContent = TEXT.dateHints[Math.min(attempts, TEXT.dateHints.length) - 1];
    picker.classList.remove('is-wrong');
    void picker.offsetWidth;
    picker.classList.add('is-wrong');
    vibrate([16, 60, 16]);
  }

  async function answer(btn) {
    busy = true;
    const screen = btn.closest('.screen');
    const isLove = screen.dataset.screen === 'love';
    $$('button', screen).forEach((b) => { b.disabled = true; });
    if (btn.dataset.answer === 'no') {
      $('.note', screen).textContent = isLove ? TEXT.loveNo : TEXT.giftNo;
      await wait(1600);
    }
    if (isLove) {
      await advance(btn, 2, screens.gift);
      busy = false;
    } else {
      await finale(btn);
    }
  }

  async function finale(fromEl) {
    const orb = flyOrb(fromEl);
    await wait(250);
    await hide(current);
    await orb;
    progressItems[2].classList.add('is-done');
    pulseSun();
    await wait(600);
    progress.classList.remove('is-on');
    setStage(4);
    await wait(1300);
    $('.flash').classList.add('is-on'); // мягкая вспышка, когда солнце почти поднялось
    await wait(300);
    particles.start();
    await wait(1100);
    const sun = $('.sun__disc').getBoundingClientRect();
    if (!reduceMotion) particles.burst(sun.left + sun.width / 2, sun.top + sun.height / 2, 16);
    window.scrollTo(0, 0);
    reveal(screens.letter);
    watchReading();
    storage.set();
    await wait(600);
    lightUp(420);
  }

  // Повторный визит: сразу утро и письмо, без вопросов
  function restore() {
    root.classList.add('no-anim');
    setStage(4);
    screens.intro.hidden = true;
    root.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.remove('no-anim');
      reveal(screens.letter);
      particles.start();
      watchReading();
      lightUp(90);
    }));
  }

  // Когда письмо прокручено и небо у солнца скрыто, сердечки не запускаем
  let readingFrame = 0;
  function watchReading() {
    const update = () => {
      readingFrame = 0;
      particles.setAmbient(window.scrollY <= window.innerHeight * 0.35);
    };
    window.addEventListener('scroll', () => {
      if (!readingFrame) readingFrame = requestAnimationFrame(update);
    }, { passive: true });
  }

  function replay() {
    storage.clear();
    window.location.reload();
  }

  function hearts(btn) {
    const r = btn.getBoundingClientRect();
    particles.burst(r.left + r.width / 2, r.top + r.height / 2, 18);
    vibrate(10);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'hearts') return hearts(btn);
    if (action === 'replay') return replay();
    if (busy) return;
    if (action === 'start') start();
    else if (action === 'check-date') checkDate();
    else if (btn.dataset.answer) answer(btn);
  });

  // ——— Запуск: ждём шрифты, чтобы текст не прыгал ———
  scatterStars();
  const fontsReady = document.fonts
    ? Promise.race([
      Promise.all([
        document.fonts.load('italic 1em "Bona Nova"', 'Это для тебя'),
        document.fonts.load('1em "Bona Nova"', 'Сначала ответь'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]).catch(() => {})
    : Promise.resolve();

  fontsReady.then(() => {
    if (storage.get()) restore();
    else reveal(screens.intro);
  });
})();
