const form = document.querySelector('#analysisForm');
const input = document.querySelector('#videoUrl');
const button = document.querySelector('#analyzeButton');
const state = document.querySelector('#analysisState');
const error = document.querySelector('#formError');
const report = document.querySelector('#report');
let installPrompt;

const validTikTokHosts = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);
const verdictLabels = { supported: 'Didukung sumber', false: 'Tidak akurat', misleading: 'Menyesatkan', unverified: 'Belum terverifikasi', mixed: 'Sebagian benar' };
const levelLabels = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi', unknown: 'Belum diketahui' };

function parseTikTokUrl(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !validTikTokHosts.has(url.hostname.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
}

function showState(kind, title, message, withRetry = false) {
  state.replaceChildren();
  state.dataset.kind = kind;
  const symbol = document.createElement('span');
  symbol.className = 'state-symbol';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = kind === 'pending' ? '↻' : kind === 'error' ? '!' : 'i';
  const copy = document.createElement('div');
  copy.className = 'state-copy';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const detail = document.createElement('p');
  detail.textContent = message;
  copy.append(heading, detail);
  if (withRetry) {
    const retry = document.createElement('button');
    retry.className = 'state-retry';
    retry.type = 'button';
    retry.textContent = 'Coba lagi';
    retry.addEventListener('click', () => form.requestSubmit());
    copy.append(retry);
  }
  state.append(symbol, copy);
  state.hidden = false;
}

function setLoading(loading) {
  button.disabled = loading;
  button.querySelector('.button-label').textContent = loading ? 'Memeriksa…' : 'Periksa video';
  input.readOnly = loading;
  form.setAttribute('aria-busy', String(loading));
}

function appendMetric(container, label, value) {
  const row = document.createElement('div');
  row.className = 'metric-row';
  const name = document.createElement('span');
  name.textContent = label;
  const result = document.createElement('span');
  result.textContent = value == null ? '—' : String(value);
  row.append(name, result);
  container.append(row);
}

function confidenceLabel(value) {
  if (!['low', 'medium', 'high'].includes(value)) return null;
  return `Keyakinan: ${value === 'low' ? 'rendah' : value === 'medium' ? 'sedang' : 'tinggi'}`;
}

function safeText(value, fallback = 'Tidak tersedia.') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function renderReport(data, submittedUrl) {
  const normalizedUrl = parseTikTokUrl(submittedUrl)?.href || submittedUrl;
  const videoLink = document.querySelector('#reportVideoLink');
  videoLink.href = normalizedUrl;
  videoLink.textContent = data.video?.title ? `${data.video.title} · ${normalizedUrl}` : normalizedUrl;
  const status = document.querySelector('#reportStatus');
  const isPartial = data.status === 'partial';
  status.textContent = isPartial ? 'Sebagian diperiksa' : 'Pemeriksaan selesai';
  status.dataset.status = isPartial ? 'partial' : 'complete';

  const coverage = document.querySelector('#reportCoverage');
  coverage.replaceChildren();
  const limitations = Array.isArray(data.limitations) ? data.limitations.filter((item) => typeof item === 'string' && item.trim()) : [];
  coverage.hidden = limitations.length === 0;
  if (limitations.length) coverage.textContent = `Belum dapat diperiksa: ${limitations.join(' ')}`;

  const comments = document.querySelector('#commentsContent');
  comments.replaceChildren();
  if (data.comments && typeof data.comments === 'object') {
    const values = data.comments;
    appendMetric(comments, 'Positif', values.positive);
    appendMetric(comments, 'Negatif', values.negative);
    appendMetric(comments, 'Indikasi kebencian', values.hate);
    if (Number.isFinite(values.sampleSize)) appendMetric(comments, 'Komentar ditelaah', values.sampleSize);
    const explanation = document.createElement('p');
    explanation.className = 'report-explanation';
    explanation.textContent = safeText(values.summary);
    comments.append(explanation);
    const confidence = confidenceLabel(values.confidence);
    if (confidence) { const tag = document.createElement('span'); tag.className = 'confidence'; tag.textContent = confidence; comments.append(tag); }
  } else comments.append(unavailable('Data komentar tidak tersedia untuk video ini.'));

  const provocation = document.querySelector('#provocationContent');
  provocation.replaceChildren();
  if (data.provocation && typeof data.provocation === 'object') {
    const level = document.createElement('span');
    const levelValue = ['low', 'medium', 'high'].includes(data.provocation.level) ? data.provocation.level : 'unknown';
    level.className = 'level-tag';
    level.dataset.level = levelValue;
    level.textContent = `Sinyal ${levelLabels[levelValue]}`;
    const explanation = document.createElement('p');
    explanation.className = 'report-explanation';
    explanation.textContent = safeText(data.provocation.explanation);
    provocation.append(level, explanation);
    if (Array.isArray(data.provocation.signals) && data.provocation.signals.length) {
      const list = document.createElement('ul');
      list.className = 'source-list';
      data.provocation.signals.forEach((item) => { if (typeof item === 'string') { const li = document.createElement('li'); li.textContent = item; list.append(li); } });
      provocation.append(list);
    }
    const confidence = confidenceLabel(data.provocation.confidence);
    if (confidence) { const tag = document.createElement('span'); tag.className = 'confidence'; tag.textContent = confidence; provocation.append(tag); }
  } else provocation.append(unavailable('Analisis provokasi tidak tersedia.'));

  const claims = document.querySelector('#claimsContent');
  claims.replaceChildren();
  const claimList = Array.isArray(data.claims) ? data.claims : [];
  if (!claimList.length) claims.append(unavailable('Tidak ada klaim yang berhasil diperiksa.'));
  claimList.forEach((claim) => {
    const item = document.createElement('article');
    item.className = 'claim-item';
    const top = document.createElement('div');
    top.className = 'claim-top';
    const text = document.createElement('h4');
    text.className = 'claim-text';
    text.textContent = safeText(claim.claim, 'Klaim tanpa teks.');
    const verdict = document.createElement('span');
    const verdictKey = Object.hasOwn(verdictLabels, claim.verdict) ? claim.verdict : 'unverified';
    verdict.className = 'verdict';
    verdict.dataset.verdict = verdictKey;
    verdict.textContent = verdictLabels[verdictKey];
    top.append(text, verdict);
    item.append(top);
    if (claim.explanation) { const detail = document.createElement('p'); detail.className = 'claim-detail'; detail.textContent = claim.explanation; item.append(detail); }
    if (Array.isArray(claim.sources) && claim.sources.length) {
      const sources = document.createElement('ul');
      sources.className = 'source-list';
      claim.sources.forEach((source) => {
        try {
          const url = new URL(source.url);
          if (!['http:', 'https:'].includes(url.protocol)) return;
          const li = document.createElement('li');
          const anchor = document.createElement('a');
          anchor.href = url.href;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.textContent = `${safeText(source.publisher, '') ? `${source.publisher}: ` : ''}${safeText(source.title, url.hostname)} ↗`;
          li.append(anchor);
          sources.append(li);
        } catch { /* Skip malformed source URLs. */ }
      });
      if (sources.childElementCount) item.append(sources);
    }
    const confidence = confidenceLabel(claim.confidence);
    if (confidence) { const tag = document.createElement('span'); tag.className = 'confidence'; tag.textContent = confidence; item.append(tag); }
    claims.append(item);
  });

  report.hidden = false;
  state.hidden = true;
  report.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function unavailable(message) {
  const paragraph = document.createElement('p');
  paragraph.className = 'unavailable-copy';
  paragraph.textContent = message;
  return paragraph;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  error.textContent = '';
  const url = input.value.trim();
  if (!parseTikTokUrl(url)) {
    error.textContent = 'Masukkan tautan HTTPS dari tiktok.com, vm.tiktok.com, atau vt.tiktok.com.';
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  input.removeAttribute('aria-invalid');
  report.hidden = true;
  showState('pending', 'Sedang menyiapkan pemeriksaan', 'Kami sedang meminta data video dan komentar, lalu menelaah klaim beserta sumbernya.');
  setLoading(true);
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.status && ['complete', 'partial'].includes(result.status)) {
      renderReport(result, url);
      input.value = url;
      return;
    }
    if (result.code === 'PROVIDER_UNCONFIGURED') {
      showState('notice', 'Analisis nyata belum diaktifkan', result.message || 'Konektor analisis belum dikonfigurasi untuk aplikasi ini. Tautanmu tidak disimpan. Coba lagi setelah layanan tersedia.');
    } else if (result.code === 'PROVIDER_TIMEOUT' || result.code === 'PROVIDER_ERROR') {
      showState('error', 'Pemeriksaan belum selesai', result.message || 'Layanan analisis tidak merespons. Tautan tetap ada; kamu bisa mencoba lagi.', true);
    } else if (response.status === 422) {
      error.textContent = result.message || 'Tautan TikTok tidak valid atau tidak didukung.';
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      state.hidden = true;
    } else {
      showState('error', 'Terjadi kendala saat memeriksa', result.message || 'Tautan tetap ada. Periksa koneksi lalu coba lagi.', true);
    }
  } catch {
    showState('error', 'Tidak dapat terhubung', 'Periksa koneksi internetmu. Tautan tetap ada dan kamu bisa mencoba lagi.', true);
  } finally {
    setLoading(false);
  }
});

document.querySelector('#newAnalysisButton').addEventListener('click', () => {
  report.hidden = true;
  input.value = '';
  input.focus();
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  document.querySelector('#installButton').hidden = false;
});
document.querySelector('#installButton').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  document.querySelector('#installButton').hidden = true;
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

window.addEventListener('offline', () => showState('notice', 'Kamu sedang offline', 'Tampilan aplikasi tetap tersedia. Pemeriksaan tautan baru memerlukan koneksi internet.'));
window.addEventListener('online', () => { if (state.dataset.kind === 'notice' && state.textContent.includes('offline')) state.hidden = true; });
