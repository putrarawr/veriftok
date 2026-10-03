// VerifTok Client-Side Application

const form = document.querySelector('#analysisForm');
const input = document.querySelector('#videoUrl');
const button = document.querySelector('#analyzeButton');
const state = document.querySelector('#analysisState');
const error = document.querySelector('#formError');
const report = document.querySelector('#report');
let installPrompt;

// Input mode tabs
const tabModeUrl = document.querySelector('#tabModeUrl');
const tabModeFile = document.querySelector('#tabModeFile');
const urlContainer = document.querySelector('#urlInputContainer');
const fileContainer = document.querySelector('#fileInputContainer');

// File upload elements
const dropzone = document.querySelector('#fileDropzone');
const fileInput = document.querySelector('#mediaFileInput');
const browseFileBtn = document.querySelector('#browseFileBtn');
const dropzonePrompt = document.querySelector('#dropzonePrompt');
const dropzoneSelected = document.querySelector('#dropzoneSelected');
const fileSelectedName = document.querySelector('#fileSelectedName');
const fileSelectedSize = document.querySelector('#fileSelectedSize');
const changeFileBtn = document.querySelector('#changeFileBtn');
const analyzeFileButton = document.querySelector('#analyzeFileButton');
const fileError = document.querySelector('#fileError');

let selectedUploadFile = null;

// Report view tabs
const btnTabQuick = document.querySelector('#btnTabQuick');
const btnTabDeep = document.querySelector('#btnTabDeep');
const quickView = document.querySelector('#quickVerdictView');
const deepView = document.querySelector('#deepForensicView');

const validTikTokHosts = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);
const verdictLabels = { supported: 'Didukung Sumber', false: 'Tidak Akurat / Hoax', misleading: 'Menyesatkan', unverified: 'Belum Terverifikasi', mixed: 'Sebagian Benar' };
const levelLabels = { low: 'Rendah (Netral)', medium: 'Sedang (Menggiring Opini)', high: 'Tinggi (Sensasional / Provokatif)', unknown: 'Belum Diketahui' };

// ==========================================
// INPUT MODE TOGGLE (URL vs DIRECT FILE)
// ==========================================
tabModeUrl.addEventListener('click', () => {
  tabModeUrl.classList.add('active');
  tabModeUrl.setAttribute('aria-selected', 'true');
  tabModeFile.classList.remove('active');
  tabModeFile.setAttribute('aria-selected', 'false');
  urlContainer.hidden = false;
  fileContainer.hidden = true;
  if (state.dataset.kind !== 'pending') {
    state.hidden = true;
  }
  // Keep report visible if analysis already finished
  if (window.currentReportResult) {
    report.hidden = false;
  }
});

tabModeFile.addEventListener('click', () => {
  tabModeFile.classList.add('active');
  tabModeFile.setAttribute('aria-selected', 'true');
  tabModeUrl.classList.remove('active');
  tabModeUrl.setAttribute('aria-selected', 'false');
  fileContainer.hidden = false;
  urlContainer.hidden = true;
  if (state.dataset.kind !== 'pending') {
    state.hidden = true;
  }
  // Keep report visible if analysis already finished
  if (window.currentReportResult) {
    report.hidden = false;
  }
});

// File upload handling
browseFileBtn.addEventListener('click', () => fileInput.click());
changeFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.value = '';
  selectedUploadFile = null;
  dropzoneSelected.hidden = true;
  dropzonePrompt.hidden = false;
  analyzeFileButton.disabled = true;
  fileError.hidden = true;
});

dropzone.addEventListener('click', (e) => {
  if (e.target === changeFileBtn) return;
  fileInput.click();
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleFileSelected(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleFileSelected(e.target.files[0]);
  }
});

function handleFileSelected(file) {
  fileError.hidden = true;
  fileError.textContent = '';

  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
  if (!validTypes.includes(file.type)) {
    fileError.textContent = 'Format berkas tidak didukung. Harap pilih gambar (PNG/JPG) atau video (MP4/WebM).';
    fileError.hidden = false;
    return;
  }

  const maxBytes = 45 * 1024 * 1024; // 45MB max
  if (file.size > maxBytes) {
    fileError.textContent = 'Ukuran berkas melebihi batas 45MB. Pilih cuplikan video atau tangkapan layar yang lebih kecil.';
    fileError.hidden = false;
    return;
  }

  selectedUploadFile = file;
  fileSelectedName.textContent = file.name;
  fileSelectedSize.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB (${file.type.startsWith('image/') ? 'Gambar' : 'Video'})`;
  
  dropzonePrompt.hidden = true;
  dropzoneSelected.hidden = false;
  analyzeFileButton.disabled = false;
}

// ==========================================
// REPORT VIEW SWITCHER (RINGKASAN CEPAT vs ANALISIS MENDALAM)
// ==========================================
function switchReportTab(tab) {
  if (tab === 'quick') {
    btnTabQuick.classList.add('active');
    btnTabQuick.setAttribute('aria-selected', 'true');
    btnTabDeep.classList.remove('active');
    btnTabDeep.setAttribute('aria-selected', 'false');
    quickView.hidden = false;
    deepView.hidden = true;
  } else {
    btnTabDeep.classList.add('active');
    btnTabDeep.setAttribute('aria-selected', 'true');
    btnTabQuick.classList.remove('active');
    btnTabQuick.setAttribute('aria-selected', 'false');
    deepView.hidden = false;
    quickView.hidden = true;
  }
}

btnTabQuick.addEventListener('click', () => switchReportTab('quick'));
btnTabDeep.addEventListener('click', () => switchReportTab('deep'));

const quickGoToDeepBtn = document.querySelector('#quickGoToDeepBtn');
if (quickGoToDeepBtn) {
  quickGoToDeepBtn.addEventListener('click', () => {
    switchReportTab('deep');
    deepView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// URL Parsing
function parseTikTokUrl(value) {
  return extractAndValidateTikTokUrl(value);
}

function extractAndValidateTikTokUrl(value) {
  if (typeof value !== 'string') return null;
  const str = value.trim();
  if (!str) return null;

  const match = str.match(/https?:\/\/([a-zA-Z0-9-]+\.)*tiktok\.com\/[^\s]+/i);
  let targetUrl = match ? match[0] : null;

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
    retry.addEventListener('click', () => {
      if (tabModeFile.classList.contains('active')) {
        doFileAnalysis();
      } else {
        form.requestSubmit();
      }
    });
    copy.append(retry);
  }
  state.append(symbol, copy);
  state.hidden = false;
}

function setLoading(loading, isFile = false) {
  if (isFile) {
    analyzeFileButton.disabled = loading;
    analyzeFileButton.querySelector('.button-label').textContent = loading ? 'Memeriksa Berkas…' : 'Periksa Berkas';
  } else {
    button.disabled = loading;
    button.querySelector('.button-label').textContent = loading ? 'Memeriksa Video…' : 'Periksa Video';
    input.readOnly = loading;
  }
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

// ==========================================
// RENDER TAB 1: RINGKASAN CEPAT (MODE SIMPEL)
// ==========================================
function renderQuickVerdict(data, normalizedUrl) {
  const qv = data.quickVerdict || {};
  const badgeTag = document.querySelector('#quickVerdictBadge');
  const scoreNum = document.querySelector('#quickScoreNum');
  const ratingLabel = document.querySelector('#quickRatingLabel');
  const summaryVerdict = document.querySelector('#quickSummaryVerdict');
  const themeTag = document.querySelector('#quickThemeTag');
  const themeDesc = document.querySelector('#quickThemeExplanation');
  const keyFinding = document.querySelector('#quickKeyFinding');
  const newsList = document.querySelector('#quickNewsList');

  // Status Badge & Verdict
  const badgeType = qv.badgeType || 'warning';
  badgeTag.dataset.badge = badgeType;
  badgeTag.textContent = qv.badgeLabel || 'PERLU KROSCEK';
  const quickHeroCard = document.querySelector('#quickHeroCard');
  if (quickHeroCard) quickHeroCard.dataset.badge = badgeType;

  // Animate score counter
  const targetScore = qv.score != null ? qv.score : (data.credibility?.score || 50);
  scoreNum.textContent = '0';
  let cur = 0;
  const step = Math.max(1, Math.round(targetScore / 25));
  const t = setInterval(() => {
    cur += step;
    if (cur >= targetScore) {
      cur = targetScore;
      clearInterval(t);
    }
    scoreNum.textContent = cur;
  }, 25);

  ratingLabel.textContent = data.credibility?.rating || 'Kredibilitas Narasi';
  summaryVerdict.textContent = qv.summaryVerdict || 'Informasi dalam video ini perlu dikonfirmasi ke sumber resmi.';

  // Substantive Theme
  const theme = data.substantiveTheme || qv.substantiveTheme || 'Isu Terkait';
  themeTag.textContent = theme.toUpperCase();
  themeDesc.textContent = qv.themeExplanation || `Video berfokus pada isu '${theme}'.`;

  // Key Finding
  keyFinding.textContent = qv.keyFinding || (data.claims?.[0]?.explanation) || 'Narasi video memerlukan verifikasi silang terhadap berita resmi.';
  keyFinding.dataset.badge = badgeType;

  // Live News Articles based on Substantive Theme
  newsList.replaceChildren();
  const newsItems = (Array.isArray(qv.relatedNews) && qv.relatedNews.length > 0)
    ? qv.relatedNews
    : (Array.isArray(data.liveNews) ? data.liveNews : []);

  if (newsItems.length > 0) {
    newsItems.forEach(item => {
      const card = document.createElement('a');
      card.className = 'quick-news-item';
      card.href = item.link;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';

      const meta = document.createElement('div');
      meta.className = 'quick-news-meta';

      const src = document.createElement('span');
      src.className = 'quick-news-source';
      src.textContent = item.source || 'Media Berita';

      const dt = document.createElement('span');
      dt.className = 'quick-news-date';
      dt.textContent = item.pubDate || '';

      meta.append(src, dt);

      const title = document.createElement('h4');
      title.className = 'quick-news-title';
      title.textContent = item.title;

      card.append(meta, title);
      newsList.append(card);
    });
  } else {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'unavailable-copy';
    emptyMsg.textContent = 'Berita resmi terkait tema ini sedang dalam pemutakhiran. Gunakan tautan riset cek fakta di tab Analisis Mendalam.';
    newsList.append(emptyMsg);
  }

  // Wire Quick Action Buttons
  const quickCopyBtn = document.querySelector('#quickCopyBtn');
  const quickShareWaBtn = document.querySelector('#quickShareWaBtn');
  const quickDownloadFactCardBtn = document.querySelector('#quickDownloadFactCardBtn');

  quickCopyBtn.onclick = async () => {
    const summary = [
      `VERIFTOK - Ringkasan Cepat`,
      `Status: [ ${qv.badgeLabel || 'PERIKSA'} ] (Skor: ${targetScore}/100)`,
      `Tema Sebenarnya: ${theme}`,
      `Kesimpulan: ${qv.summaryVerdict || ''}`,
      `Fakta Lapangan: ${qv.keyFinding || ''}`,
      `Tautan: ${normalizedUrl}`,
      `\nDianalisis oleh VerifTok. Selalu periksa sumber resmi.`
    ].join('\n');

    try {
      await navigator.clipboard.writeText(summary);
      quickCopyBtn.textContent = 'Tersalin!';
      setTimeout(() => { quickCopyBtn.textContent = 'Salin Ringkasan'; }, 2500);
    } catch {
      quickCopyBtn.textContent = 'Gagal menyalin';
      setTimeout(() => { quickCopyBtn.textContent = 'Salin Ringkasan'; }, 2500);
    }
  };

  quickShareWaBtn.onclick = () => {
    const waText = [
      `*VERIFTOK - Hasil Cek Fakta Video TikTok*`,
      `Status: *[ ${qv.badgeLabel || 'HASIL CEK'} ]* (Skor: ${targetScore}/100)`,
      `Tema Sebenarnya: *${theme}*`,
      `\n*Kesimpulan:*`,
      `${qv.summaryVerdict || ''}`,
      `\n*Fakta Lapangan:*`,
      `${qv.keyFinding || ''}`,
      `\nVideo: ${normalizedUrl}`,
      `\n_Periksa fakta secara jernih bersama VerifTok._`
    ].join('\n');
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`, '_blank');
  };

  quickDownloadFactCardBtn.onclick = () => {
    generateFactCardImage(data, normalizedUrl);
  };
}

// ==========================================
// RENDER TAB 2: ANALISIS MENDALAM (FORENSIK A–H)
// ==========================================

// Section A: Media Player / Interactive Photo Carousel
function renderMediaPanel(data, normalizedUrl) {
  const mediaContent = document.querySelector('#mediaContent');
  const mediaTitle = document.querySelector('#mediaPanelTitle');
  mediaContent.replaceChildren();

  // If TikTok Photo Mode (Carousel Slide)
  if (data.isPhotoMode && Array.isArray(data.photoSlides) && data.photoSlides.length > 0) {
    mediaTitle.textContent = 'Galeri Foto Geser TikTok (Carousel)';

    const wrapper = document.createElement('div');
    wrapper.className = 'photo-carousel-wrapper';

    let currentSlide = 0;
    const slides = data.photoSlides;

    const mainSlide = document.createElement('div');
    mainSlide.className = 'photo-slide-main';

    const slideImg = document.createElement('img');
    slideImg.className = 'photo-slide-img';
    slideImg.src = slides[0];
    slideImg.alt = `Slide foto TikTok 1 dari ${slides.length}`;

    const counter = document.createElement('span');
    counter.className = 'carousel-counter-badge';
    counter.textContent = `Slide 1 / ${slides.length}`;

    mainSlide.append(slideImg, counter);

    // Prev & Next Buttons
    if (slides.length > 1) {
      const prevBtn = document.createElement('button');
      prevBtn.className = 'carousel-nav-btn carousel-prev-btn';
      prevBtn.innerHTML = '‹';
      prevBtn.title = 'Slide sebelumnya';

      const nextBtn = document.createElement('button');
      nextBtn.className = 'carousel-nav-btn carousel-next-btn';
      nextBtn.innerHTML = '›';
      nextBtn.title = 'Slide berikutnya';

      function updateSlide(idx) {
        currentSlide = (idx + slides.length) % slides.length;
        slideImg.src = slides[currentSlide];
        slideImg.alt = `Slide foto TikTok ${currentSlide + 1} dari ${slides.length}`;
        counter.textContent = `Slide ${currentSlide + 1} / ${slides.length}`;
        
        const allThumbs = wrapper.querySelectorAll('.carousel-thumb-btn');
        allThumbs.forEach((th, i) => {
          th.classList.toggle('active', i === currentSlide);
        });
      }

      prevBtn.onclick = (e) => { e.preventDefault(); updateSlide(currentSlide - 1); };
      nextBtn.onclick = (e) => { e.preventDefault(); updateSlide(currentSlide + 1); };

      mainSlide.append(prevBtn, nextBtn);
    }

    wrapper.append(mainSlide);

    // Thumbnails strip
    if (slides.length > 1) {
      const thumbsStrip = document.createElement('div');
      thumbsStrip.className = 'carousel-thumbs-strip';
      slides.forEach((url, idx) => {
        const thumbBtn = document.createElement('button');
        thumbBtn.className = `carousel-thumb-btn ${idx === 0 ? 'active' : ''}`;
        thumbBtn.type = 'button';
        const thumbImg = document.createElement('img');
        thumbImg.src = url;
        thumbImg.alt = `Thumbnail slide ${idx + 1}`;
        thumbBtn.append(thumbImg);
        thumbBtn.onclick = () => {
          currentSlide = idx;
          slideImg.src = slides[currentSlide];
          counter.textContent = `Slide ${currentSlide + 1} / ${slides.length}`;
          thumbsStrip.querySelectorAll('.carousel-thumb-btn').forEach((tb, i) => tb.classList.toggle('active', i === idx));
        };
        thumbsStrip.append(thumbBtn);
      });
      wrapper.append(thumbsStrip);
    }

    mediaContent.append(wrapper);
    return;
  }

  // Standard Video Cover Card
  mediaTitle.textContent = 'Pemutar Video TikTok';
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
}

// Section B: Caption & Author Header
function renderCaptionPanel(data) {
  const captionContent = document.querySelector('#captionContent');
  captionContent.replaceChildren();

  const authorName = safeText(data.video?.authorName, 'Kreator TikTok');
  const authorUsername = safeText(data.video?.authorUsername, '');

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
  
  const paragraphs = rawCaption.split('\n').filter(p => p.trim());
  paragraphs.forEach((pText) => {
    const p = document.createElement('p');
    p.innerHTML = pText.replace(/(#[\w\u0600-\u06FF\u4e00-\u9fa5]+|@[\w\.]+)/g, '<span class="caption-tag">$1</span>');
    captionText.append(p);
  });

  captionContent.append(authorHeader, captionText);
}

// Section C: Forensik Sound & Audio Tracking TikTok
function renderAudioForensics(data) {
  const content = document.querySelector('#audioForensicsContent');
  content.replaceChildren();

  const audio = data.audioForensics;
  if (!audio) {
    content.append(unavailable('Forensik audio tidak tersedia untuk video ini.'));
    return;
  }

  const card = document.createElement('div');
  card.className = 'audio-forensic-card';

  const topRow = document.createElement('div');
  topRow.className = 'audio-header-row';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'audio-title-group';
  titleGroup.innerHTML = `
    <span class="audio-icon-pulse"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>
    <div>
      <strong>${safeText(audio.title, 'Sound TikTok')}</strong>
      <span class="audio-author-tag">Dipopulerkan oleh: @${safeText(audio.author, 'kreator')}</span>
    </div>
  `;

  const typeBadge = document.createElement('span');
  typeBadge.className = 'audio-type-badge';
  typeBadge.dataset.type = audio.badge || 'warning';
  typeBadge.textContent = audio.audioTypeLabel || 'Trek Audio';

  topRow.append(titleGroup, typeBadge);

  const expl = document.createElement('p');
  expl.className = 'audio-expl-text';
  expl.textContent = audio.explanation || 'Analisis kecocokan suara audio dengan visual.';

  card.append(topRow, expl);
  content.append(card);
}

// Section D: OCR Teks Stiker Mengambang di Layar
function renderOnScreenOcr(data) {
  const content = document.querySelector('#onScreenOcrContent');
  content.replaceChildren();

  const ocr = data.onScreenOcr;
  if (!ocr || !Array.isArray(ocr.detectedTexts) || ocr.detectedTexts.length === 0) {
    const expl = document.createElement('p');
    expl.className = 'report-explanation';
    expl.textContent = ocr?.explanation || 'Tidak terdeteksi stiker teks atau overlay huruf kapital berlebih pada video ini.';
    content.append(expl);
    return;
  }

  const expl = document.createElement('p');
  expl.className = 'report-explanation';
  expl.textContent = ocr.explanation || 'Teks stiker dan overlay yang terdeteksi di dalam video:';
  content.append(expl);

  const list = document.createElement('ul');
  list.className = 'ocr-quotes-list';
  ocr.detectedTexts.forEach(txt => {
    const li = document.createElement('li');
    li.className = 'ocr-quote-item';
    li.textContent = `"${txt}"`;
    list.append(li);
  });
  content.append(list);
}

// Section E: Deteksi De-kontekstualisasi & Reverse Keyframe Search
function renderDecontextualization(data) {
  const content = document.querySelector('#decontextContent');
  content.replaceChildren();

  const decontext = data.decontextualization;
  const expl = document.createElement('p');
  expl.className = 'report-explanation';
  expl.textContent = decontext?.explanation || 'Pemeriksaan asal-usul rekaman video membantu memastikan video tidak diambil dari peristiwa lama.';
  content.append(expl);

  const links = decontext?.reverseSearchLinks;
  if (links) {
    const grid = document.createElement('div');
    grid.className = 'reverse-search-grid';

    const googleBtn = document.createElement('a');
    googleBtn.className = 'reverse-btn';
    googleBtn.href = links.googleLens;
    googleBtn.target = '_blank';
    googleBtn.rel = 'noopener noreferrer';
    googleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> <span>Lacak Asal Video di Google Lens</span> ↗';

    const yandexBtn = document.createElement('a');
    yandexBtn.className = 'reverse-btn';
    yandexBtn.href = links.yandex;
    yandexBtn.target = '_blank';
    yandexBtn.rel = 'noopener noreferrer';
    yandexBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> <span>Cek Rekaman Lama di Yandex</span> ↗';

    grid.append(googleBtn, yandexBtn);
    content.append(grid);
  }
}

// Section F: Forensik Profil & Kredibilitas Pengunggah
function renderAuthorForensics(data) {
  const content = document.querySelector('#authorForensicsContent');
  content.replaceChildren();

  const author = data.authorForensics;
  if (!author) {
    content.append(unavailable('Data akun pengunggah tidak tersedia.'));
    return;
  }

  const card = document.createElement('div');
  card.className = 'author-forensic-card';

  const top = document.createElement('div');
  top.className = 'author-forensic-top';

  const userGroup = document.createElement('div');
  userGroup.className = 'author-forensic-user';

  if (author.avatarUrl) {
    const av = document.createElement('img');
    av.className = 'author-forensic-avatar';
    av.src = author.avatarUrl;
    av.alt = author.authorName;
    userGroup.append(av);
  } else {
    const fallbackAv = document.createElement('div');
    fallbackAv.className = 'author-forensic-avatar-fallback';
    fallbackAv.textContent = (author.authorName?.[0] || 'U').toUpperCase();
    userGroup.append(fallbackAv);
  }

  const nameGroup = document.createElement('div');
  nameGroup.innerHTML = `
    <strong>${safeText(author.authorName)}</strong>
    <span style="display:block;font-size:12.5px;color:var(--text-muted)">@${safeText(author.authorUsername)}</span>
  `;
  userGroup.append(nameGroup);

  const badgeRow = document.createElement('div');
  badgeRow.style.display = 'flex';
  badgeRow.style.gap = '8px';
  badgeRow.style.alignItems = 'center';

  if (author.isVerified) {
    const verTag = document.createElement('span');
    verTag.className = 'author-verified-tag';
    verTag.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Terverifikasi';
    badgeRow.append(verTag);
  }

  const typeTag = document.createElement('span');
  typeTag.className = 'quick-badge';
  typeTag.dataset.badge = author.badge || 'verified';
  typeTag.textContent = author.accountTypeLabel || 'Akun Publik';
  badgeRow.append(typeTag);

  top.append(userGroup, badgeRow);

  const expl = document.createElement('p');
  expl.className = 'report-explanation';
  expl.textContent = author.explanation || 'Analisis kredibilitas pembuat konten.';

  card.append(top, expl);

  if (author.stats && (author.stats.playCount > 0 || author.stats.diggCount > 0)) {
    const statsRow = document.createElement('div');
    statsRow.className = 'author-stats-row';
    statsRow.innerHTML = `
      <div class="author-stat-box"><span>TOTAL DITONTON</span><strong>${author.stats.playCount.toLocaleString('id-ID')}</strong></div>
      <div class="author-stat-box"><span>TOTAL SUKA</span><strong>${author.stats.diggCount.toLocaleString('id-ID')}</strong></div>
      <div class="author-stat-box"><span>KOMENTAR</span><strong>${author.stats.commentCount.toLocaleString('id-ID')}</strong></div>
      <div class="author-stat-box"><span>ENGAGEMENT</span><strong>${author.stats.engagementRate || 'N/A'}</strong></div>
    `;
    card.append(statsRow);
  }

  content.append(card);
}

// Section G: Video Context Understanding
function renderVideoContext(data) {
  const panel = document.querySelector('#videoContextPanel');
  const content = document.querySelector('#videoContextContent');
  content.replaceChildren();

  const ctx = data.videoContext;
  if (!ctx) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const modeBadge = document.createElement('div');
  modeBadge.className = 'context-mode-badge';
  if (ctx.analysisMode === 'multimodal-deep') {
    modeBadge.dataset.mode = 'deep';
    modeBadge.innerHTML = '<span class="mode-dot mode-dot-deep"></span> AI Gemini Menonton & Menganalisis Video dari Awal sampai Habis';
  } else {
    modeBadge.dataset.mode = 'text';
    modeBadge.innerHTML = '<span class="mode-dot mode-dot-text"></span> Analisis Konteks & Topik Substantif';
  }
  content.append(modeBadge);

  if (ctx.topicSummary) {
    const topicBlock = document.createElement('div');
    topicBlock.className = 'context-topic-block';
    topicBlock.innerHTML = `
      <span class="context-label">ESENSI & TOPIK UTAMA VIDEO</span>
      <p class="context-topic-text">${ctx.topicSummary}</p>
    `;
    content.append(topicBlock);
  }

  if (ctx.detailedNarrative && ctx.detailedNarrative.trim()) {
    const narrBlock = document.createElement('div');
    narrBlock.className = 'context-section';
    narrBlock.innerHTML = `
      <span class="context-label">ALUR NARASI & PENJELASAN KONTEKS</span>
      <p class="context-narrative-text">${ctx.detailedNarrative}</p>
    `;
    content.append(narrBlock);
  }

  const dualGrid = document.createElement('div');
  dualGrid.className = 'context-dual-grid';

  if (ctx.visualDescription && ctx.visualDescription.trim()) {
    const visCard = document.createElement('div');
    visCard.className = 'context-detail-card';
    visCard.innerHTML = `
      <span class="context-label">ELEMEN VISUAL (APA YANG TERLIHAT)</span>
      <p>${ctx.visualDescription}</p>
    `;
    dualGrid.append(visCard);
  }

  if (ctx.spokenContent && ctx.spokenContent.trim()) {
    const spkCard = document.createElement('div');
    spkCard.className = 'context-detail-card';
    spkCard.innerHTML = `
      <span class="context-label">NARASI VERBAL & UCAPAN (SUARA)</span>
      <p>${ctx.spokenContent}</p>
    `;
    dualGrid.append(spkCard);
  }

  if (dualGrid.childElementCount) content.append(dualGrid);

  if (ctx.videoVsCaption && ctx.videoVsCaption.trim()) {
    const vsBlock = document.createElement('div');
    vsBlock.className = 'context-vs-block';
    vsBlock.innerHTML = `
      <span class="context-label">KONSISTENSI: ISI VIDEO vs CAPTION/JUDUL</span>
      <p>${ctx.videoVsCaption}</p>
    `;
    content.append(vsBlock);
  }

  if (Array.isArray(ctx.keyMoments) && ctx.keyMoments.length > 0) {
    const momentsBlock = document.createElement('div');
    momentsBlock.className = 'context-section';
    const momLabel = document.createElement('span');
    momLabel.className = 'context-label';
    momLabel.textContent = 'MOMEN-MOMEN KUNCI DALAM VIDEO';
    const momList = document.createElement('ul');
    momList.className = 'context-moments-list';
    ctx.keyMoments.forEach(m => {
      if (typeof m === 'string' && m.trim()) {
        const li = document.createElement('li');
        li.textContent = m;
        momList.append(li);
      }
    });
    momentsBlock.append(momLabel, momList);
    content.append(momentsBlock);
  }
}

// Section H: Comments & Bot / Astroturfing Detection
function renderComments(data) {
  const comments = document.querySelector('#commentsContent');
  comments.replaceChildren();

  if (data.comments && typeof data.comments === 'object') {
    const values = data.comments;

    // Bot / Astroturfing warning
    if (data.commentForensics && data.commentForensics.astroturfingDetected) {
      const astroBox = document.createElement('div');
      astroBox.className = 'astroturfing-alert-box';
      astroBox.innerHTML = `
        <strong><span class="warning-tag">Peringatan</span> Deteksi Bot / Astroturfing:</strong>
        <p>${data.commentForensics.astroturfingSignal}</p>
      `;
      comments.append(astroBox);
    }

    const posVal = parseFloat(values.positive) || 0;
    const negVal = parseFloat(values.negative) || 0;
    const hateVal = parseFloat(values.hate) || 0;

    const sentimentBarWrapper = document.createElement('div');
    sentimentBarWrapper.className = 'sentiment-bar-wrapper';
    sentimentBarWrapper.innerHTML = `
      <div class="sentiment-bar">
        <div class="sentiment-seg seg-positive" style="width: ${posVal}%" title="Positif: ${values.positive}"></div>
        <div class="sentiment-seg seg-negative" style="width: ${negVal}%" title="Negatif: ${values.negative}"></div>
        <div class="sentiment-seg seg-hate" style="width: ${hateVal}%" title="Kebencian: ${values.hate}"></div>
      </div>
      <div class="sentiment-legend">
        <span><i class="dot dot-pos"></i> Positif ${safeText(values.positive, '0%')}</span>
        <span><i class="dot dot-neg"></i> Negatif ${safeText(values.negative, '0%')}</span>
        <span><i class="dot dot-hate"></i> Kebencian ${safeText(values.hate, '0%')}</span>
      </div>
    `;
    comments.append(sentimentBarWrapper);

    const statsGrid = document.createElement('div');
    statsGrid.className = 'comment-stats-grid';
    if (Number.isFinite(values.sampleSize) && values.sampleSize > 0) {
      statsGrid.innerHTML += `<div class="stat-box"><span>DITELAAH (RIIL)</span><strong>${values.sampleSize}</strong></div>`;
    }
    if (Number.isFinite(values.filteredOutCount) && values.filteredOutCount > 0) {
      statsGrid.innerHTML += `<div class="stat-box stat-filtered"><span>DISARING (SPAM)</span><strong>${values.filteredOutCount}</strong></div>`;
    }
    if (statsGrid.childElementCount) comments.append(statsGrid);

    const explanation = document.createElement('p');
    explanation.className = 'report-explanation';
    explanation.textContent = safeText(values.summary);
    comments.append(explanation);

    if (Array.isArray(values.sampleComments) && values.sampleComments.length > 0) {
      const sampleSectionTitle = document.createElement('h4');
      sampleSectionTitle.className = 'sub-panel-title';
      sampleSectionTitle.textContent = 'Sampel Komentar Riil Warganet:';
      comments.append(sampleSectionTitle);

      const sampleGrid = document.createElement('div');
      sampleGrid.className = 'sample-comments-grid';

      values.sampleComments.forEach((cItem) => {
        const card = document.createElement('div');
        card.className = 'sample-comment-card';
        card.innerHTML = `
          <div class="sample-card-top">
            <span class="sample-badge" data-type="${cItem.type || 'positive'}">${safeText(cItem.label, 'Komentar')}</span>
            <div class="sample-meta-right">
              ${cItem.userUniqueId ? `<span class="sample-user-handle">@${cItem.userUniqueId}</span>` : ''}
              ${cItem.likes > 0 ? `<span class="sample-likes-count">${cItem.likes.toLocaleString('id-ID')} suka</span>` : ''}
            </div>
          </div>
          <blockquote class="sample-quote-text">${safeText(cItem.text)}</blockquote>
          ${cItem.reason ? `<p class="sample-reason-note">${cItem.reason}</p>` : ''}
        `;
        sampleGrid.append(card);
      });
      comments.append(sampleGrid);
    }
  } else {
    comments.append(unavailable('Data komentar tidak tersedia untuk video ini.'));
  }
}

// Section I: Provocation & Framing
function renderProvocation(data) {
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
  } else {
    provocation.append(unavailable('Analisis provokasi tidak tersedia.'));
  }
}

// Section J: AI & Deepfake Detection
function renderAiDetection(data) {
  const aiContent = document.querySelector('#aiContent');
  aiContent.replaceChildren();

  const ai = data.aiDetection;
  if (ai && typeof ai === 'object') {
    aiContent.innerHTML = `
      <div class="ai-status-row">
        <span class="ai-status-badge" data-type="${ai.badgeType || 'verified'}">${safeText(ai.statusLabel, 'Status Deteksi AI')}</span>
        <span class="ai-audio-tag">${safeText(ai.audioType, 'Audio')}</span>
      </div>
      <p class="report-explanation">${safeText(ai.explanation)}</p>
    `;

    if (Array.isArray(ai.signals) && ai.signals.length) {
      const list = document.createElement('ul');
      list.className = 'signals-bullet-list';
      ai.signals.forEach((s) => {
        const li = document.createElement('li');
        li.textContent = s;
        list.append(li);
      });
      aiContent.append(list);
    }
  } else {
    aiContent.append(unavailable('Deteksi AI tidak tersedia.'));
  }
}

// Section K: Claim Verification & Sources
function renderClaims(data) {
  const claims = document.querySelector('#claimsContent');
  claims.replaceChildren();

  const claimList = Array.isArray(data.claims) ? data.claims : [];
  if (!claimList.length) {
    claims.append(unavailable('Tidak ada klaim yang berhasil diperiksa.'));
    return;
  }

  claimList.forEach((claim) => {
    const item = document.createElement('article');
    item.className = 'claim-card-item';
    const verdictKey = Object.hasOwn(verdictLabels, claim.verdict) ? claim.verdict : 'unverified';

    item.innerHTML = `
      <div class="claim-top">
        <h4 class="claim-text">${safeText(claim.claim, 'Klaim tanpa teks.')}</h4>
        <span class="verdict-badge" data-verdict="${verdictKey}">${verdictLabels[verdictKey]}</span>
      </div>
      ${claim.explanation ? `<p class="claim-detail">${claim.explanation}</p>` : ''}
    `;

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
          const li = document.createElement('li');
          li.innerHTML = `<a href="${url.href}" target="_blank" rel="noopener noreferrer">${safeText(source.publisher, '') ? `${source.publisher}: ` : ''}${safeText(source.title, url.hostname)} ↗</a>`;
          sources.append(li);
        } catch {}
      });
      if (sources.childElementCount) item.append(sources);
    }
    claims.append(item);
  });
}

// Section L: Full News Sources & Cek Fakta Archives
function renderNewsSources(data) {
  const newsPanel = document.querySelector('#newsSourcesContent');
  newsPanel.replaceChildren();

  const newsSources = Array.isArray(data.newsVerificationSources) ? data.newsVerificationSources : [];
  if (newsSources.length) {
    const introText = document.createElement('p');
    introText.className = 'report-explanation';
    introText.textContent = 'Akses pencarian berita dan arsip cek fakta nasional resmi yang relevan:';
    newsPanel.append(introText);

    const grid = document.createElement('div');
    grid.className = 'news-sources-grid';
    newsSources.forEach((src) => {
      try {
        const url = new URL(src.url);
        const card = document.createElement('a');
        card.className = 'news-source-card';
        card.href = url.href;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.innerHTML = `
          <span class="news-source-publisher">${safeText(src.publisher, url.hostname)}</span>
          <span class="news-source-title">${safeText(src.title, 'Cari berita terkait')}</span>
          <span class="news-source-arrow">↗</span>
        `;
        grid.append(card);
      } catch {}
    });
    newsPanel.append(grid);
  } else {
    newsPanel.append(unavailable('Sumber berita verifikasi tidak tersedia.'));
  }
}

// ==========================================
// MASTER REPORT RENDERER
// ==========================================
function renderReport(data, submittedUrl) {
  const normalizedUrl = parseTikTokUrl(submittedUrl)?.href || submittedUrl;
  const videoLink = document.querySelector('#reportVideoLink');
  videoLink.href = normalizedUrl.startsWith('http') ? normalizedUrl : '#';
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

  // Timestamp
  const timestampEl = document.querySelector('#reportTimestamp');
  if (timestampEl) {
    const ts = data.analyzedAt ? new Date(data.analyzedAt) : new Date();
    timestampEl.textContent = `Dianalisis: ${ts.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} pukul ${ts.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
    timestampEl.hidden = false;
  }

  // 1. Render Tab 1: Ringkasan Cepat
  renderQuickVerdict(data, normalizedUrl);

  // 2. Render Tab 2: Analisis Mendalam
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

  renderVideoContext(data);
  renderMediaPanel(data, normalizedUrl);
  renderCaptionPanel(data);
  renderAudioForensics(data);
  renderOnScreenOcr(data);
  renderDecontextualization(data);
  renderAuthorForensics(data);
  renderComments(data);
  renderProvocation(data);
  renderAiDetection(data);
  renderClaims(data);
  renderNewsSources(data);

  // Top action buttons
  const copyBtn = document.querySelector('#copyReportButton');
  const shareWaBtn = document.querySelector('#shareWaButton');

  copyBtn.onclick = async () => {
    const vidTitle = safeText(data.video?.fullCaption || data.video?.title, 'Video TikTok');
    const credText = data.credibility ? `Skor Kredibilitas: ${data.credibility.score}/100 (${data.credibility.rating})` : '';
    const provText = data.provocation ? `Tingkat Provokasi: ${levelLabels[data.provocation.level] || 'Belum diketahui'}` : '';

    const summary = [
      `VERIFTOK - Ringkasan Analisis Lengkap`,
      `Konten: ${normalizedUrl}`,
      `Judul: ${vidTitle.slice(0, 120)}`,
      credText,
      provText,
      `Tema: ${data.substantiveTheme || 'Isu Terkait'}`,
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
      `*VERIFTOK - Cek Fakta Konten TikTok*`,
      `Konten: ${normalizedUrl}`,
      `Skor Kredibilitas: ${credScore}/100 (${credRating})`,
      `Tema Sebenarnya: *${data.substantiveTheme || 'Isu Terkait'}*`,
      `Judul: ${vidTitle.slice(0, 100)}`,
      `\nAnalisis otomatis oleh VerifTok.`
    ].join('\n');
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`, '_blank');
  };

  // Persist current report state so switching tabs or page navigation won't lose it
  window.currentReportResult = data;
  window.currentReportUrl = normalizedUrl;
  try {
    sessionStorage.setItem('veriftok_last_analysis', JSON.stringify({ data, normalizedUrl }));
  } catch {}

  // Default to Quick Verdict view
  switchReportTab('quick');
  report.hidden = false;
  state.hidden = true;
  report.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

// ==========================================
// FACT CARD PNG GENERATOR (HTML5 CANVAS)
// ==========================================
function generateFactCardImage(data, normalizedUrl) {
  const canvas = document.querySelector('#factCardCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const width = 1080;
  const height = 1350;
  canvas.width = width;
  canvas.height = height;

  // Background Dark Gradient
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#0c1210');
  grad.addColorStop(0.5, '#141d1a');
  grad.addColorStop(1, '#080d0b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Decorative border
  ctx.strokeStyle = '#2a3d36';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  // Header Brand
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 42px Manrope, sans-serif';
  ctx.fillText('veriftok', 80, 110);
  ctx.fillStyle = '#6c7f74';
  ctx.font = '500 22px "DM Mono", monospace';
  ctx.fillText('KARTU PEMERIKSAAN FAKTA', 80, 145);

  const qv = data.quickVerdict || {};
  const badgeLabel = qv.badgeLabel || 'PERIKSA';
  const badgeType = qv.badgeType || 'warning';

  // Verdict Stamp Box
  let stampBg = '#2a2012';
  let stampBorder = '#fbbf24';
  let stampText = '#fde68a';

  if (badgeType === 'verified') {
    stampBg = '#12281e';
    stampBorder = '#34d399';
    stampText = '#a7f3d0';
  } else if (badgeType === 'danger') {
    stampBg = '#2d1616';
    stampBorder = '#f87171';
    stampText = '#fca5a5';
  }

  ctx.fillStyle = stampBg;
  ctx.strokeStyle = stampBorder;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(80, 190, width - 160, 140, 20);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = stampText;
  ctx.font = '800 48px "DM Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(badgeLabel, width / 2, 275);
  ctx.textAlign = 'left';

  // Score Bar & Rating
  const score = qv.score != null ? qv.score : (data.credibility?.score || 50);
  ctx.fillStyle = '#f3f6f4';
  ctx.font = '700 26px Manrope, sans-serif';
  ctx.fillText(`Skor Kredibilitas Narasi: ${score} / 100`, 80, 390);

  ctx.fillStyle = '#9eb0a4';
  ctx.font = '400 22px Inter, sans-serif';
  const summaryText = qv.summaryVerdict || 'Informasi dalam video ini memerlukan kroscek lebih lanjut.';
  wrapText(ctx, summaryText, 80, 430, width - 160, 32);

  // Section 1: Substantive Theme
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 22px "DM Mono", monospace';
  ctx.fillText('TEMA SEBENARNYA (BUKAN DARI JUDUL):', 80, 560);

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 26px Manrope, sans-serif';
  const theme = data.substantiveTheme || qv.substantiveTheme || 'Isu Terkait';
  ctx.fillText(`"${theme}"`, 80, 605);

  ctx.fillStyle = '#9eb0a4';
  ctx.font = '400 22px Inter, sans-serif';
  const themeExpl = qv.themeExplanation || `Video berfokus pada topik '${theme}'.`;
  wrapText(ctx, themeExpl, 80, 645, width - 160, 32);

  // Section 2: Key Finding (Fakta Lapangan)
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 22px "DM Mono", monospace';
  ctx.fillText('TEMUAN FAKTA LAPANGAN:', 80, 770);

  ctx.fillStyle = '#f3f6f4';
  ctx.font = '400 23px Inter, sans-serif';
  const keyFindingText = qv.keyFinding || (data.claims?.[0]?.explanation) || 'Narasi perlu dicocokkan dengan sumber berita resmi.';
  wrapText(ctx, keyFindingText, 80, 815, width - 160, 34);

  // Section 3: Audio & Creator Forensics
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 22px "DM Mono", monospace';
  ctx.fillText('CATATAN FORENSIK TIKTOK:', 80, 960);

  ctx.fillStyle = '#9eb0a4';
  ctx.font = '400 21px Inter, sans-serif';
  const audioNote = data.audioForensics?.audioTypeLabel ? `• Sound: ${data.audioForensics.audioTypeLabel}` : '• Sound: Analisis audio dilakukan';
  const authorNote = data.authorForensics?.accountTypeLabel ? `• Pengunggah: ${data.authorForensics.accountTypeLabel}` : '';
  ctx.fillText(audioNote, 80, 1005);
  if (authorNote) ctx.fillText(authorNote, 80, 1045);

  // Footer Watermark
  ctx.strokeStyle = '#2a3d36';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, 1180);
  ctx.lineTo(width - 80, 1180);
  ctx.stroke();

  ctx.fillStyle = '#6c7f74';
  ctx.font = '500 20px "DM Mono", monospace';
  const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillText(`Diverifikasi oleh VerifTok · ${dateStr}`, 80, 1225);
  ctx.fillText('Baca · Periksa · Putuskan secara bijak', 80, 1260);

  // Download Trigger
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veriftok_kartu_fakta_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

// Canvas Text Wrapping Helper
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let curY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, curY);
      line = words[n] + ' ';
      curY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, curY);
}

// ==========================================
// SUBMIT ANALYSIS (URL & FILE)
// ==========================================
async function doUrlAnalysis() {
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

  input.value = validUrl;
  input.removeAttribute('aria-invalid');
  report.hidden = true;

  showState('pending', 'Sedang Menganalisis Konten TikTok', 'Memeriksa video / foto slide, mengurai sound audio, menyaring stiker teks, dan mencocokkan tema berita...');

  const progressSteps = [
    { delay: 400, text: 'Mengambil metadata dan audio trek TikTok...' },
    { delay: 1200, text: 'Mendeteksi format konten (video / foto slide)...' },
    { delay: 2200, text: 'AI menelaah isi visual dan transkrip audio...' },
    { delay: 3600, text: 'Mengekstrak tema substantif & mencari berita resmi live...' },
    { delay: 5200, text: 'Menyaring komentar publik & mendeteksi bot astroturfing...' },
    { delay: 7000, text: 'Menyusun laporan ringkasan cepat dan forensik lengkap...' },
  ];
  const progressTimers = progressSteps.map(step =>
    setTimeout(() => {
      const detail = state.querySelector('.state-copy p');
      if (detail && state.dataset.kind === 'pending') detail.textContent = step.text;
    }, step.delay)
  );

  setLoading(true, false);

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

    if (response.status === 422) {
      error.textContent = result.message || 'Tautan TikTok tidak valid.';
      error.hidden = false;
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
    setLoading(false, false);
  }
  return false;
}

async function doFileAnalysis() {
  if (!selectedUploadFile) return;

  fileError.hidden = true;
  report.hidden = true;

  showState('pending', 'Menganalisis Berkas Terpilih', 'Membaca berkas dan memulai pemeriksaan forensik...');
  setLoading(true, true);

  const fileSteps = [
    { delay: 350, text: 'Membaca berkas dan mengunggah ke mesin forensik...' },
    { delay: 1200, text: 'AI menelaah isi visual, mendeteksi stiker teks OCR...' },
    { delay: 2400, text: 'Mengekstrak tema substantif & menelusuri fakta lapangan...' },
    { delay: 4000, text: 'Menyusun laporan ringkasan dan kartu fakta berstempel...' },
  ];
  const fileTimers = fileSteps.map(step =>
    setTimeout(() => {
      const detail = state.querySelector('.state-copy p');
      if (detail && state.dataset.kind === 'pending') detail.textContent = step.text;
    }, step.delay)
  );

  try {
    const reader = new FileReader();
    reader.onerror = () => {
      fileTimers.forEach(clearTimeout);
      showState('error', 'Gagal Membaca Berkas', 'Berkas tidak dapat dibaca dari perangkat Anda.', true);
      setLoading(false, true);
    };

    reader.onload = async () => {
      const base64Data = reader.result;
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            fileBase64: base64Data,
            mimeType: selectedUploadFile.type,
            fileName: selectedUploadFile.name
          })
        });

        const result = await response.json().catch(() => ({}));
        if (response.ok && result.status && ['complete', 'partial'].includes(result.status)) {
          renderReport(result, selectedUploadFile.name);
          return;
        }

        showState('error', 'Pemeriksaan Gagal', result.message || 'Terjadi kesalahan saat memeriksa berkas.', true);
      } catch (err) {
        showState('error', 'Tidak Dapat Terhubung', 'Gagal mengirim berkas ke server. Pastikan ukuran di bawah 45MB.', true);
      } finally {
        fileTimers.forEach(clearTimeout);
        setLoading(false, true);
      }
    };

    reader.readAsDataURL(selectedUploadFile);
  } catch (err) {
    fileTimers.forEach(clearTimeout);
    showState('error', 'Kesalahan Berkas', err.message, true);
    setLoading(false, true);
  }
}

// Event Listeners for URL Analysis
button.addEventListener('click', (e) => {
  if (e) e.preventDefault();
  doUrlAnalysis();
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    doUrlAnalysis();
  }
});

form.addEventListener('submit', (e) => {
  if (e) e.preventDefault();
  doUrlAnalysis();
  return false;
});

// Event Listener for File Analysis
analyzeFileButton.addEventListener('click', (e) => {
  if (e) e.preventDefault();
  doFileAnalysis();
});

// New Analysis Button
document.querySelector('#newAnalysisButton').addEventListener('click', () => {
  report.hidden = true;
  window.currentReportResult = null;
  window.currentReportUrl = null;
  try { sessionStorage.removeItem('veriftok_last_analysis'); } catch {}
  input.value = '';
  fileInput.value = '';
  selectedUploadFile = null;
  dropzoneSelected.hidden = true;
  dropzonePrompt.hidden = false;
  analyzeFileButton.disabled = true;
  input.focus();
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});

// PWA Install Prompt
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

// Service Worker Registration
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.update().catch(() => {});
    }).catch(() => {});
  });
}

window.addEventListener('offline', () => showState('notice', 'Kamu sedang offline', 'Pemeriksaan tautan memerlukan koneksi internet.'));
window.addEventListener('online', () => { if (state.dataset.kind === 'notice' && state.textContent.includes('offline')) state.hidden = true; });

// Restore previous analysis from session if available
(function restorePreviousSession() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('url') || params.get('text') || params.get('title')) {
      // Don't restore old session if page was opened via Web Share Target
      return;
    }
    const cached = sessionStorage.getItem('veriftok_last_analysis');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.data && parsed.normalizedUrl) {
        window.currentReportResult = parsed.data;
        window.currentReportUrl = parsed.normalizedUrl;
        renderReport(parsed.data, parsed.normalizedUrl);
        if (parsed.normalizedUrl.startsWith('http')) {
          input.value = parsed.normalizedUrl;
        }
      }
    }
  } catch {}
})();

// ==========================================
// GLOSARIUM / KAMUS ISTILAH AWAM
// ==========================================
const glossaryModal = document.querySelector('#glossaryModal');
const closeGlossaryBtn = document.querySelector('#closeGlossaryBtn');
const glossaryBackdrop = document.querySelector('#glossaryBackdrop');
const topbarGlossaryBtn = document.querySelector('#topbarGlossaryBtn');
const reportGlossaryBtn = document.querySelector('#reportGlossaryBtn');

function openGlossary(targetTermId = null) {
  if (!glossaryModal) return;
  glossaryModal.hidden = false;
  document.body.style.overflow = 'hidden';

  if (targetTermId) {
    setTimeout(() => {
      const card = document.querySelector(`#term-${targetTermId}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('highlight');
        setTimeout(() => card.classList.remove('highlight'), 2200);
      }
    }, 150);
  }
}

function closeGlossary() {
  if (!glossaryModal) return;
  glossaryModal.hidden = true;
  document.body.style.overflow = '';
}

if (topbarGlossaryBtn) topbarGlossaryBtn.addEventListener('click', () => openGlossary());
if (reportGlossaryBtn) reportGlossaryBtn.addEventListener('click', () => openGlossary());
if (closeGlossaryBtn) closeGlossaryBtn.addEventListener('click', closeGlossary);
if (glossaryBackdrop) glossaryBackdrop.addEventListener('click', closeGlossary);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && glossaryModal && !glossaryModal.hidden) {
    closeGlossary();
  }
});

// Help badges click
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.term-help-badge');
  if (btn && btn.dataset.term) {
    openGlossary(btn.dataset.term);
  }
});

// ==========================================
// WEB SHARE TARGET INCOMING HANDLER (PWA)
// ==========================================
(function handleIncomingShare() {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryUrl = params.get('url');
    const queryText = params.get('text');
    const queryTitle = params.get('title');

    const candidate = queryUrl || queryText || queryTitle;
    if (candidate) {
      const detectedUrl = extractAndValidateTikTokUrl(candidate);
      if (detectedUrl) {
        if (window.history && window.history.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        input.value = detectedUrl;
        tabModeUrl.click();
        setTimeout(() => {
          doUrlAnalysis();
        }, 250);
      }
    }
  } catch (err) {
    console.error('Incoming share handling error:', err);
  }
})();
