const form = document.querySelector('#analysisForm');
const input = document.querySelector('#videoUrl');
const button = document.querySelector('#analyzeButton');
const state = document.querySelector('#analysisState');
const error = document.querySelector('#formError');
const report = document.querySelector('#report');
let installPrompt;

const validTikTokHosts = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);
const verdictLabels = { supported: 'Didukung Sumber', false: 'Tidak Akurat / Hoax', misleading: 'Menyesatkan', unverified: 'Belum Terverifikasi', mixed: 'Sebagian Benar' };
const levelLabels = { low: 'Rendah (Netral)', medium: 'Sedang (Menggiring Opini)', high: 'Tinggi (Sensasional / Provokatif)', unknown: 'Belum Diketahui' };

function parseTikTokUrl(value) {
  return extractAndValidateTikTokUrl(value);
}

function extractAndValidateTikTokUrl(value) {
  if (typeof value !== 'string') return null;
  const str = value.trim();
  if (!str) return null;

  // 1. Match full https://...tiktok.com/... URL from any pasted text
  const match = str.match(/https?:\/\/([a-zA-Z0-9-]+\.)*tiktok\.com\/[^\s]+/i);
  let targetUrl = match ? match[0] : null;

  // 2. If no protocol in string, match domain without scheme
  if (!targetUrl) {
    const hostMatch = str.match(/(?:[a-zA-Z0-9-]+\.)*tiktok\.com\/[^\s]+/i);
    if (hostMatch) targetUrl = 'https://' + hostMatch[0];
  }

  if (!targetUrl) return null;

  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    if (validTikTokHosts.has(host) || host.endsWith('.tiktok.com')) {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
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
  button.querySelector('.button-label').textContent = loading ? 'Memeriksa Video…' : 'Periksa Video';
  input.readOnly = loading;
  form.setAttribute('aria-busy', String(loading));
}

function confidenceLabel(value) {
  if (!['low', 'medium', 'high'].includes(value)) return null;
  return `Tingkat Akurasi: ${value === 'low' ? 'rendah' : value === 'medium' ? 'sedang' : 'tinggi'}`;
}

function safeText(value, fallback = 'Tidak tersedia.') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function unavailable(message) {
  const paragraph = document.createElement('p');
  paragraph.className = 'unavailable-copy';
  paragraph.textContent = message;
  return paragraph;
}

function renderReport(data, submittedUrl) {
  const normalizedUrl = parseTikTokUrl(submittedUrl)?.href || submittedUrl;
  const videoLink = document.querySelector('#reportVideoLink');
  videoLink.href = normalizedUrl;
  videoLink.textContent = data.video?.title ? `${data.video.title} · ${normalizedUrl}` : normalizedUrl;
  
  const status = document.querySelector('#reportStatus');
  const isPartial = data.status === 'partial';
  status.textContent = isPartial ? 'Sebagian Diperiksa' : 'Pemeriksaan Selesai';
  status.dataset.status = isPartial ? 'partial' : 'complete';

  const coverage = document.querySelector('#reportCoverage');
  coverage.replaceChildren();
  const limitations = Array.isArray(data.limitations) ? data.limitations.filter((item) => typeof item === 'string' && item.trim()) : [];
  coverage.hidden = limitations.length === 0;
  if (limitations.length) coverage.textContent = `Catatan: ${limitations.join(' ')}`;

  // 0. Render Credibility Score Banner
  const cred = data.credibility || {};
  const scoreNum = document.querySelector('#credibilityScoreNum');
  const ratingText = document.querySelector('#credibilityRating');
  const badgeTag = document.querySelector('#credibilityBadge');
  const expText = document.querySelector('#credibilityExplanation');
  const credBanner = document.querySelector('#credibilityBanner');

  if (cred && cred.score != null) {
    scoreNum.textContent = cred.score;
    ratingText.textContent = cred.rating || 'Skor Kredibilitas Narasi';
    badgeTag.textContent = (cred.badge || 'verified').toUpperCase();
    badgeTag.dataset.badge = cred.badge || 'verified';
    credBanner.dataset.badge = cred.badge || 'verified';
    expText.textContent = cred.explanation || 'Penilaian kredibilitas narasi video.';
    credBanner.hidden = false;
  } else {
    credBanner.hidden = true;
  }

  // 1. Render SINGLE Video Cover & Player Card (Zero overload-protect triggered error)
  const mediaContent = document.querySelector('#mediaContent');
  mediaContent.replaceChildren();

  const thumbnailUrl = data.video?.thumbnailUrl;
  const authorName = safeText(data.video?.authorName, 'Kreator TikTok');
  const authorUsername = safeText(data.video?.authorUsername, '');

  const wrapper = document.createElement('div');
  wrapper.className = 'video-preview-wrapper';

  const coverCard = document.createElement('a');
  coverCard.className = 'video-cover-card';
  coverCard.href = normalizedUrl;
  coverCard.target = '_blank';
  coverCard.rel = 'noopener noreferrer';
  coverCard.title = 'Tonton video di TikTok';

  if (thumbnailUrl) {
    const coverImg = document.createElement('img');
    coverImg.src = thumbnailUrl;
    coverImg.alt = `Sampul Video TikTok oleh ${authorName}`;
    coverImg.className = 'video-cover-img';
    coverImg.loading = 'lazy';
    coverCard.append(coverImg);
  }

  const overlay = document.createElement('div');
  overlay.className = 'video-cover-overlay';

  const playBadge = document.createElement('div');
  playBadge.className = 'play-action-badge';
  playBadge.innerHTML = '<span class="play-icon">▶</span> <span class="play-text">Tonton Video di TikTok</span>';

  const authorTag = document.createElement('span');
  authorTag.className = 'cover-author-tag';
  authorTag.textContent = authorUsername ? `@${authorUsername}` : authorName;

  overlay.append(playBadge, authorTag);
  coverCard.append(overlay);
  wrapper.append(coverCard);

  mediaContent.append(wrapper);

  // 2. Render Full Caption & Author Info
  const captionContent = document.querySelector('#captionContent');
  captionContent.replaceChildren();

  const authorHeader = document.createElement('div');
  authorHeader.className = 'author-header';
  const authorAvatar = document.createElement('span');
  authorAvatar.className = 'author-avatar-badge';
  authorAvatar.textContent = (authorName[0] || 'T').toUpperCase();
  
  const authorDetails = document.createElement('div');
  authorDetails.className = 'author-details';
  const authorTitle = document.createElement('strong');
  authorTitle.textContent = authorName;
  const authorHandle = document.createElement('span');
  authorHandle.textContent = authorUsername ? `@${authorUsername}` : '';
  authorDetails.append(authorTitle, authorHandle);
  authorHeader.append(authorAvatar, authorDetails);

  const captionText = document.createElement('div');
  captionText.className = 'full-caption-text';
  const rawCaption = safeText(data.video?.fullCaption || data.video?.title);
  
  // Format caption text paragraphs & hashtags
  const paragraphs = rawCaption.split('\n').filter(p => p.trim());
  paragraphs.forEach((pText) => {
    const p = document.createElement('p');
    // Highlight hashtags & mentions
    p.innerHTML = pText.replace(/(#[\w\u0600-\u06FF\u4e00-\u9fa5]+|@[\w\.]+)/g, '<span class="caption-tag">$1</span>');
    captionText.append(p);
  });

  captionContent.append(authorHeader, captionText);

  // 3. Render Filtered Contextual Comments Analysis
  const comments = document.querySelector('#commentsContent');
  comments.replaceChildren();
  if (data.comments && typeof data.comments === 'object') {
    const values = data.comments;

    // Visual Sentiment Bar
    const posVal = parseFloat(values.positive) || 0;
    const negVal = parseFloat(values.negative) || 0;
    const hateVal = parseFloat(values.hate) || 0;

    const sentimentBarWrapper = document.createElement('div');
    sentimentBarWrapper.className = 'sentiment-bar-wrapper';
    
    const sentimentBar = document.createElement('div');
    sentimentBar.className = 'sentiment-bar';
    
    const posSeg = document.createElement('div');
    posSeg.className = 'sentiment-seg seg-positive';
    posSeg.style.width = `${posVal}%`;
    posSeg.title = `Positif: ${values.positive}`;
    
    const negSeg = document.createElement('div');
    negSeg.className = 'sentiment-seg seg-negative';
    negSeg.style.width = `${negVal}%`;
    negSeg.title = `Negatif: ${values.negative}`;

    const hateSeg = document.createElement('div');
    hateSeg.className = 'sentiment-seg seg-hate';
    hateSeg.style.width = `${hateVal}%`;
    hateSeg.title = `Indikasi Kebencian: ${values.hate}`;

    sentimentBar.append(posSeg, negSeg, hateSeg);
    
    const legend = document.createElement('div');
    legend.className = 'sentiment-legend';
    legend.innerHTML = `
      <span><i class="dot dot-pos"></i> Positif ${safeText(values.positive, '0%')}</span>
      <span><i class="dot dot-neg"></i> Negatif ${safeText(values.negative, '0%')}</span>
      <span><i class="dot dot-hate"></i> Kebencian ${safeText(values.hate, '0%')}</span>
    `;

    sentimentBarWrapper.append(sentimentBar, legend);
    comments.append(sentimentBarWrapper);

    // Filter badge note (Without emoji)
    const filterBadge = document.createElement('div');
    filterBadge.className = 'filter-notice-badge';
    filterBadge.innerHTML = `<span><strong>Hanya Komentar Kontekstual:</strong> Komentar spam/promosi/out-of-topic tidak dimasukkan.</span>`;
    comments.append(filterBadge);

    const statsGrid = document.createElement('div');
    statsGrid.className = 'comment-stats-grid';
    if (Number.isFinite(values.sampleSize)) {
      const box1 = document.createElement('div');
      box1.className = 'stat-box';
      box1.innerHTML = `<span>DITELAAH (RELEVAN)</span><strong>${values.sampleSize}</strong>`;
      statsGrid.append(box1);
    }
    if (Number.isFinite(values.filteredOutCount)) {
      const box2 = document.createElement('div');
      box2.className = 'stat-box stat-filtered';
      box2.innerHTML = `<span>DISARING (OUT OF CONTEXT)</span><strong>${values.filteredOutCount}</strong>`;
      statsGrid.append(box2);
    }
    if (statsGrid.childElementCount) comments.append(statsGrid);

    const explanation = document.createElement('p');
    explanation.className = 'report-explanation';
    explanation.textContent = safeText(values.summary);
    comments.append(explanation);

    // Render Sample Comments Quotes (Highlighting High Positive & High Provocative)
    if (Array.isArray(values.sampleComments) && values.sampleComments.length) {
      const sampleSectionTitle = document.createElement('h4');
      sampleSectionTitle.className = 'sub-panel-title';
      sampleSectionTitle.textContent = 'Sampel Komentar Menonjol (Positif & Provokatif):';
      comments.append(sampleSectionTitle);

      const sampleGrid = document.createElement('div');
      sampleGrid.className = 'sample-comments-grid';
      
      values.sampleComments.forEach((cItem) => {
        if (!cItem || typeof cItem !== 'object') return;
        const card = document.createElement('div');
        card.className = 'sample-comment-card';
        const topRow = document.createElement('div');
        topRow.className = 'sample-card-top';

        const badge = document.createElement('span');
        badge.className = 'sample-badge';
        badge.dataset.type = cItem.type || 'positive';
        badge.textContent = safeText(cItem.label, 'Komentar');

        const metaRight = document.createElement('div');
        metaRight.className = 'sample-meta-right';

        if (cItem.userUniqueId) {
          const userHandle = document.createElement('span');
          userHandle.className = 'sample-user-handle';
          userHandle.textContent = `@${cItem.userUniqueId}`;
          metaRight.append(userHandle);
        }

        if (cItem.likes != null && cItem.likes > 0) {
          const likesCount = document.createElement('span');
          likesCount.className = 'sample-likes-count';
          likesCount.textContent = `❤️ ${cItem.likes.toLocaleString('id-ID')}`;
          metaRight.append(likesCount);
        }

        topRow.append(badge, metaRight);

        const quoteText = document.createElement('blockquote');
        quoteText.className = 'sample-quote-text';
        quoteText.textContent = safeText(cItem.text);

        card.append(topRow, quoteText);

        if (cItem.reason) {
          const reasonPara = document.createElement('p');
          reasonPara.className = 'sample-reason-note';
          reasonPara.textContent = cItem.reason;
          card.append(reasonPara);
        }

        sampleGrid.append(card);
      });

      comments.append(sampleGrid);
    }

    const confidence = confidenceLabel(values.confidence);
    if (confidence) { const tag = document.createElement('span'); tag.className = 'confidence'; tag.textContent = confidence; comments.append(tag); }
  } else comments.append(unavailable('Data komentar tidak tersedia untuk video ini.'));

  // 4. Render Provocation Analysis
  const provocation = document.querySelector('#provocationContent');
  provocation.replaceChildren();
  if (data.provocation && typeof data.provocation === 'object') {
    const level = document.createElement('div');
    const levelValue = ['low', 'medium', 'high'].includes(data.provocation.level) ? data.provocation.level : 'unknown';
    level.className = 'level-tag-badge';
    level.dataset.level = levelValue;
    level.textContent = `Tingkat Provokasi: ${levelLabels[levelValue]}`;

    const explanation = document.createElement('p');
    explanation.className = 'report-explanation';
    explanation.textContent = safeText(data.provocation.explanation);
    provocation.append(level, explanation);

    if (Array.isArray(data.provocation.signals) && data.provocation.signals.length) {
      const signalHeading = document.createElement('h4');
      signalHeading.className = 'sub-panel-title';
      signalHeading.textContent = 'Sinyal Pembingkaian Bahasa:';
      provocation.append(signalHeading);

      const list = document.createElement('ul');
      list.className = 'signals-bullet-list';
      data.provocation.signals.forEach((item) => {
        if (typeof item === 'string') {
          const li = document.createElement('li');
          li.textContent = item;
          list.append(li);
        }
      });
      provocation.append(list);
    }
    const confidence = confidenceLabel(data.provocation.confidence);
    if (confidence) { const tag = document.createElement('span'); tag.className = 'confidence'; tag.textContent = confidence; provocation.append(tag); }
  } else provocation.append(unavailable('Analisis provokasi tidak tersedia.'));

  // 5. Render AI Detection Panel
  const aiContent = document.querySelector('#aiContent');
  aiContent.replaceChildren();
  const ai = data.aiDetection || null;
  if (ai && typeof ai === 'object') {
    const statusRow = document.createElement('div');
    statusRow.className = 'ai-status-row';

    const statusBadge = document.createElement('span');
    statusBadge.className = 'ai-status-badge';
    statusBadge.dataset.type = ai.badgeType || 'verified';
    statusBadge.textContent = safeText(ai.statusLabel, 'Status Deteksi AI');
    statusRow.append(statusBadge);

    const audioTag = document.createElement('span');
    audioTag.className = 'ai-audio-tag';
    audioTag.textContent = safeText(ai.audioType, 'Audio Tidak Diketahui');
    statusRow.append(audioTag);

    aiContent.append(statusRow);

    const explanation = document.createElement('p');
    explanation.className = 'report-explanation';
    explanation.textContent = safeText(ai.explanation);
    aiContent.append(explanation);

    if (Array.isArray(ai.signals) && ai.signals.length) {
      const signalHeading = document.createElement('h4');
      signalHeading.className = 'sub-panel-title';
      signalHeading.textContent = 'Sinyal Deteksi:';
      aiContent.append(signalHeading);

      const list = document.createElement('ul');
      list.className = 'signals-bullet-list';
      ai.signals.forEach((s) => {
        if (typeof s === 'string') {
          const li = document.createElement('li');
          li.textContent = s;
          list.append(li);
        }
      });
      aiContent.append(list);
    }

    const confLabel = confidenceLabel(ai.confidence);
    if (confLabel) {
      const tag = document.createElement('span');
      tag.className = 'confidence';
      tag.textContent = confLabel;
      aiContent.append(tag);
    }
  } else {
    aiContent.append(unavailable('Deteksi AI tidak tersedia untuk video ini.'));
  }

  // 6. Render Claim Verification & Sources
  const claims = document.querySelector('#claimsContent');
  claims.replaceChildren();
  const claimList = Array.isArray(data.claims) ? data.claims : [];
  if (!claimList.length) claims.append(unavailable('Tidak ada klaim yang berhasil diperiksa.'));
  
  claimList.forEach((claim) => {
    const item = document.createElement('article');
    item.className = 'claim-card-item';
    const top = document.createElement('div');
    top.className = 'claim-top';
    const text = document.createElement('h4');
    text.className = 'claim-text';
    text.textContent = safeText(claim.claim, 'Klaim tanpa teks.');
    
    const verdict = document.createElement('span');
    const verdictKey = Object.hasOwn(verdictLabels, claim.verdict) ? claim.verdict : 'unverified';
    verdict.className = 'verdict-badge';
    verdict.dataset.verdict = verdictKey;
    verdict.textContent = verdictLabels[verdictKey];
    
    top.append(text, verdict);
    item.append(top);
    
    if (claim.explanation) {
      const detail = document.createElement('p');
      detail.className = 'claim-detail';
      detail.textContent = claim.explanation;
      item.append(detail);
    }

    if (Array.isArray(claim.sources) && claim.sources.length) {
      const sourcesHeading = document.createElement('span');
      sourcesHeading.className = 'sources-label';
      sourcesHeading.textContent = 'Rujukan Periksa Fakta:';
      item.append(sourcesHeading);

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
        } catch { /* skip malformed URLs */ }
      });
      if (sources.childElementCount) item.append(sources);
    }
    const confidence = confidenceLabel(claim.confidence);
    if (confidence) { const tag = document.createElement('span'); tag.className = 'confidence'; tag.textContent = confidence; item.append(tag); }
    claims.append(item);
  });

  // 7. Render News Verification Sources (Cek Fakta Links)
  const newsPanel = document.querySelector('#newsSourcesContent');
  newsPanel.replaceChildren();
  const newsSources = Array.isArray(data.newsVerificationSources) ? data.newsVerificationSources : [];
  if (newsSources.length) {
    const introText = document.createElement('p');
    introText.className = 'report-explanation';
    introText.textContent = 'Cari berita resmi yang sesuai dengan topik video ini untuk memverifikasi kebenaran narasi. Klik salah satu sumber di bawah:';
    newsPanel.append(introText);

    const grid = document.createElement('div');
    grid.className = 'news-sources-grid';
    newsSources.forEach((src) => {
      try {
        const url = new URL(src.url);
        if (!['http:', 'https:'].includes(url.protocol)) return;
        const card = document.createElement('a');
        card.className = 'news-source-card';
        card.href = url.href;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';

        const publisher = document.createElement('span');
        publisher.className = 'news-source-publisher';
        publisher.textContent = safeText(src.publisher, url.hostname);

        const title = document.createElement('span');
        title.className = 'news-source-title';
        title.textContent = safeText(src.title, 'Cari berita terkait');

        const arrow = document.createElement('span');
        arrow.className = 'news-source-arrow';
        arrow.textContent = '↗';

        card.append(publisher, title, arrow);
        grid.append(card);
      } catch { /* skip */ }
    });
    newsPanel.append(grid);
  } else {
    newsPanel.append(unavailable('Sumber berita verifikasi tidak tersedia.'));
  }

  // 8. Analysis timestamp
  const timestampEl = document.querySelector('#reportTimestamp');
  if (timestampEl) {
    const ts = data.analyzedAt ? new Date(data.analyzedAt) : new Date();
    timestampEl.textContent = `Dianalisis: ${ts.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} pukul ${ts.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
    timestampEl.hidden = false;
  }

  // Wire Copy Report & Share WA buttons
  const copyBtn = document.querySelector('#copyReportButton');
  const shareWaBtn = document.querySelector('#shareWaButton');

  copyBtn.onclick = async () => {
    const vidTitle = safeText(data.video?.fullCaption || data.video?.title, 'Video TikTok');
    const credText = data.credibility ? `Skor Kredibilitas: ${data.credibility.score}/100 (${data.credibility.rating})` : '';
    const provText = data.provocation ? `Tingkat Provokasi: ${levelLabels[data.provocation.level] || 'Belum diketahui'}` : '';
    const claimSummary = claimList.map(c => `- ${c.claim}: ${verdictLabels[c.verdict] || c.verdict}`).join('\n');
    const aiText = ai ? `Deteksi AI: ${ai.statusLabel}` : '';

    const summary = [
      `VERIFTOK - Ringkasan Analisis`,
      `Video: ${normalizedUrl}`,
      `Judul: ${vidTitle.slice(0, 120)}`,
      credText,
      provText,
      aiText,
      claimSummary ? `Klaim:\n${claimSummary}` : '',
      `\nAnalisis otomatis oleh VerifTok. Selalu periksa sumber resmi.`
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(summary);
      copyBtn.textContent = 'Tersalin!';
      setTimeout(() => { copyBtn.textContent = 'Salin Ringkasan'; }, 2500);
    } catch {
      copyBtn.textContent = 'Gagal menyalin';
      setTimeout(() => { copyBtn.textContent = 'Salin Ringkasan'; }, 2500);
    }
  };

  shareWaBtn.onclick = () => {
    const vidTitle = safeText(data.video?.fullCaption || data.video?.title, 'Video TikTok');
    const credScore = data.credibility?.score ?? '?';
    const credRating = data.credibility?.rating ?? '';
    const waText = [
      `*VERIFTOK - Cek Fakta Video TikTok*`,
      `Video: ${normalizedUrl}`,
      `Skor Kredibilitas: ${credScore}/100 (${credRating})`,
      `Judul: ${vidTitle.slice(0, 100)}`,
      `\nAnalisis otomatis oleh VerifTok.`
    ].join('\n');
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`, '_blank');
  };

  report.hidden = false;
  state.hidden = true;
  report.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

async function doAnalysis() {
  error.hidden = true;
  error.textContent = '';
  
  const rawInput = input.value;
  const validUrl = extractAndValidateTikTokUrl(rawInput);
  
  if (!validUrl) {
    error.textContent = 'Masukkan tautan HTTPS dari tiktok.com, vm.tiktok.com, atau vt.tiktok.com.';
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return false;
  }

  // Update input box with cleaned URL so user sees valid link
  input.value = validUrl;
  input.removeAttribute('aria-invalid');
  report.hidden = true;
  
  showState('pending', 'Sedang Menganalisis Video TikTok', 'Memuat pemutar video, mengambil seluruh caption, menapis komentar relevan, serta menelaah klaim faktual.');

  const progressSteps = [
    { delay: 1500, text: 'Mengambil metadata dan thumbnail video dari TikTok...' },
    { delay: 3500, text: 'Mengumpulkan komentar publik dan menyaring spam...' },
    { delay: 6000, text: 'Menganalisis narasi, provokasi, dan klaim faktual...' },
    { delay: 9000, text: 'Memeriksa indikator AI/deepfake dan mencari sumber berita...' },
    { delay: 13000, text: 'Menyusun laporan lengkap, hampir selesai...' },
  ];
  const progressTimers = progressSteps.map(step =>
    setTimeout(() => {
      const detail = state.querySelector('.state-copy p');
      if (detail && state.dataset.kind === 'pending') detail.textContent = step.text;
    }, step.delay)
  );
  setLoading(true);

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url: validUrl }),
    });
    const result = await response.json().catch(() => ({}));
    
    if (response.ok && result.status && ['complete', 'partial'].includes(result.status)) {
      renderReport(result, validUrl);
      input.value = validUrl;
      return false;
    }

    if (result.code === 'PROVIDER_UNCONFIGURED') {
      showState('notice', 'Analisis Nyata Belum Dikonfigurasi', result.message || 'Konektor analisis belum dikonfigurasi.');
    } else if (result.code === 'PROVIDER_TIMEOUT' || result.code === 'PROVIDER_ERROR') {
      showState('error', 'Pemeriksaan Belum Selesai', result.message || 'Layanan analisis tidak merespons. Coba lagi sebentar.', true);
    } else if (response.status === 422) {
      error.textContent = result.message || 'Tautan TikTok tidak valid atau tidak didukung.';
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      state.hidden = true;
    } else {
      showState('error', 'Terjadi Kendala', result.message || 'Periksa koneksi lalu coba lagi.', true);
    }
  } catch (err) {
    console.error('Submit error:', err);
    showState('error', 'Tidak Dapat Terhubung', 'Periksa koneksi internetmu lalu coba lagi.', true);
  } finally {
    progressTimers.forEach(clearTimeout);
    setLoading(false);
  }
  return false;
}

// Event Listeners (Direct Button Click + Enter Key + Form Submit)
button.addEventListener('click', (e) => {
  if (e) e.preventDefault();
  doAnalysis();
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    doAnalysis();
  }
});

form.addEventListener('submit', (e) => {
  if (e) e.preventDefault();
  doAnalysis();
  return false;
});

// Auto-clean address bar if URL parameter was inserted by previous GET submission & auto-run
(function handleQueryUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryUrl = params.get('url');
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (queryUrl) {
      input.value = queryUrl;
      setTimeout(() => doAnalysis(), 100);
    }
  } catch {
    // Ignore query parsing errors
  }
})();

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

window.addEventListener('offline', () => showState('notice', 'Kamu sedang offline', 'Aplikasi dalam mode offline. Pemeriksaan tautan memerlukan koneksi internet.'));
window.addEventListener('online', () => { if (state.dataset.kind === 'notice' && state.textContent.includes('offline')) state.hidden = true; });
