// Радио в машине (T). Поиск станций идёт по открытому каталогу radio-browser.info:
// он отдаёт JSON с CORS, поэтому браузер может искать сам, без игрового сервера.
// Играем только https-потоки: на https-странице браузер блокирует http-звук.
// Если каталог недоступен (нет сети, закрыт), остаётся встроенный список и ручная
// вставка ссылки на поток — радио работает всегда, «любым способом».

export interface RadioStation {
  id: string;
  name: string;
  url: string;
  country?: string;
  genre?: string;
}

/** запасной список: короткие https-потоки, которые не требуют ключей */
const SEED: RadioStation[] = [
  { id: 'seed-1', name: 'SomaFM · Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3', country: 'US', genre: 'chill' },
  { id: 'seed-2', name: 'SomaFM · Beat Blender', url: 'https://ice1.somafm.com/beatblender-128-mp3', country: 'US', genre: 'house' },
  { id: 'seed-3', name: 'SomaFM · Deep Space One', url: 'https://ice1.somafm.com/deepspaceone-128-mp3', country: 'US', genre: 'ambient' },
  { id: 'seed-4', name: 'SomaFM · Indie Pop Rocks', url: 'https://ice1.somafm.com/indiepop-128-mp3', country: 'US', genre: 'indie' },
  { id: 'seed-5', name: 'Radio Paradise · Main Mix', url: 'https://stream.radioparadise.com/mp3-128', country: 'US', genre: 'rock' },
  { id: 'seed-6', name: 'Radio Paradise · Mellow', url: 'https://stream.radioparadise.com/mellow-128', country: 'US', genre: 'chill' },
  { id: 'seed-7', name: 'Radio Record · Trance', url: 'https://radiorecord.hostingradio.ru/trance96.aacp', country: 'RU', genre: 'trance' },
  { id: 'seed-8', name: 'Radio Record · Русское', url: 'https://radiorecord.hostingradio.ru/rr96.aacp', country: 'RU', genre: 'pop' },
];

const API = [
  'https://de1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
];

export type RadioState = { station: RadioStation | null; playing: boolean; loading: boolean; error: string };

export class Radio {
  private audio: HTMLAudioElement | null = null;
  list: RadioStation[] = [...SEED];
  station: RadioStation | null = null;
  playing = false;
  loading = false;
  error = '';
  volume = 0.7;
  onChange: (() => void) | null = null;
  /** внешняя синхронизация: вызывается при локальном изменении состояния радио */
  onSync: ((url: string, playing: boolean) => void) | null = null;

  private emit() { this.onChange?.(); }

  /** ленивое создание <audio>: браузер разрешает звук только после касания/нажатия */
  private el(): HTMLAudioElement {
    if (!this.audio) {
      const a = new Audio();
      a.preload = 'none';
      a.volume = this.volume;
      a.addEventListener('playing', () => { this.playing = true; this.loading = false; this.error = ''; this.emit(); });
      a.addEventListener('pause', () => { this.playing = false; this.emit(); });
      a.addEventListener('waiting', () => { this.loading = true; this.emit(); });
      a.addEventListener('error', () => {
        this.playing = false; this.loading = false;
        this.error = 'Поток не отвечает — выберите другую станцию';
        this.emit();
      });
      this.audio = a;
    }
    return this.audio;
  }

  state(): RadioState { return { station: this.station, playing: this.playing, loading: this.loading, error: this.error }; }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.audio) this.audio.volume = this.volume;
    this.emit();
  }

  play(st: RadioStation) {
    this.station = st;
    this.error = '';
    this.loading = true;
    const a = this.el();
    a.src = st.url;
    a.volume = this.volume;
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => { this.loading = false; this.error = 'Не удалось включить — нажмите ещё раз'; this.emit(); });
    this.emit();
    const url = st.url;
    setTimeout(() => { if (this.playing && this.station && this.station.url === url) this.onSync?.(url, true); }, 500);
  }

  resume() { if (this.station) this.play(this.station); }
  pause() { this.audio?.pause(); this.playing = false; this.emit(); this.onSync?.('', false); }
  stop() { if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } this.playing = false; this.loading = false; this.emit(); this.onSync?.('', false); }
  toggle() {
    if (this.playing) this.pause();
    else if (this.station) this.resume();
    else if (this.list[0]) this.play(this.list[0]);
  }

  next(step = 1) {
    if (!this.list.length) return;
    const i = this.station ? this.list.findIndex((s) => s.id === this.station!.id) : -1;
    const n = ((i + step) % this.list.length + this.list.length) % this.list.length;
    this.play(this.list[n]);
  }

  /** ссылка на поток вручную: «любым способом» */
  playUrl(url: string, name = 'Своя волна') {
    const clean = url.trim();
    if (!/^https?:\/\//i.test(clean)) { this.error = 'Нужна ссылка на поток, например https://…/stream.mp3'; this.emit(); return; }
    if (/^http:\/\//i.test(clean) && typeof location !== 'undefined' && location.protocol === 'https:') {
      this.error = 'На https-странице http-поток браузер блокирует — ищите https-ссылку';
      this.emit();
      return;
    }
    const st: RadioStation = { id: 'custom-' + clean.slice(-24), name, url: clean };
    this.list = [st, ...this.list.filter((s) => s.url !== clean)];
    this.play(st);
  }

  /**
   * Поиск станций по названию, жанру или городу.
   * Каталог отдаёт до 40 станций; берём только https, иначе браузер молчит.
   */
  async search(q: string): Promise<RadioStation[]> {
    const query = q.trim();
    this.loading = true; this.error = ''; this.emit();
    const local = SEED.filter((s) => !query || (s.name + ' ' + (s.genre ?? '')).toLowerCase().includes(query.toLowerCase()));
    if (query.length < 2) { this.list = [...SEED]; this.loading = false; this.emit(); return this.list; }
    for (const host of API) {
      try {
        const u = `${host}/json/stations/search?limit=60&hidebroken=true&order=clickcount&reverse=true&name=${encodeURIComponent(query)}`;
        const r = await fetch(u, { headers: { Accept: 'application/json' } });
        if (!r.ok) continue;
        const rows = (await r.json()) as { stationuuid: string; name: string; url_resolved: string; country?: string; tags?: string }[];
        const found = rows
          .filter((x) => /^https:\/\//i.test(String(x.url_resolved || '')))
          .map((x) => ({
            id: x.stationuuid,
            name: String(x.name || 'Без названия').trim().slice(0, 48),
            url: String(x.url_resolved),
            country: x.country,
            genre: (x.tags || '').split(',')[0]?.trim().slice(0, 18),
          }));
        this.list = [...local, ...found].slice(0, 50);
        if (!found.length) this.error = 'В каталоге нет https-потоков по этому запросу — попробуйте другое слово';
        this.loading = false; this.emit();
        return this.list;
      } catch { /* следующее зеркало */ }
    }
    // каталог недоступен: играем то, что есть, и говорим об этом честно
    this.list = [...local];
    this.error = local.length ? 'Каталог не отвечает — показаны встроенные станции' : 'Каталог не отвечает, вставьте ссылку на поток';
    this.loading = false; this.emit();
    return this.list;
  }

  dispose() { try { this.stop(); } catch { /* */ } this.onChange = null; this.audio = null; }
}
