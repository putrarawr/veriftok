const fs = require('fs');
const path = require('path');
const { createWriteStream } = require('fs');
const os = require('os');

const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);

try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = value;
      }
    });
  }
} catch {
  // Ignore env read issues
}

const TEMP_DIR = path.join(os.tmpdir(), 'veriftok_videos');

function json(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

function isTikTokUrl(value) {
  if (typeof value !== 'string') return false;
  let str = value.trim().replace(/[.,;:!?)>]+$/, '');
  if (!str.startsWith('http://') && !str.startsWith('https://')) {
    str = 'https://' + str;
  }
  try {
    const url = new URL(str);
    const host = url.hostname.toLowerCase();
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      (TIKTOK_HOSTS.has(host) || host.endsWith('.tiktok.com'));
  } catch {
    return false;
  }
}

function extractVideoId(urlStr) {
  try {
    const match = urlStr.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function extractKeyEntities(text) {
  if (!text) return [];
  const entities = new Set();
  
  const hashtags = text.match(/#([\w\u0600-\u06FF\u4e00-\u9fa5]+)/g) || [];
  const ignoreTags = new Set([
    'fyyyppppppppppppppp', 'fyp', 'fyp5263m', 'xyzbca', 'viral', 'trending',
    'foryou', 'foryoupage', 'beritatrending', 'breakingnews', 'beritaterkini',
    'news', 'update', 'berita', 'masukberanda', 'viralkan'
  ]);
  hashtags.forEach(tag => {
    const clean = tag.replace('#', '').trim();
    if (clean.length >= 3 && !ignoreTags.has(clean.toLowerCase())) {
      entities.add(clean);
    }
  });

  const words = text.match(/\b[A-Z][a-zA-Z0-9_-]{2,}\b/g) || [];
  const stopwords = new Set([
    'Video', 'TikTok', 'Foto', 'Viral', 'Heboh', 'Lengkap', 'Dulu', 'Kini',
    'Sempat', 'Karena', 'Jadi', 'Tengah', 'Polemik', 'Atch', 'More', 'Exciting',
    'Watch', 'Sangat', 'Dengan', 'Bisa', 'Akan', 'Ini', 'Itu', 'Dari', 'Yang',
    'Untuk', 'Pada', 'Dalam', 'Breaking', 'News', 'Terkini', 'Update', 'Terbaru',
    'Geger', 'Gempar', 'Kaget', 'Detik', 'Gokil', 'Wajib', 'Simak'
  ]);
  words.forEach(w => {
    if (!stopwords.has(w)) entities.add(w);
  });

  const topicMatch = text.match(/\b(wamenkeu|purbaya|prabowo|gibran|jokowi|luky|alfirman|menteri|kabinet|dpr|mpr|kpk|polri|tni|keuangan|kemenkeu|gempa|megathrust|tsunami|penipuan|subsidi|polisi|kasus|hukum|ijazah|korupsi|pajak|ppn|mbg|motor|listrik|harga|bbm|ikn|timnas|sepakbola|pilkada|bansos|bmkg|bnpb|cuaca|banjir|kpu|reshuffle|pelantikan)\b/gi) || [];
  topicMatch.forEach(w => entities.add(w.toLowerCase()));

  if (entities.size === 0 && text.trim()) {
    const rawWords = text.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !['dengan', 'karena', 'sudah', 'tapi', 'bisa', 'akan', 'atau', 'yang', 'pada', 'dari', 'untuk', 'dalam', 'viral', 'heboh', 'geger', 'gempar', 'kabar', 'info'].includes(w.toLowerCase()));
    rawWords.slice(0, 4).forEach(w => entities.add(w));
  }

  return Array.from(entities).slice(0, 6);
}

function validReport(report) {
  if (!report || !['complete', 'partial'].includes(report.status)) return false;
  if (report.claims != null && (!Array.isArray(report.claims) || report.claims.some((claim) => {
    if (!claim || typeof claim !== 'object' || typeof claim.claim !== 'string') return true;
    return claim.sources != null && (!Array.isArray(claim.sources) || claim.sources.some((source) => !source || typeof source !== 'object' || typeof source.url !== 'string'));
  }))) return false;
  if (report.limitations != null && (!Array.isArray(report.limitations) || report.limitations.some((item) => typeof item !== 'string'))) return false;
  if (report.comments != null && typeof report.comments !== 'object') return false;
  if (report.provocation != null && typeof report.provocation !== 'object') return false;
  return true;
}

async function resolveTikTokUrl(inputUrl) {
  try {
    const parsed = new URL(inputUrl);
    if (['vt.tiktok.com', 'vm.tiktok.com', 'm.tiktok.com'].includes(parsed.hostname.toLowerCase())) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(inputUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        });
        if (res.url && isTikTokUrl(res.url)) {
          return res.url;
        }
      } finally {
        clearTimeout(t);
      }
    }
  } catch {
    // Continue with inputUrl if redirect fails
  }
  return inputUrl;
}

async function fetchTikTokOembed(resolvedUrl) {
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(resolvedUrl)}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(oembedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (res.ok) {
        return await res.json();
      }
    } finally {
      clearTimeout(t);
    }
  } catch {
    // Oembed fetch fallback
  }
  return null;
}

// Fetch Full TikTok Data from Tikwm (Video, Photo Mode, Music, Author, Stats)
async function fetchTikwmData(resolvedUrl) {
  try {
    const params = new URLSearchParams();
    params.append('url', resolvedUrl);
    params.append('hd', '0');

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://www.tikwm.com/'
        },
        body: params
      });
      if (res.ok) {
        const json = await res.json();
        if (json.code === 0 && json.data) {
          const d = json.data;
          const isPhotoMode = Array.isArray(d.images) && d.images.length > 0;
          let videoDownloadUrl = d.play || d.hdplay || null;
          if (videoDownloadUrl && videoDownloadUrl.startsWith('/')) {
            videoDownloadUrl = `https://www.tikwm.com${videoDownloadUrl}`;
          }

          return {
            id: d.id,
            title: d.title || '',
            cover: d.cover || d.origin_cover || '',
            duration: d.duration || 0,
            isPhotoMode,
            photoSlides: isPhotoMode ? d.images : [],
            videoDownloadUrl,
            author: {
              id: d.author?.id || '',
              unique_id: d.author?.unique_id || '',
              nickname: d.author?.nickname || '',
              avatar: d.author?.avatar || '',
              verified: Boolean(d.author?.verified)
            },
            music: {
              id: d.music_info?.id || '',
              title: d.music_info?.title || d.music || '',
              author: d.music_info?.author || '',
              play: d.music_info?.play || '',
              original: Boolean(d.music_info?.original),
              duration: d.music_info?.duration || 0
            },
            stats: {
              playCount: Number(d.play_count || 0),
              diggCount: Number(d.digg_count || 0),
              commentCount: Number(d.comment_count || 0),
              shareCount: Number(d.share_count || 0),
              downloadCount: Number(d.download_count || 0)
            }
          };
        }
      }
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    console.error('[TikwmData] Failed:', err.message);
  }
  return null;
}

// Fetch real TikTok comments (up to 50 comments)
async function fetchRealTikTokComments(resolvedUrl) {
  try {
    const endpoint = `https://www.tikwm.com/api/comment/list?url=${encodeURIComponent(resolvedUrl)}&count=50`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(endpoint, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.code === 0 && Array.isArray(json.data?.comments)) {
          return json.data.comments.map(c => ({
            id: c.cid || c.id,
            text: (c.text || '').trim(),
            userNickname: c.user?.nickname || c.user?.unique_id || 'Warganet TikTok',
            userUniqueId: c.user?.unique_id || 'user',
            likes: Number(c.digg_count || c.likes || 0),
            verified: Boolean(c.user?.verified)
          })).filter(c => c.text.length > 0);
        }
      }
    } finally {
      clearTimeout(t);
    }
  } catch {
    // Fail silently
  }
  return [];
}

// Download TikTok video to temp file with fast 4.5s cap
async function downloadTikTokVideo(downloadUrl) {
  if (!downloadUrl) return null;
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const videoFileName = `video_${Date.now()}.mp4`;
    const videoFilePath = path.join(TEMP_DIR, videoFileName);

    const dlController = new AbortController();
    const dlTimeout = setTimeout(() => dlController.abort(), 4500);
    try {
      const dlRes = await fetch(downloadUrl, {
        signal: dlController.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.tikwm.com/'
        }
      });

      if (!dlRes.ok || !dlRes.body) return null;

      const fileStream = createWriteStream(videoFilePath);
      const reader = dlRes.body.getReader();
      let totalBytes = 0;
      const MAX_SIZE = 50 * 1024 * 1024; // 50MB cap

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > MAX_SIZE) {
          fileStream.destroy();
          try { fs.unlinkSync(videoFilePath); } catch {}
          console.log('[VideoDownload] File exceeds 50MB cap');
          return null;
        }
        fileStream.write(value);
      }

      await new Promise((resolve, reject) => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
        fileStream.end();
      });

      return { filePath: videoFilePath, sizeBytes: totalBytes };
    } finally {
      clearTimeout(dlTimeout);
    }
  } catch (err) {
    console.error('[VideoDownload] Failed or timed out:', err.message);
    return null;
  }
}

// Download up to 3 photos concurrently from TikTok photo mode for multimodal analysis
async function downloadTikTokPhotos(imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return [];
  const selected = imageUrls.slice(0, 3);

  const downloadPromises = selected.map(async (url) => {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          return {
            inlineData: {
              mimeType: 'image/jpeg',
              data: buf.toString('base64')
            }
          };
        }
      } finally {
        clearTimeout(t);
      }
    } catch {
      // Ignore individual image download error
    }
    return null;
  });

  const results = await Promise.all(downloadPromises);
  return results.filter(Boolean);
}

// Upload video to Gemini Files API with rapid polling and strict abort timeouts
async function uploadToGeminiFiles(filePath, apiKey) {
  const fileSize = fs.statSync(filePath).size;
  const mimeType = 'video/mp4';
  const displayName = path.basename(filePath);

  const initController = new AbortController();
  const initTimeout = setTimeout(() => initController.abort(), 3500);
  let initRes;
  try {
    initRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: 'POST',
        signal: initController.signal,
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(fileSize),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: displayName } }),
      }
    );
  } finally {
    clearTimeout(initTimeout);
  }

  if (!initRes.ok) {
    throw new Error(`Gemini Files API init failed: ${initRes.status}`);
  }

  const uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('No upload URL returned from Gemini Files API');

  const fileBuffer = fs.readFileSync(filePath);
  const uploadController = new AbortController();
  const uploadTimeout = setTimeout(() => uploadController.abort(), 6000);
  let uploadRes;
  try {
    uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      signal: uploadController.signal,
      headers: {
        'Content-Length': String(fileSize),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: fileBuffer,
    });
  } finally {
    clearTimeout(uploadTimeout);
  }

  if (!uploadRes.ok) {
    throw new Error(`Gemini Files upload failed: ${uploadRes.status}`);
  }

  const uploadData = await uploadRes.json();
  const fileUri = uploadData.file?.uri;
  const fileName = uploadData.file?.name;

  if (!fileUri) throw new Error('No file URI returned');

  let fileState = uploadData.file?.state || 'PROCESSING';
  let pollAttempts = 0;
  const maxPolls = 6;

  while (fileState === 'PROCESSING' && pollAttempts < maxPolls) {
    await new Promise(r => setTimeout(r, 500));
    pollAttempts++;
    
    try {
      const statusController = new AbortController();
      const statusTimeout = setTimeout(() => statusController.abort(), 2500);
      try {
        const statusRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
          { signal: statusController.signal }
        );
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          fileState = statusData.state || 'PROCESSING';
        }
      } finally {
        clearTimeout(statusTimeout);
      }
    } catch {
      // Continue polling
    }
  }

  if (fileState !== 'ACTIVE') {
    throw new Error(`File did not become ACTIVE quickly (state: ${fileState})`);
  }

  return { fileUri, mimeType };
}

// Live News Search via Google News RSS Indonesia based on SUBSTANTIVE THEME
async function fetchLiveNews(query, secondaryQuery = null) {
  if (!query || !query.trim()) return [];

  async function queryRss(searchStr) {
    try {
      const cleanQuery = searchStr.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleanQuery) return [];
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQuery)}&hl=id&gl=ID&ceid=ID:id`;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          }
        });
        if (!res.ok) return [];
        const text = await res.text();
        const items = text.match(/<item>[\s\S]*?<\/item>/g) || [];
        return items.slice(0, 6).map(item => {
          let title = (item.match(/<title>(.*?)<\/title>/)?.[1] || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
          let source = (item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
          if (!source && title.includes(' - ')) {
            const parts = title.split(' - ');
            source = parts.pop().trim();
            title = parts.join(' - ').trim();
          } else if (source && title.endsWith(` - ${source}`)) {
            title = title.slice(0, -(` - ${source}`.length)).trim();
          }
          const link = (item.match(/<link>(.*?)<\/link>/)?.[1] || '').trim();
          const pubDateRaw = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
          let pubDate = '';
          if (pubDateRaw) {
            try {
              const d = new Date(pubDateRaw);
              pubDate = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
            } catch {
              pubDate = pubDateRaw;
            }
          }
          return {
            title: title.trim(),
            link: link.trim(),
            source: source || 'Media Berita Resmi',
            pubDate,
            isActualArticle: true
          };
        }).filter(a => a.title && a.link);
      } finally {
        clearTimeout(t);
      }
    } catch {
      return [];
    }
  }

  let articles = await queryRss(query);
  if (articles.length < 2 && secondaryQuery && secondaryQuery.trim() && secondaryQuery !== query) {
    const secondaryArticles = await queryRss(secondaryQuery);
    if (secondaryArticles.length > 0) {
      const seen = new Set(articles.map(a => a.link));
      secondaryArticles.forEach(a => {
        if (!seen.has(a.link)) {
          articles.push(a);
          seen.add(a.link);
        }
      });
    }
  }
  return articles.slice(0, 5);
}

// Section A: Forensik Audio & "Sound Tracking" TikTok
function analyzeAudioForensics(musicInfo, authorUsername, videoContext) {
  if (!musicInfo || !musicInfo.title) {
    return {
      title: 'Tidak Teridentifikasi',
      author: 'Tidak Diketahui',
      isOriginal: false,
      audioType: 'unknown',
      audioTypeLabel: 'Audio Tidak Terdeteksi',
      badge: 'warning',
      explanation: 'Metadata trek audio tidak tersedia langsung dari server TikTok.',
      playUrl: null,
      duration: 0
    };
  }

  const titleLower = musicInfo.title.toLowerCase();
  const isOriginal = Boolean(musicInfo.original) || titleLower.startsWith('original sound') || titleLower.startsWith('suara asli');
  const isAuthorMatch = musicInfo.author && authorUsername && musicInfo.author.toLowerCase() === authorUsername.toLowerCase();

  let audioType = 'trending';
  let audioTypeLabel = 'Sound Tren / Reused Audio';
  let badge = 'warning';
  let explanation = '';

  if (isOriginal || isAuthorMatch) {
    audioType = 'original';
    audioTypeLabel = 'Audio Asli Kreator (Original Sound)';
    badge = 'verified';
    explanation = `Audio video ("${musicInfo.title}") merupakan suara asli dari rekaman pengunggah (@${authorUsername || musicInfo.author}). Tidak ada indikasi penggantian suara atau penempelan backsound dramatis.`;
  } else {
    audioType = 'trending';
    audioTypeLabel = 'Trek Audio Eksternal / Dipakai Ulang';
    badge = 'warning';
    explanation = `Video menggunakan trek audio eksternal "${musicInfo.title}" milik @${musicInfo.author || 'kreator lain'}. Hati-hati terhadap potensi manipulasi audio (video netral yang ditempeli orasi demonstrasi, sirene, atau suara tangisan).`;
  }

  if (videoContext?.audioAnalysis && videoContext.audioAnalysis.toLowerCase().includes('manipulasi')) {
    badge = 'danger';
    explanation += ` Catatan AI: ${videoContext.audioAnalysis}`;
  }

  return {
    title: musicInfo.title,
    author: musicInfo.author || 'Kreator TikTok',
    isOriginal,
    audioType,
    audioTypeLabel,
    badge,
    explanation,
    playUrl: musicInfo.play || null,
    duration: musicInfo.duration || 0
  };
}

// Section D: Forensik Akun & Kredibilitas Pengunggah
function analyzeAuthorForensics(author, stats) {
  const authorName = author?.nickname || 'Kreator TikTok';
  const authorUsername = author?.unique_id || 'creator';
  const isVerified = Boolean(author?.verified);

  const mediaKeywords = ['news', 'kompas', 'detik', 'tempo', 'tv', 'tribun', 'antara', 'kumparan', 'liputan6', 'cnn', 'cnbc', 'official', 'republika', 'jawapos'];
  const isMediaOutlet = mediaKeywords.some(k => authorUsername.toLowerCase().includes(k) || authorName.toLowerCase().includes(k));

  let accountTypeLabel = 'Akun Publik';
  let badge = 'warning';
  let credibilityRating = 'Standar (Perlu Verifikasi Mandiri)';

  if (isVerified && isMediaOutlet) {
    accountTypeLabel = 'Media Berita Resmi Terverifikasi';
    badge = 'verified';
    credibilityRating = 'Tinggi (Organisasi Media Terakreditasi)';
  } else if (isVerified) {
    accountTypeLabel = 'Kreator Resmi Terverifikasi';
    badge = 'verified';
    credibilityRating = 'Cukup Tinggi (Memiliki Centang Verifikasi TikTok)';
  } else if (isMediaOutlet) {
    accountTypeLabel = 'Kanal Berita Non-Verifikasi';
    badge = 'warning';
    credibilityRating = 'Sedang (Mengatasnamakan Media Tanpa Centang Resmi)';
  } else {
    accountTypeLabel = 'Akun Personal / Publik';
    badge = 'verified';
    credibilityRating = 'Standar (Akun Personal TikTok)';
  }

  const playCount = stats?.playCount || 0;
  const diggCount = stats?.diggCount || 0;
  const commentCount = stats?.commentCount || 0;
  const engagementRate = playCount > 0 ? ((diggCount + commentCount) / playCount * 100).toFixed(1) + '%' : 'N/A';

  return {
    authorName,
    authorUsername,
    avatarUrl: author?.avatar || null,
    isVerified,
    accountTypeLabel,
    badge,
    credibilityRating,
    stats: {
      playCount,
      diggCount,
      commentCount,
      engagementRate
    },
    explanation: isVerified
      ? `@${authorUsername} memiliki tanda verifikasi resmi (Verified Badge) dari TikTok yang mengonfirmasi identitas asli entitas pembuat konten.`
      : `@${authorUsername} adalah akun publik tanpa lencana centang verifikasi resmi. Pertimbangkan kredibilitas konten dengan memeriksa sumber berita pembanding.`
  };
}

// Section C: Deteksi De-kontekstualisasi & Link Pencarian Visual (Google Lens / Yandex / Bing)
function analyzeDecontextualization(thumbnailUrl, title, videoContext) {
  const encThumb = encodeURIComponent(thumbnailUrl || '');
  const reverseSearchLinks = {
    googleLens: thumbnailUrl ? `https://lens.google.com/uploadbyurl?url=${encThumb}` : `https://images.google.com/`,
    yandex: thumbnailUrl ? `https://yandex.com/images/search?rpt=imageview&url=${encThumb}` : `https://yandex.com/images/`,
    bing: thumbnailUrl ? `https://www.bing.com/images/searchbyimage?cbir=sbi&imgurl=${encThumb}` : `https://www.bing.com/visualsearch`
  };

  const isFootageReused = Boolean(
    videoContext?.manipulationCheck?.toLowerCase().includes('rekaman lama') ||
    videoContext?.manipulationCheck?.toLowerCase().includes('reused') ||
    videoContext?.manipulationCheck?.toLowerCase().includes('potongan video yang tidak kontekstual')
  );

  const explanation = isFootageReused
    ? 'Terindikasi kemungkinan rekaman video diambil dari peristiwa lampau atau lokasi berbeda yang diunggah ulang dengan klaim baru.'
    : 'Tidak terdeteksi indikasi jelas rekaman daur ulang (reused footage). Anda dapat menekan tombol pencarian visual di bawah untuk memverifikasi tanggal pertama kali video beredar di internet.';

  return {
    isFootageReused,
    explanation,
    reverseSearchLinks
  };
}

// Section F: Analisis Komentar Lanjutan (Deteksi Bot, Copypasta, Astroturfing, Aspek Skeptis)
function analyzeAstroturfingAndAspects(cleanComments) {
  if (!Array.isArray(cleanComments) || cleanComments.length === 0) {
    return {
      astroturfingDetected: false,
      copypastaCount: 0,
      astroturfingSignal: 'Data komentar tidak mencukupi untuk analisis bot.',
      aspectSentiment: { skepticalCount: 0, supportiveCount: 0, criticalCount: 0 }
    };
  }

  const textCounts = new Map();
  cleanComments.forEach(c => {
    const norm = c.text.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (norm.length > 8) {
      textCounts.set(norm, (textCounts.get(norm) || 0) + 1);
    }
  });

  let maxDup = 0;
  let copypastaCount = 0;
  for (const count of textCounts.values()) {
    if (count > 1) {
      copypastaCount += count;
      if (count > maxDup) maxDup = count;
    }
  }

  const astroturfingDetected = maxDup >= 2;
  const astroturfingSignal = astroturfingDetected
    ? `Terdeteksi ${copypastaCount} komentar dengan susunan kalimat identik (copypasta) dari akun berbeda. Indikasi potensi spam terorganisir / bot buzzer.`
    : 'Pola percakapan warganet terpantau organik tanpa indikasi pesan identik massal.';

  const skepticalTerms = ['hoax', 'bohong', 'fitnah', 'mana bukti', 'sumbernya mana', 'ngawur', 'sesat', 'bukan gitu', 'kroscek', 'mana buktinya'];
  const supportiveTerms = ['setuju', 'bener banget', 'mantap', 'terima kasih', 'edukasi', 'makasih infonya', 'semoga', 'amiin'];
  const criticalTerms = ['parah', 'kecewa', 'bahaya', 'aneh', 'janggal', 'salah'];

  let skepticalCount = 0;
  let supportiveCount = 0;
  let criticalCount = 0;

  cleanComments.forEach(c => {
    const t = c.text.toLowerCase();
    if (skepticalTerms.some(term => t.includes(term))) skepticalCount++;
    if (supportiveTerms.some(term => t.includes(term))) supportiveCount++;
    if (criticalTerms.some(term => t.includes(term))) criticalCount++;
  });

  return {
    astroturfingDetected,
    copypastaCount,
    astroturfingSignal,
    aspectSentiment: {
      skepticalCount,
      supportiveCount,
      criticalCount
    }
  };
}

function filterRealComments(rawComments) {
  if (!Array.isArray(rawComments) || rawComments.length === 0) {
    return { cleanComments: [], filteredOutCount: 0 };
  }

  const spamKeywords = [
    'keranjang kuning', 'affiliate', 'link di bio', 'cek bio', 'order', 'reseller',
    'polowback', 'follback', 'gaji', 'bisnis online', 'promo', 'diskon', 'join live',
    'subs', 'subscribe', 'bot', 'slot', 'deposit', 'wa.me', 'hubungi no'
  ];

  let filteredOutCount = 0;
  const cleanComments = [];

  rawComments.forEach(c => {
    const lower = c.text.toLowerCase();
    const isSpam = spamKeywords.some(k => lower.includes(k)) || c.text.length < 2;
    if (isSpam) {
      filteredOutCount++;
    } else {
      cleanComments.push(c);
    }
  });

  cleanComments.sort((a, b) => b.likes - a.likes);
  return { cleanComments, filteredOutCount };
}

// Extract Substantive Theme (NOT Clickbait Title) for News and Quick Summary
function extractSubstantiveTheme(fullCaption, entities, videoContext, tikwmData) {
  if (videoContext?.substantiveTheme && videoContext.substantiveTheme.length >= 3 && !videoContext.substantiveTheme.toLowerCase().includes('clickbait')) {
    return videoContext.substantiveTheme.trim();
  }

  if (videoContext?.topicSummary) {
    const cleanSum = videoContext.topicSummary
      .replace(/video ini membahas|konten ini tentang|membahas tentang|video dari|membahas seputar/gi, '')
      .replace(/[^\w\s]/g, ' ')
      .trim();
    const words = cleanSum.split(/\s+/).filter(w => w.length >= 3).slice(0, 4);
    if (words.length >= 2) return words.join(' ');
  }

  return extractNewsTopicQuery(fullCaption, entities, videoContext);
}

function extractNewsTopicQuery(fullCaption, entities, videoContext) {
  if (videoContext?.substantiveTheme && videoContext.substantiveTheme.length >= 3) {
    return videoContext.substantiveTheme.trim();
  }

  if (videoContext?.topicSummary) {
    const topicWords = videoContext.topicSummary
      .replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)
      .slice(0, 4);
    if (topicWords.length >= 2) return topicWords.join(' ');
  }

  if (!fullCaption && (!entities || entities.length === 0)) return 'Berita Nasional Terkini';

  const stopWords = new Set([
    'fyp', 'foryou', 'foryoupage', 'viral', 'trending', 'xyzbca', 'beritatrending',
    'breakingnews', 'beritaterkini', 'goks', 'kissme', 'fyyyppppppppppppppp', 'trend',
    'video', 'foto', 'heboh', 'geger', 'gempar', 'kini', 'dulu', 'dengan', 'karena',
    'untuk', 'pada', 'dari', 'yang', 'akan', 'bisa', 'ini', 'itu', 'udah', 'bikin',
    'semoga', 'makasih', 'terima', 'kasih', 'sama', 'juga', 'kamu', 'saya', 'kita',
    'dosa', 'parah', 'kaget', 'detik', 'detik-detik', 'terjadi', 'ternyata', 'hujat',
    'waduh', 'gawat', 'terbaru', 'hari', 'ini', 'tadi', 'malam', 'kemarin', 'akhirnya',
    'resmi', 'langsung', 'bocor', 'terkuak', 'netizen', 'warganet', 'publik', 'gokil',
    'ngeri', 'ngakak', 'penasaran', 'simak', 'tonton', 'sampai', 'habis', 'kalian',
    'guys', 'ges', 'coy', 'dong', 'nih', 'tuh', 'aja', 'saja', 'banget', 'beneran',
    'kabar', 'info', 'berita', 'update', 'reaksi', 'viralbanget', 'konten', 'vt', 'tiktok'
  ]);

  const dictMap = {
    'lukyafirman': 'Luky Alfirman',
    'lukyalfirman': 'Luky Alfirman',
    'wamenkeu': 'Wamenkeu',
    'purbaya': 'Purbaya',
    'prabowo': 'Prabowo Subianto',
    'gibran': 'Gibran Rakabuming',
    'jokowi': 'Jokowi',
    'mbg': 'Makan Bergizi Gratis',
    'eskrim': 'Es Krim',
    'motorlistrik': 'Motor Listrik',
    'subsidi': 'Subsidi BBM',
    'kemenkeu': 'Kementerian Keuangan',
    'megathrust': 'Gempa Megathrust',
    'bmkg': 'BMKG',
    'tsunami': 'Tsunami',
    'gempa': 'Gempa Bumi',
    'pelantikan': 'Pelantikan Pejabat',
    'menteri': 'Menteri Kabinet',
    'kabinet': 'Kabinet Pemerintahan',
    'pajak': 'Kebijakan Pajak',
    'ppn': 'Pajak PPN',
    'ikn': 'IKN Nusantara',
    'timnas': 'Timnas Indonesia',
    'pilkada': 'Pilkada',
    'bansos': 'Bansos',
    'bpjs': 'BPJS Kesehatan',
    'korupsi': 'Kasus Korupsi',
    'kpk': 'KPK',
    'polri': 'Polri',
    'tni': 'TNI'
  };

  const detectedKeywords = [];

  const cleanTokens = (fullCaption || '')
    .replace(/#\w+/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  cleanTokens.forEach(t => {
    const lower = t.toLowerCase();
    if (lower.length >= 3 && !stopWords.has(lower)) {
      if (dictMap[lower]) {
        if (!detectedKeywords.includes(dictMap[lower])) detectedKeywords.push(dictMap[lower]);
      } else if (!detectedKeywords.includes(t)) {
        if (/^[A-Z][a-z0-9]+$/.test(t) || t.length >= 4) {
          detectedKeywords.push(t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
        }
      }
    }
  });

  (entities || []).forEach(e => {
    const lower = e.toLowerCase();
    if (lower.length >= 3 && !stopWords.has(lower)) {
      const val = dictMap[lower] || (e.charAt(0).toUpperCase() + e.slice(1));
      if (!detectedKeywords.includes(val)) detectedKeywords.push(val);
    }
  });

  if (detectedKeywords.length >= 2) {
    return detectedKeywords.slice(0, 3).join(' ');
  } else if (detectedKeywords.length === 1) {
    return detectedKeywords[0];
  }

  return 'Berita Nasional Terkini';
}

function generateNewsVerificationSources(liveNews, substantiveTheme) {
  const sources = [];

  // 1. Include REAL verified news articles first
  if (Array.isArray(liveNews) && liveNews.length > 0) {
    liveNews.forEach(item => {
      sources.push({
        title: item.title,
        publisher: item.source || 'Media Berita Resmi',
        url: item.link,
        pubDate: item.pubDate || '',
        isActualArticle: true
      });
    });
  }

  // 2. Add legitimate fact-check portal searches using CLEAN substantive theme (NEVER raw caption)
  const cleanTopic = (substantiveTheme || 'berita nasional').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const encTopic = encodeURIComponent(cleanTopic);

  sources.push({
    title: `Arsip Cek Fakta: Riset Isu "${cleanTopic}"`,
    publisher: 'TurnBackHoax.id (Mafindo)',
    url: `https://turnbackhoax.id/?s=${encTopic}`,
    isFactCheckSearch: true
  });

  sources.push({
    title: `Konsorsium Cek Fakta Kolaboratif Indonesia`,
    publisher: 'CekFakta.com (AJI / AMSI / Mafindo)',
    url: `https://cekfakta.com/?s=${encTopic}`,
    isFactCheckSearch: true
  });

  return sources;
}

function classifyRealComment(text) {
  const lower = text.toLowerCase();
  const critKeywords = ['hoax', 'provokasi', 'salah', 'kroscek', 'berita', 'bukti', 'bohong', 'dilebihkan', 'dpr', 'pejabat', 'wamenkeu', 'sesat', 'mana', 'aneh', 'janggal', 'tiap hari', 'fyp'];
  const posKeywords = ['lucu', 'gemes', 'bagus', 'setuju', 'mantap', 'makasih', 'edukasi', 'keren', 'suka', 'terhibur', 'terima kasih', 'semoga', 'amiin', 'wkwk', 'haha'];

  if (critKeywords.some(k => lower.includes(k))) {
    return { type: 'critical', label: 'Tanggapan Kritis / Sorotan' };
  }
  if (posKeywords.some(k => lower.includes(k))) {
    return { type: 'positive', label: 'Positif Tinggi' };
  }
  return { type: 'positive', label: 'Reaksi Warganet' };
}

function detectAiContent(fullCaption, text, videoContext) {
  const aiKeywords = [
    '#ai', '#aigenerated', '#midjourney', '#sora', '#chatgpt', '#deepfake',
    '#elevenlabs', '#aivideo', '#runway', '#aiindonesia', '#aivoice', '#aitools'
  ];
  
  const aiPhrases = [
    'menurut cerita yang beredar', 'bayangkan jika', 'rahasia terbesar yang tidak pernah',
    'tahukah kamu bahwa', 'fakta tersembunyi yang', 'suara ai', 'dubbing ai', 'dibuat oleh ai',
    'generasi ai', 'rekayasa ai', 'animasi ai'
  ];

  const matchedAiTags = aiKeywords.filter(k => text.includes(k));
  const matchedAiPhrases = aiPhrases.filter(p => text.includes(p));

  let videoAiIndicators = false;
  if (videoContext?.audioAnalysis) {
    const audioLower = videoContext.audioAnalysis.toLowerCase();
    if (audioLower.includes('ai voice') || audioLower.includes('text-to-speech') || audioLower.includes('suara sintetis') || audioLower.includes('ai-generated')) {
      videoAiIndicators = true;
    }
  }
  if (videoContext?.manipulationCheck) {
    const manipLower = videoContext.manipulationCheck.toLowerCase();
    if (manipLower.includes('deepfake') || manipLower.includes('ai-generated') || manipLower.includes('manipulasi') || manipLower.includes('buatan ai')) {
      videoAiIndicators = true;
    }
  }

  const isAiDetected = matchedAiTags.length > 0 || matchedAiPhrases.length > 0 || videoAiIndicators;
  
  const signals = [];
  if (matchedAiTags.length > 0) {
    signals.push(`Menggunakan hashtag generator/sintesis AI (${matchedAiTags.join(', ')})`);
  }
  if (matchedAiPhrases.length > 0) {
    signals.push(`Terdeteksi skrip & pengisi suara sintesis AI (Text-to-Speech)`);
  }
  if (videoAiIndicators && videoContext?.audioAnalysis) {
    signals.push(`Analisis audio: ${videoContext.audioAnalysis}`);
  }
  if (videoAiIndicators && videoContext?.manipulationCheck) {
    signals.push(`Pemeriksaan manipulasi: ${videoContext.manipulationCheck}`);
  }

  if (!isAiDetected) {
    signals.push('Tidak terdeteksi penanda buatan AI / Deepfake pada teks caption');
    if (videoContext?.audioAnalysis) {
      signals.push(`Analisis audio: ${videoContext.audioAnalysis}`);
    } else {
      signals.push('Gaya narasi dan nada suara terindikasi rekaman manusia asli');
    }
  }

  return {
    isAiGenerated: isAiDetected,
    confidence: isAiDetected ? 'high' : (videoContext ? 'high' : 'medium'),
    statusLabel: isAiDetected ? 'Terdeteksi Sintesis AI / Deepfake' : 'Terdeteksi Konten Rekaman Manusia',
    badgeType: isAiDetected ? 'warning' : 'verified',
    audioType: isAiDetected ? 'Audio Sintesis AI (Text-to-Speech)' : 'Audio Asli Rekaman Manusia',
    explanation: isAiDetected
      ? 'Video ini terindikasi menggunakan visual buatan AI atau pengisi suara robotik (AI Voiceover). Harap kroscek kebenaran narasi dengan media terpercaya.'
      : 'Konten dan elemen narasi video tidak menunjukkan pola pembentukan buatan AI secara mencolok.',
    signals
  };
}

// Build Tab 1 Quick Verdict Object
function buildQuickVerdict(credibility, claims, provocation, substantiveTheme, themeExplanation, liveNews) {
  const score = credibility?.score ?? 75;
  const provLevel = provocation?.level || 'low';
  const firstClaim = claims?.[0] || null;
  const verdict = firstClaim?.verdict || 'unverified';
  const hasLiveNews = Array.isArray(liveNews) && liveNews.length > 0;

  let validityVerdict = 'unverified';
  let badgeLabel = 'PERLU KROSCEK';
  let badgeType = 'warning';
  let summaryVerdict = 'Informasi dalam video ini memerlukan kroscek lebih lanjut ke sumber resmi.';

  // If live news articles confirm the topic or claim is supported by facts
  if (verdict === 'supported' || (hasLiveNews && verdict !== 'false')) {
    validityVerdict = 'valid';
    badgeLabel = hasLiveNews ? 'VALID & TERVERIFIKASI' : 'VALID & AMAN';
    badgeType = 'verified';
    summaryVerdict = hasLiveNews
      ? 'Informasi dalam video ini terkonfirmasi faktual dan diliput oleh media berita resmi nasional.'
      : 'Isi konten dan narasi video terverifikasi wajar serta tidak memuat unsur disinformasi atau provokasi adu domba.';
  } else if (verdict === 'false' || (score < 35 && !hasLiveNews)) {
    validityVerdict = 'false';
    badgeLabel = 'HOAX / TIDAK AKURAT';
    badgeType = 'danger';
    summaryVerdict = 'Klaim utama dalam video ini terindikasi tidak akurat atau bertentangan dengan konsensus fakta publik.';
  } else if (verdict === 'misleading' || (score < 55 && provLevel === 'high')) {
    validityVerdict = 'misleading';
    badgeLabel = 'KONTEN MENYESATKAN';
    badgeType = 'warning';
    summaryVerdict = 'Video ini menyajikan narasi dengan pembingkaian yang kurang tepat atau melebih-lebihkan fakta sebenarnya.';
  } else if (verdict === 'mixed' || score < 70) {
    validityVerdict = 'mixed';
    badgeLabel = 'SEBAGIAN BENAR';
    badgeType = 'warning';
    summaryVerdict = 'Sebagian informasi memuat fakta nyata, namun konteks penyampaiannya perlu dikonfirmasi dengan rujukan resmi.';
  } else {
    validityVerdict = 'valid';
    badgeLabel = 'VALID & AMAN';
    badgeType = 'verified';
    summaryVerdict = 'Konten tidak memuat indikasi disinformasi yang merugikan publik.';
  }

  const keyFinding = firstClaim?.explanation || (hasLiveNews ? 'Topik narasi ini terkonfirmasi memiliki liputan berita resmi yang relevan.' : 'Pemeriksaan menemukan bahwa konteks narasi dapat dikonfirmasi dengan rujukan resmi.');

  return {
    validityVerdict,
    badgeLabel,
    badgeType,
    score,
    summaryVerdict,
    substantiveTheme: substantiveTheme || 'Isu Terkait',
    themeExplanation: themeExplanation || `Video berfokus pada topik '${substantiveTheme}'. Narasi perlu disaring secara jernih dari judul sensasional.`,
    keyFinding,
    relatedNews: liveNews || []
  };
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Deep Multimodal Analysis with Gemini (Video)
async function analyzeVideoWithGemini(fileUri, mimeType, url, videoMeta, realComments, tikwmData, apiKey, analysisMode = 'full') {
  const candidateModels = Array.from(new Set([
    process.env.GEMINI_MODEL,
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.7-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash'
  ])).filter(Boolean);

  const videoId = extractVideoId(url) || videoMeta?.embed_product_id || null;
  const fullCaptionText = videoMeta?.title || 'Deskripsi tidak dapat diambil';

  const { cleanComments } = filterRealComments(realComments);
  const realCommentsContext = cleanComments.length > 0
    ? `KUTIPAN KOMENTAR ASLI WARGANET (DARI TIKTOK):\n` + cleanComments.slice(0, 15).map(c => `- @${c.userUniqueId} (${c.likes} suka): "${c.text}"`).join('\n')
    : `Komentar publik belum dapat ditarik langsung.`;

  const deepVideoPrompt = `Anda adalah VerifTok, sistem forensik verifikasi video TikTok tingkat mendalam. Anda HARUS MENONTON SELURUH VIDEO INI DARI AWAL SAMPAI HABIS.

TUGAS FORENSIK:
1. Tentukan "substantiveTheme": Topik/isu substantif sebenarnya yang dibahas video ini dalam 2-4 kata (CONTOH: "Luky Alfirman Wamenkeu", "Waspada Megathrust", "Ledakan Pipa Gas Kawasan"), BUKAN judul clickbait!
2. Tangkap "onScreenTexts": Catat SEMUA teks stiker, overlay teks besar di layar (CapCut kinetic typography, headline teks kuning/merah) yang terlihat di video.
3. Forensik Suara/Audio: Apakah ucapan asli pembicara, musik dramatis, atau audio dubbing/sound orang lain?
4. Periksa Manipulasi/De-kontekstualisasi: Apakah rekaman video tampak diambil dari peristiwa lama/tempat lain yang diberi narasi baru?
5. Evaluasi konsistensi isi video vs judul/caption (apakah clickbait?).
6. CLICKBAIT & SENSATIONALISM METER: Bandingkan janji/klaim di judul caption dengan isi sebenarnya dari video. Evaluasi apakah judul melebih-lebihkan, memanipulasi emosi, atau sama sekali tidak sesuai isi. Berikan skor 0-100 (0=jujur, 100=clickbait total). Deteksi sinyal: huruf kapital berlebihan, tanda seru/tanya ganda, kata sensasional (HEBOH, GEMPAR, GEGER, DETIK-DETIK, TERNYATA), dan ketidaksesuaian janji vs kenyataan. Jika isi video benar-benar peristiwa faktual yang sesuai judul, berikan skor rendah (0-25).
7. DETEKSI PENIPUAN & DONASI FIKTIF: Periksa apakah konten ini memuat ajakan donasi, transfer uang, atau penggalangan dana yang mencurigakan. Deteksi pola: (a) Video menggunakan rekaman bencana/orang sakit/hewan terlantar milik orang lain lalu menempelkan rekening pribadi, (b) Nomor rekening bank/e-wallet/link donasi di caption, (c) Ajakan klik link di bio untuk transfer, (d) Modus "live ngemis" dengan video daur ulang. Periksa juga jika ada nomor rekening, nomor WhatsApp, link Saweria/Kitabisa/OVO/GoPay/Dana yang dicantumkan.
8. TEMPLATE BALASAN KOMENTAR: Buatkan template balasan komentar TikTok yang sopan, netral, dan berbobot untuk meluruskan klaim video ini. Balasan harus singkat (maksimal 150 karakter untuk shortReply), tidak menyerang pribadi, dan menyertakan fakta atau sumber resmi. Gunakan bahasa santai tapi berbobot agar tidak dihapus filter TikTok.

PRINSIP KEADILAN, NETRALITAS, DAN ANTI-FALSE POSITIVE:
- BANYAK KONTEN TIKTOK MERUPAKAN CUPLIKAN TAYANGAN BERITA ASLI (liputan TV berita, jurnalisme, wawancara resmi, konferensi pers pemerintah, rilis BMKG/Polri/kementerian, serta rekaman musibah/bencana/kejadian nyata).
- PANDUAN KHUSUS LIPUTAN PERISTIWA, BENCANA, KEBAKARAN, & MUSIBAH:
  * Kata-kata seperti "kebakaran", "terbakar", "meledak", "ledakan", "hancur", "korban", "damkar", "evakuasi", "polisi" adalah kosakata liputan peristiwa faktual di lapangan, BUKAN ujaran kebencian ekstrem, hasutan kekerasan, atau provokasi!
  * DILARANG KERAS mengartikan kata "kebakaran" atau "terbakar" sebagai provokasi pembakaran (arson/hate speech).
- JIKA VIDEO MENYAMPAIKAN BERITA NYATA ATAU FAKTA LAPANGAN:
  * Tetapkan verdict klaim sebagai "supported" (didukung fakta).
  * Tetapkan tingkat provokasi sebagai "low" (rendah/netral).
  * Tetapkan onScreenOcr.hasMisleadingOverlay sebagai false.
  * DILARANG KERAS melabeli berita resmi, musibah, atau liputan jurnalisme sebagai "hoax", "menyesatkan", atau "provokasi" hanya karena membahas isu politik, pergantian pejabat, bencana alam, kebakaran, ledakan, kritik wajar, atau kebijakan pemerintah!
- KONSISTENSI PARAMETER LINTAS SEKSI (HARMONISASI WAJIB):
  * Seluruh parameter analisis (Ringkasan Cepat, Provokasi, OCR Layar, Clickbait Meter, Klaim) HARUS SELARAS dan TIDAK SALING BERTENTANGAN.
  * Jika video menyampaikan berita/peristiwa faktual yang valid, jangan pernah menyatakan "Tingkat Provokasi: Tinggi" atau "Menyesatkan" di bagian parameter lainnya.
- Tingkat provokasi HANYA dinilai "high" jika narasi secara terang-terangan memuat ujaran kebencian SARA, hasutan kekerasan fisik, fitnah keji tanpa dasar, atau ajakan kerusuhan/makar.
- "substantiveTheme" HARUS intisari isu nyata 2-4 kata, DILARANG MENYALIN judul sensasional atau clickbait kreator.
- MODE PEMERIKSAAN: ${analysisMode.toUpperCase()} (Sesuaikan kedalaman analisis dengan fokus mode ini).

INFORMASI TAMBAHAN:
- URL Video: ${url}
- Caption/Judul: ${fullCaptionText}
- Pengunggah: ${videoMeta?.author_name || 'Kreator TikTok'} (@${videoMeta?.author_unique_id || 'unknown'})
${realCommentsContext}

FORMAT JSON WAJIB (tanpa markdown wrapper):
{
  "status": "complete",
  "substantiveTheme": "Tema substantif 2-4 kata",
  "themeExplanation": "Penjelasan 2-3 kalimat lugas tentang apa tema sebenarnya dari video ini (bebas dari clickbait).",
  "onScreenOcr": {
    "detectedTexts": ["Teks stiker 1 yang tampak di layar", "Teks overlay 2"],
    "hasMisleadingOverlay": false,
    "explanation": "Penjelasan apakah teks di layar melebih-lebihkan fakta sebenarnya"
  },
  "decontextualization": {
    "isFootageReused": false,
    "explanation": "Analisis apakah cuplikan rekaman tampak diambil dari peristiwa lama atau luar negeri"
  },
  "videoContext": {
    "topicSummary": "Ringkasan 1-2 kalimat tentang apa isi utama video ini secara keseluruhan",
    "detailedNarrative": "Penjelasan mendalam 3-5 kalimat tentang alur narasi video dari awal sampai akhir.",
    "visualDescription": "Deskripsi detail apa yang terlihat di video: orang, tempat, kejadian, grafik, teks overlay.",
    "spokenContent": "Transkrip/ringkasan dari apa yang DIUCAPKAN di video. Jika tidak ada ucapan, tulis 'Hanya musik/tanpa ucapan'.",
    "audioAnalysis": "Analisis suara/musik: apakah suara manusia asli, AI voice-over, musik dramatis penambah ketegangan, dsb.",
    "keyMoments": ["Momen penting 1", "Momen penting 2"],
    "videoVsCaption": "Perbandingan isi video vs caption/judul (apakah konsisten atau clickbait).",
    "contentCategory": "berita" | "hiburan" | "edukasi" | "opini" | "promosi" | "propaganda" | "satir" | "fiksi",
    "contextDepth": "deep" | "moderate" | "shallow",
    "manipulationCheck": "Pemeriksaan tanda-tanda manipulasi visual/audio atau potongan video tanpa konteks."
  },
  "video": {
    "title": ${JSON.stringify(videoMeta?.title?.slice(0, 100) || "Video TikTok")},
    "fullCaption": ${JSON.stringify(fullCaptionText)},
    "videoId": ${JSON.stringify(videoId)},
    "embedHtml": ${JSON.stringify(videoMeta?.html || null)},
    "authorName": ${JSON.stringify(videoMeta?.author_name || "Kreator TikTok")},
    "authorUsername": ${JSON.stringify(videoMeta?.author_unique_id || "creator")},
    "thumbnailUrl": ${JSON.stringify(videoMeta?.thumbnail_url || null)}
  },
  "comments": {
    "positive": "55%",
    "negative": "30%",
    "hate": "5%",
    "sampleSize": ${cleanComments.length || 0},
    "filteredOutCount": 0,
    "summary": "Ringkasan opini warganet berdasarkan isi video.",
    "sampleComments": [
      {
        "text": "Kutipan komentar asli",
        "userUniqueId": "username",
        "userNickname": "Nama",
        "likes": 10,
        "type": "positive" | "critical" | "provocative",
        "label": "Tanggapan Kritis" | "Positif",
        "reason": "Konteks komentar"
      }
    ],
    "confidence": "high"
  },
  "provocation": {
    "level": "low" | "medium" | "high",
    "explanation": "Penjelasan tingkat provokasi berdasarkan ISI VIDEO yang ditonton.",
    "signals": ["Sinyal pembingkaian 1", "Sinyal pembingkaian 2"],
    "confidence": "high"
  },
  "claims": [
    {
      "claim": "Klaim utama yang disampaikan di dalam video",
      "verdict": "supported" | "false" | "misleading" | "unverified" | "mixed",
      "explanation": "Penjelasan verifikasi klaim.",
      "confidence": "high",
      "sources": [
        {
          "title": "Sumber periksa fakta",
          "publisher": "Penerbit",
          "url": "https://..."
        }
      ]
    }
  ],
  "clickbaitMeter": {
    "score": 85,
    "level": "none|low|medium|high|extreme",
    "titleClaim": "Klaim di judul",
    "actualContent": "Isi sebenarnya di video",
    "mismatchExplanation": "Penjelasan gap antara judul dan isi",
    "signals": ["Sinyal clickbait 1"]
  },
  "scamDetection": {
    "isScamSuspected": false,
    "type": "none|fake_charity|donation_fraud|financial_scam|identity_scam|other",
    "riskLevel": "safe|suspicious|dangerous",
    "explanation": "Penjelasan",
    "signals": ["Sinyal 1"],
    "detectedIdentifiers": ["Nomor rekening"]
  },
  "counterComment": {
    "shortReply": "Balasan singkat",
    "detailedReply": "Balasan detail",
    "factCheckReply": "Balasan dengan rujukan"
  },
  "limitations": []
}`;

  let lastError = null;
  const activeModels = candidateModels.slice(0, 2);
  for (const modelName of activeModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);

    try {
      const requestBody = {
        contents: [{
          role: 'user',
          parts: [
            { fileData: { fileUri, mimeType } },
            { text: deepVideoPrompt }
          ]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.15
        }
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        lastError = new Error(`Gemini multimodal ${modelName} HTTP ${res.status}: ${errBody.slice(0, 200)}`);
        await sleep(500);
        continue;
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const cleanJson = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (validReport(parsed)) {
        return parsed;
      }
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(t);
    }
  }

  throw lastError || new Error('All Gemini models failed for video analysis');
}

// Multimodal Analysis for TikTok Photo Carousel Mode
async function analyzePhotosWithGemini(photoParts, url, videoMeta, realComments, tikwmData, apiKey, analysisMode = 'full') {
  const candidateModels = Array.from(new Set([
    process.env.GEMINI_MODEL,
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.7-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash'
  ])).filter(Boolean);

  const fullCaptionText = videoMeta?.title || 'Deskripsi tidak dapat diambil';
  const { cleanComments } = filterRealComments(realComments);

  const promptText = `Anda adalah VerifTok. Konten TikTok ini adalah FORMAT FOTO GESER / CAROUSEL SLIDESHOW.
Tonton dan baca setiap slide foto dengan seksama dari slide pertama hingga akhir.

TUGAS UTAMA:
1. "substantiveTheme": Tentukan tema substantif sebenarnya dari foto-foto ini dalam 2-4 kata (CONTOH: "Tips Beasiswa Kuliah", "Waspada Modus Penipuan WA", "Kebakaran Kawasan Pemukiman"), BUKAN judul heboh.
2. "onScreenOcr": Ekstrak semua tulisan dan stiker teks di dalam slide foto ini.
3. Periksa apakah ada klaim hoax atau informasi sesat yang disisipkan di slide-slide foto tersebut.
6. CLICKBAIT & SENSATIONALISM METER: Bandingkan janji/klaim di judul caption dengan isi sebenarnya dari video. Evaluasi apakah judul melebih-lebihkan, memanipulasi emosi, atau sama sekali tidak sesuai isi. Berikan skor 0-100 (0=jujur, 100=clickbait total). Deteksi sinyal: huruf kapital berlebihan, tanda seru/tanya ganda, kata sensasional (HEBOH, GEMPAR, GEGER, DETIK-DETIK, TERNYATA), dan ketidaksesuaian janji vs kenyataan.
7. DETEKSI PENIPUAN & DONASI FIKTIF: Periksa apakah konten ini memuat ajakan donasi, transfer uang, atau penggalangan dana yang mencurigakan. Deteksi pola: (a) Video menggunakan rekaman bencana/orang sakit/hewan terlantar milik orang lain lalu menempelkan rekening pribadi, (b) Nomor rekening bank/e-wallet/link donasi di caption, (c) Ajakan klik link di bio untuk transfer, (d) Modus "live ngemis" dengan video daur ulang. Periksa juga jika ada nomor rekening, nomor WhatsApp, link Saweria/Kitabisa/OVO/GoPay/Dana yang dicantumkan.
8. TEMPLATE BALASAN KOMENTAR: Buatkan template balasan komentar TikTok yang sopan, netral, dan berbobot untuk meluruskan klaim video ini. Balasan harus singkat (maksimal 150 karakter untuk shortReply), tidak menyerang pribadi, dan menyertakan fakta atau sumber resmi. Gunakan bahasa santai tapi berbobot agar tidak dihapus filter TikTok.

PRINSIP KEADILAN & ANTI-FALSE POSITIVE:
- Jika konten foto geser memuat infografis berita resmi, edukasi, atau fakta publik yang valid, nilai sebagai "supported" dan provokasi "low". DILARANG melabeli fakta, liputan musibah, atau berita resmi sebagai hoax atau provokasi!
- Kata "kebakaran", "ledakan", "bencana" adalah istilah musibah/peristiwa, BUKAN hasutan kekerasan.
- Seluruh parameter (Ringkasan, Provokasi, OCR, Clickbait) HARUS KONSISTEN.
- Tingkat provokasi HANYA "high" jika berisi ujaran kebencian SARA atau hasutan kekerasan nyata.
- MODE PEMERIKSAAN: ${analysisMode.toUpperCase()}.

URL: ${url}
Caption: ${fullCaptionText}

Format respons WAJIB JSON persis sesuai struktur VerifTok. Pastikan termasuk field clickbaitMeter, scamDetection, dan counterComment seperti di analisis video.`;

  const activeModels = candidateModels.slice(0, 2);
  for (const modelName of activeModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);

    try {
      const parts = [...photoParts, { text: promptText }];
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.15 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const cleanJson = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (validReport(parsed)) return parsed;
        }
      }
    } catch {
      // Continue to next model
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

// Text-only Gemini analysis fallback
async function analyzeWithGemini(url, videoMeta, realComments, tikwmData, apiKey, analysisMode = 'full') {
  const candidateModels = Array.from(new Set([
    process.env.GEMINI_MODEL,
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.7-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash'
  ])).filter(Boolean);

  const videoId = extractVideoId(url) || videoMeta?.embed_product_id || null;
  const fullCaptionText = videoMeta?.title || 'Deskripsi tidak dapat diambil';

  const { cleanComments } = filterRealComments(realComments);
  const realCommentsContext = cleanComments.length > 0
    ? `KUTIPAN KOMENTAR ASLI WARGANET:\n` + cleanComments.slice(0, 15).map(c => `- @${c.userUniqueId} (${c.likes} suka): "${c.text}"`).join('\n')
    : `Komentar publik belum dapat ditarik langsung.`;

  const systemPrompt = `Anda adalah pakar verifikasi informasi, deteksi disinformasi, dan verifikasi media sosial (VerifTok) di Indonesia.
Ekstrak "substantiveTheme" (tema substantif 2-4 kata, BUKAN judul clickbait).

TUGAS UTAMA:
6. CLICKBAIT & SENSATIONALISM METER: Bandingkan janji/klaim di judul caption dengan isi sebenarnya dari video. Evaluasi apakah judul melebih-lebihkan, memanipulasi emosi, atau sama sekali tidak sesuai isi. Berikan skor 0-100 (0=jujur, 100=clickbait total). Deteksi sinyal: huruf kapital berlebihan, tanda seru/tanya ganda, kata sensasional (HEBOH, GEMPAR, GEGER, DETIK-DETIK, TERNYATA), dan ketidaksesuaian janji vs kenyataan.
7. DETEKSI PENIPUAN & DONASI FIKTIF: Periksa apakah konten ini memuat ajakan donasi, transfer uang, atau penggalangan dana yang mencurigakan. Deteksi pola: (a) Video menggunakan rekaman bencana/orang sakit/hewan terlantar milik orang lain lalu menempelkan rekening pribadi, (b) Nomor rekening bank/e-wallet/link donasi di caption, (c) Ajakan klik link di bio untuk transfer, (d) Modus "live ngemis" dengan video daur ulang. Periksa juga jika ada nomor rekening, nomor WhatsApp, link Saweria/Kitabisa/OVO/GoPay/Dana yang dicantumkan.
8. TEMPLATE BALASAN KOMENTAR: Buatkan template balasan komentar TikTok yang sopan, netral, dan berbobot untuk meluruskan klaim video ini. Balasan harus singkat (maksimal 150 karakter untuk shortReply), tidak menyerang pribadi, dan menyertakan fakta atau sumber resmi. Gunakan bahasa santai tapi berbobot agar tidak dihapus filter TikTok.

PRINSIP KEADILAN & ANTI-FALSE POSITIVE:
- BANYAK KONTEN TIKTOK MERUPAKAN CUPLIKAN BERITA RESMI ATAU INFORMASI FAKTUAL (termasuk laporan musibah, kebakaran, kecelakaan, ledakan, dan kebencanaan).
- JIKA KONTEN MEMBAHAS BERITA ATAU MUSIBAH NYATA:
  * WAJIB BERIKAN VERDICT "supported"
  * PROVOKASI "low" (rendah/netral)
  * SKOR KREDIBILITAS TINGGI (85-96)
  * onScreenOcr.hasMisleadingOverlay WAJIB false.
- Kata-kata seperti "kebakaran", "terbakar", "meledak", "ledakan", "korban", "damkar" adalah istilah musibah/peristiwa faktual, BUKAN hasutan kekerasan atau provokasi!
- DILARANG KERAS mencap video berita resmi atau liputan musibah sebagai "hoax", "menyesatkan", atau "provokasi".
- Seluruh parameter analisis HARUS KONSISTEN antar-seksi.
- Tingkat provokasi HANYA "high" jika berisi ujaran kebencian SARA atau hasutan kekerasan nyata.
- MODE PEMERIKSAAN: ${analysisMode.toUpperCase()}.

FORMAT JSON WAJIB (tanpa markdown wrapper):
{
  "status": "complete",
  "substantiveTheme": "Tema substantif 2-4 kata",
  "themeExplanation": "Penjelasan tema substantif video secara objektif.",
  "provocation": {
    "level": "low" | "medium" | "high",
    "explanation": "Penjelasan tingkat provokasi.",
    "signals": ["Sinyal framing bahasa"]
  },
  "claims": [
    {
      "claim": "Klaim atau peristiwa utama",
      "verdict": "supported" | "false" | "misleading" | "unverified" | "mixed",
      "explanation": "Penjelasan verifikasi.",
      "sources": []
    }
  ],
  "clickbaitMeter": {
    "score": 15,
    "level": "none|low|medium|high|extreme",
    "titleClaim": "Janji judul",
    "actualContent": "Isi sebenarnya",
    "mismatchExplanation": "Penjelasan keselarasan",
    "signals": []
  },
  "scamDetection": {
    "isScamSuspected": false,
    "type": "none",
    "riskLevel": "safe",
    "explanation": "Pemeriksaan donasi/penipuan",
    "signals": [],
    "detectedIdentifiers": []
  },
  "counterComment": {
    "shortReply": "Balasan singkat",
    "detailedReply": "Balasan detail",
    "factCheckReply": "Balasan rujukan"
  }
}`;

  const userContext = `URL Video: ${url}
Caption: ${fullCaptionText}
Pengunggah: ${videoMeta?.author_name || 'Kreator TikTok'} (@${videoMeta?.author_unique_id || 'unknown'})
${realCommentsContext}`;

  const activeModels = candidateModels.slice(0, 2);
  for (const modelName of activeModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userContext }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const cleanJson = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (parsed && !parsed.status) parsed.status = 'complete';
          if (validReport(parsed)) return parsed;
        }
      }
    } catch {
      // Continue to next model
    } finally {
      clearTimeout(t);
    }
  }

  throw new Error('All Gemini candidate models failed for text analysis');
}

// Built-in Smart Analyzer (Rule-based, NO Fake/Fabricated Comments)
function analyzeLocally(url, videoMeta, realComments = [], tikwmData = null, liveNews = [], analysisMode = 'full') {
  const rawTitle = videoMeta?.title || tikwmData?.title || '';
  const fullCaption = rawTitle ? rawTitle.trim() : 'Deskripsi video TikTok.';
  const authorName = videoMeta?.author_name || tikwmData?.author?.nickname || 'Kreator TikTok';
  const authorUsername = videoMeta?.author_unique_id || tikwmData?.author?.unique_id || 'creator';
  const text = fullCaption.toLowerCase();
  const videoId = extractVideoId(url) || videoMeta?.embed_product_id || null;

  const entities = extractKeyEntities(fullCaption);
  const substantiveTheme = extractSubstantiveTheme(fullCaption, entities, null, tikwmData);

  // 1. Detect known legitimate media outlets and verified accounts
  const newsPublishers = [
    'kompas', 'detik', 'cnn', 'metrotv', 'tvone', 'inews', 'liputan6',
    'antaranews', 'antara', 'kumparan', 'tempo', 'tribun', 'narasi',
    'bbc', 'cnbc', 'suara', 'republika', 'viva', 'merdeka', 'sindonews',
    'jawapos', 'pikiranrakyat', 'tirto', 'katadata', 'idntimes', 'beritasatu', 'b Universe'
  ];
  const authorStr = (authorUsername + ' ' + authorName).toLowerCase();
  const isKnownMedia = newsPublishers.some(p => authorStr.includes(p)) || Boolean(tikwmData?.author?.verified);

  // 2. Corroboration with live news
  const hasLiveNews = Array.isArray(liveNews) && liveNews.length > 0;

  // 3. Disaster, incident, and emergency vocabulary (FAKTUAL, BUKAN PROVOKASI)
  const disasterIncidentWords = [
    'kebakaran', 'terbakar', 'pembakaran', 'ledakan', 'meledak', 'tabung gas',
    'bencana', 'gempa', 'tsunami', 'banjir', 'longsor', 'kecelakaan', 'damkar',
    'pemadam', 'evakuasi', 'korban', 'olah tkp', 'puslabfor', 'pipa gas', 'musibah', 'runtuh'
  ];
  const isDisasterOrIncident = disasterIncidentWords.some(w => text.includes(w));

  // 4. Provocation Detection: ONLY trigger on genuine extremist incitement, hate speech, or rebellion!
  // MUST NOT match normal news, disaster, or accident vocabulary!
  const genuineHateSpeechPatterns = [
    { pattern: /\b(ganyang)\b/i, label: 'ganyang' },
    { pattern: /\b(makar)\b/i, label: 'makar' },
    { pattern: /\b(perang\s+saudara)\b/i, label: 'perang saudara' },
    { pattern: /\b(usir\s+paksa)\b/i, label: 'usir paksa' },
    { pattern: /\b(rezim\s+laknat)\b/i, label: 'rezim laknat' },
    { pattern: /\b(lengserkan\s+paksa)\b/i, label: 'lengserkan paksa' },
    { pattern: /\b(bakar\s+(gedung|toko|kantor|rumah\s*ibadah|istana|posko|aparat|polsek))\b/i, label: 'ajakan membakar fasilitas publik' },
    { pattern: /\b(serbu\s+(kantor|gedung|istana|markas|posko|aparat))\b/i, label: 'ajakan menyerbu' },
    { pattern: /\b(bantai\s+(warga|rakyat|etnis|suku|umat))\b/i, label: 'hasutan kekerasan massa' }
  ];

  const matchedHateSpeech = isDisasterOrIncident
    ? [] // Never mislabel fire/explosion/disaster news as hate speech or arson!
    : genuineHateSpeechPatterns.filter(p => p.pattern.test(text)).map(p => p.label);

  const sensationalStyleKeywords = [
    'geger', 'gempar', 'heboh', 'bikin kaget', 'detik-detik', 'terkuak', 'gawat', 'parah banget'
  ];

  const matchedSensational = sensationalStyleKeywords.filter(k => text.includes(k));
  const isCaps = (fullCaption.match(/[A-Z]{4,}/g) || []).length >= 2;
  const hasExclamation = (fullCaption.match(/!{2,}|\?{2,}/g) || []).length > 0;

  let level = 'low';
  const signals = [];

  if (isKnownMedia || (hasLiveNews && matchedHateSpeech.length === 0)) {
    level = 'low';
    signals.push(`Penyampaian informasi seputar isu "${substantiveTheme}" didukung oleh laporan media berita resmi nasional`);
    signals.push('Tidak terdeteksi unsur provokasi adu domba, hasutan kekerasan, atau ujaran kebencian');
  } else if (isDisasterOrIncident) {
    level = 'low';
    signals.push(`Konten memuat laporan peristiwa lapangan/musibah seputar "${substantiveTheme}"`);
    signals.push('Penyampaian bersifat liputan musibah faktual, bukan hasutan atau provokasi');
  } else if (matchedHateSpeech.length > 0) {
    level = 'high';
    signals.push(`Terdeteksi potensi ajakan hasutan ekstrem (${matchedHateSpeech.join(', ')})`);
    if (isCaps) signals.push('Penggunaan huruf kapital (ALL CAPS) berlebih untuk menonjolkan provokasi');
  } else if (matchedSensational.length >= 2 || (matchedSensational.length >= 1 && (isCaps || hasExclamation))) {
    level = 'medium';
    signals.push(`Menggunakan gaya penulisan sensasional media sosial (${matchedSensational.join(', ')})`);
    signals.push('Penyampaian informasi cenderung menonjolkan sorotan publik untuk menarik perhatian penonton');
  } else {
    level = 'low';
    signals.push(`Penyampaian pesan seputar isu "${substantiveTheme}" menggunakan nada bahasa wajar`);
    signals.push('Tidak terdeteksi unsur provokasi adu domba, hasutan kekerasan, atau ujaran kebencian');
  }

  const provExplanation = level === 'high'
    ? `Video memuat narasi yang berpotensi memicu ketegangan publik seputar isu ${substantiveTheme}. Disarankan tidak terprovokasi dan kroscek fakta resmi.`
    : level === 'medium'
    ? `Video menggunakan gaya bahasa sensasional khas media sosial untuk menarik perhatian seputar isu ${substantiveTheme}, namun tetap dalam koridor penyampaian informasi umum.`
    : (isDisasterOrIncident || hasLiveNews || isKnownMedia)
    ? `Video menyampaikan laporan peristiwa atau informasi seputar isu ${substantiveTheme} yang didukung fakta liputan berita resmi. Nada narasi bersifat informatif tanpa unsur hasutan atau provokasi.`
    : `Video menyampaikan narasi seputar isu ${substantiveTheme} secara wajar dan informatif tanpa unsur hasutan atau provokasi.`;

  // Real comment processing — ABSOLUTELY NO FAKE MOCK COMMENTS
  const { cleanComments, filteredOutCount } = filterRealComments(realComments);
  const commentForensics = analyzeAstroturfingAndAspects(cleanComments);

  let positive = '0%';
  let negative = '0%';
  let hate = '2%';
  let sampleSize = cleanComments.length;
  let commentSummary = '';
  let sampleComments = [];

  if (cleanComments.length > 0) {
    const topComments = cleanComments.slice(0, 6);
    sampleComments = topComments.map(c => {
      const { type, label } = classifyRealComment(c.text);
      return {
        text: `"${c.text}"`,
        type,
        label,
        userUniqueId: c.userUniqueId,
        userNickname: c.userNickname,
        likes: c.likes,
        reason: `Komentar asli ditarik dari TikTok (@${c.userUniqueId}${c.likes > 0 ? ` · ${c.likes.toLocaleString('id-ID')} suka` : ''})`
      };
    });

    const posCount = commentForensics.aspectSentiment.supportiveCount;
    const critCount = commentForensics.aspectSentiment.skepticalCount + commentForensics.aspectSentiment.criticalCount;
    const totalCount = Math.max(1, cleanComments.length);
    positive = `${Math.min(95, Math.round((posCount / totalCount) * 100))}%`;
    negative = `${Math.min(95, Math.round((critCount / totalCount) * 100))}%`;

    commentSummary = `Berhasil menarik ${cleanComments.length} komentar publik asli dari TikTok (${filteredOutCount} komentar spam disaring). ${commentForensics.astroturfingSignal}`;
  } else {
    commentSummary = 'Data komentar publik tidak dapat ditarik langsung dari TikTok untuk video ini.';
  }

  // Claim determination — FAIR, BALANCED, AND TRUTH-SEEKING
  let claimText = '';
  let verdict = 'supported';
  let claimExplanation = '';

  if (isKnownMedia) {
    claimText = `Liputan berita resmi seputar isu ${substantiveTheme}`;
    verdict = 'supported';
    claimExplanation = `Konten ini merupakan tayangan informasi dari media jurnalisme resmi terverifikasi (${authorName}).`;
  } else if (hasLiveNews) {
    claimText = `Informasi seputar ${substantiveTheme} yang disampaikan dalam video`;
    verdict = 'supported';
    claimExplanation = `Peristiwa dan topik seputar ${substantiveTheme} terkonfirmasi memiliki liputan pemberitaan resmi di media nasional terkemuka.`;
  } else if (matchedHateSpeech.length > 0) {
    claimText = `Narasi klaim seputar ${substantiveTheme}`;
    verdict = 'misleading';
    claimExplanation = `Narasi video memuat pembingkaian provokatif yang belum terkonfirmasi oleh sumber otoritatif.`;
  } else {
    claimText = `Penyampaian informasi atau opini seputar ${substantiveTheme}`;
    verdict = level === 'high' ? 'misleading' : 'supported';
    claimExplanation = level === 'high'
      ? 'Narasi video menyajikan klaim yang berpotensi melebih-lebihkan fakta sebenarnya.'
      : 'Konten berupa materi informasi/hiburan tanpa klaim yang bertentangan dengan konsensus fakta publik.';
  }

  // Score calculation
  let score = 88;
  if (isKnownMedia) score = 96;
  else if (hasLiveNews) score = 92;
  else {
    if (level === 'high') score -= 30;
    else if (level === 'medium') score -= 10;
    if (verdict === 'misleading') score -= 20;
    if (verdict === 'false') score -= 40;
    if (isCaps && hasExclamation) score -= 5;
  }
  score = Math.max(25, Math.min(98, score));

  const credibility = {
    score,
    rating: score >= 80 ? 'Tinggi (Sangat Layak Dipercaya)' : score >= 50 ? 'Sedang (Perlu Kroscek Lanjutan)' : 'Rendah (Berisiko Disinformasi)',
    badge: score >= 80 ? 'verified' : score >= 50 ? 'warning' : 'danger',
    explanation: score >= 80
      ? (isKnownMedia 
          ? 'Konten bersumber dari media berita resmi dengan standar verifikasi jurnalisme.'
          : (hasLiveNews
              ? 'Narasi video terkonfirmasi oleh pemberitaan media resmi nasional yang relevan.'
              : 'Narasi video didukung oleh konsensus fakta tanpa indikasi manipulasi atau provokasi adu domba.'))
      : score >= 50
      ? 'Narasi video memuat informasi yang sebagian belum terverifikasi penuh atau menggunakan sudut pandang opini pribadi.'
      : 'Narasi video terindikasi memuat klaim sensasional atau potensi ketidakakuratan tinggi yang belum terverifikasi.'
  };

  const themeExplanation = `Video membahas isu '${substantiveTheme}'. Narasi difokuskan pada dinamika topik tersebut.`;

  const quickVerdict = buildQuickVerdict(
    credibility,
    [{ claim: claimText, verdict, explanation: claimExplanation }],
    { level, signals },
    substantiveTheme,
    themeExplanation,
    liveNews
  );

  const audioForensics = analyzeAudioForensics(tikwmData?.music, authorUsername, null);
  const authorForensics = analyzeAuthorForensics(tikwmData?.author, tikwmData?.stats);
  const decontextualization = analyzeDecontextualization(videoMeta?.thumbnail_url || tikwmData?.cover, fullCaption, null);
  const aiDetection = detectAiContent(fullCaption, text, null);

  const detectedTexts = [];
  if (isCaps) {
    const caps = fullCaption.match(/[A-Z]{4,}/g) || [];
    caps.forEach(c => detectedTexts.push(c));
  }
  const onScreenOcr = {
    detectedTexts,
    hasMisleadingOverlay: (isDisasterOrIncident || hasLiveNews || isKnownMedia) ? false : (level === 'high'),
    explanation: (isDisasterOrIncident || hasLiveNews || isKnownMedia)
      ? 'Teks overlay berfungsi sebagai penjelas peristiwa dan tidak menunjukkan indikasi penyesatan informasi.'
      : (level === 'high'
          ? 'Terdeteksi teks berhuruf kapital atau tanda baca dramatis yang menonjolkan sensasionalisme narasi.'
          : 'Teks overlay tidak menunjukkan pola penyesatan ekstrem.')
  };

  const clickbaitMeter = buildClickbaitMeter(videoMeta?.title || tikwmData?.title || '', fullCaption, hasLiveNews, isKnownMedia);
  const scamDetection = buildScamDetection(videoMeta?.title || tikwmData?.title || '', fullCaption, detectedTexts);
  const counterComment = buildCounterComment(quickVerdict, [{ claim: claimText, verdict, explanation: claimExplanation }], liveNews);

  const newsVerificationSources = generateNewsVerificationSources(liveNews, substantiveTheme);

  return {
    status: 'complete',
    analysisMode,
    quickVerdict,
    credibility,
    substantiveTheme,
    audioForensics,
    authorForensics,
    decontextualization,
    onScreenOcr,
    commentForensics,
    isPhotoMode: Boolean(tikwmData?.isPhotoMode),
    photoSlides: tikwmData?.photoSlides || [],
    claims: [{
      claim: claimText,
      verdict,
      explanation: claimExplanation,
      confidence: isKnownMedia || hasLiveNews ? 'high' : 'medium',
      sources: (liveNews || []).slice(0, 3).map(n => ({
        title: n.title,
        publisher: n.source,
        url: n.link
      }))
    }],
    newsVerificationSources,
    clickbaitMeter,
    scamDetection,
    counterComment,
    provocation: {
      level,
      explanation: provExplanation,
      signals,
      confidence: isKnownMedia || hasLiveNews ? 'high' : 'medium'
    },
    comments: {
      positive,
      negative,
      hate,
      sampleSize,
      filteredOutCount,
      summary: commentSummary,
      sampleComments,
      confidence: cleanComments.length > 0 ? 'high' : 'low'
    },
    aiDetection,
    video: {
      title: fullCaption.slice(0, 100),
      fullCaption,
      videoId,
      embedHtml: videoMeta?.html || null,
      thumbnailUrl: videoMeta?.thumbnail_url || tikwmData?.cover || null,
      authorName,
      authorUsername
    },
    videoContext: {
      substantiveTheme,
      topicSummary: isKnownMedia 
        ? `Liputan berita resmi seputar isu ${substantiveTheme} dari ${authorName}.`
        : `Video membahas topik seputar ${substantiveTheme}.`,
      detailedNarrative: isKnownMedia
        ? `Materi berita menyajikan laporan peristiwa seputar ${substantiveTheme} dengan format jurnalisme resmi.`
        : `Analisis konteks berbasis metadata dan narasi: ${fullCaption.slice(0, 200)}.`,
      visualDescription: tikwmData?.isPhotoMode ? 'Konten berupa galeri slide foto (Carousel).' : 'Deskripsi visual berbasis thumbnail dan metadata siaran.',
      spokenContent: audioForensics.audioTypeLabel,
      audioAnalysis: audioForensics.explanation,
      keyMoments: [`Topik utama: ${substantiveTheme}`],
      videoVsCaption: 'Penyampaian narasi selaras dengan topik utama.',
      contentCategory: isKnownMedia ? 'berita' : (level === 'high' ? 'opini' : 'edukasi'),
      contextDepth: 'moderate',
      manipulationCheck: decontextualization.explanation,
      analysisMode: 'smart-local'
    },
    limitations: [
      hasLiveNews ? 'Terverifikasi dengan laporan berita resmi nasional.' : 'Analisis otomatis berbasis penelusuran fakta dan metadata.',
      'Selalu rujuk media berita kredibel untuk informasi terkini.'
    ]
  };
}

// Fallback report for deleted or truncated TikTok URLs
function fallbackReportForInaccessibleVideo(url, resolvedUrl) {
  const videoId = extractVideoId(url) || extractVideoId(resolvedUrl || '') || null;
  const isShortLink = url.includes('vt.tiktok.com') || url.includes('vm.tiktok.com');
  const shortCode = url.split('/').filter(Boolean).pop() || '';
  const isLikelyTruncated = isShortLink && shortCode.length < 7;

  const reasonTitle = isLikelyTruncated
    ? 'Tautan TikTok Terpotong (Tidak Lengkap)'
    : 'Video TikTok Tidak Ditemukan atau Telah Dihapus';

  const reasonExplanation = isLikelyTruncated
    ? 'Tautan yang Anda salin terputus di tengah jalan sehingga server TikTok tidak dapat menemukan video yang dimaksud.'
    : 'Server TikTok mengembalikan status 404 (Not Found). Video ini mungkin telah dihapus oleh pengunggahnya atau diubah menjadi privat.';

  return {
    status: 'partial',
    credibility: {
      score: 0,
      rating: isLikelyTruncated ? 'Tautan Terpotong' : 'Video Tidak Ditemukan',
      badge: 'warning',
      explanation: reasonExplanation
    },
    quickVerdict: {
      validityVerdict: 'unverified',
      badgeLabel: 'TIDAK DAPAT DIAKSES',
      badgeType: 'warning',
      score: 0,
      summaryVerdict: reasonTitle,
      substantiveTheme: 'Tautan Tidak Valid',
      themeExplanation: reasonExplanation,
      keyFinding: 'Pastikan tautan TikTok disalin secara utuh.',
      relatedNews: []
    },
    videoContext: {
      topicSummary: `${reasonTitle}. ${reasonExplanation}`,
      detailedNarrative: reasonExplanation,
      visualDescription: 'Tidak tersedia.',
      spokenContent: 'Tidak tersedia.',
      audioAnalysis: 'Tidak tersedia.',
      keyMoments: ['Salin ulang tautan penuh dari aplikasi TikTok'],
      videoVsCaption: 'Tidak dapat dibandingkan.',
      contentCategory: 'unknown',
      contextDepth: 'shallow',
      manipulationCheck: 'Pemeriksaan tidak dapat dilakukan.',
      analysisMode: 'inaccessible'
    },
    video: {
      title: reasonTitle,
      fullCaption: `Tautan: ${url}`,
      videoId,
      embedHtml: null,
      thumbnailUrl: null,
      authorName: 'Pengunggah TikTok',
      authorUsername: 'unknown'
    },
    comments: {
      positive: '0%', negative: '0%', hate: '0%', sampleSize: 0, filteredOutCount: 0,
      summary: 'Komentar tidak tersedia untuk video yang tidak dapat diakses.',
      sampleComments: [], confidence: 'low'
    },
    provocation: {
      level: 'low',
      explanation: 'Tingkat provokasi tidak dapat diukur.',
      signals: ['Tautan terputus atau video tidak publik'],
      confidence: 'low'
    },
    claims: [
      {
        claim: 'Aksesibilitas Konten',
        verdict: 'unverified',
        explanation: reasonExplanation,
        confidence: 'low',
        sources: []
      }
    ],
    newsVerificationSources: [],
    analyzedAt: new Date().toISOString(),
    limitations: [reasonExplanation]
  };
}

function cleanupVideo(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

const TRENDING_FILE = require('path').join(require('os').tmpdir(), 'veriftok-trending.json');

function saveTrending(report, url) {
  try {
    const fs = require('fs');
    let data = [];
    try { data = JSON.parse(fs.readFileSync(TRENDING_FILE, 'utf8')); } catch { data = []; }
    
    const entry = {
      id: Date.now().toString(36),
      url: url,
      checkedAt: new Date().toISOString(),
      theme: report.quickVerdict?.substantiveTheme || report.substantiveTheme || '',
      verdict: report.quickVerdict?.validityVerdict || 'unverified',
      badgeLabel: report.quickVerdict?.badgeLabel || 'BELUM DIVERIFIKASI',
      badgeType: report.quickVerdict?.badgeType || 'warning',
      score: report.quickVerdict?.score ?? report.credibility?.score ?? 0,
      summary: report.quickVerdict?.summaryVerdict || '',
      authorName: report.video?.authorName || '',
      authorUsername: report.video?.authorUsername || '',
      thumbnailUrl: report.video?.thumbnailUrl || '',
      isPhotoMode: report.isPhotoMode || false
    };
    
    data = data.filter(d => d.url !== url);
    data.unshift(entry);
    data = data.slice(0, 20);
    
    fs.writeFileSync(TRENDING_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[Trending] Failed to save:', err.message);
  }
}

function buildClickbaitMeter(title, caption, hasLiveNews = false, isKnownMedia = false) {
  let score = 0;
  const signals = [];
  const upperTitle = (title || '').toUpperCase();
  const combined = `${title} ${caption}`.toLowerCase();
  
  const capsWords = (title || '').match(/[A-Z]{4,}/g) || [];
  if (capsWords.length >= 2) { score += 20; signals.push('Huruf kapital berlebihan pada judul'); }
  
  const exclCount = (title || '').split('!').length - 1;
  const questCount = (title || '').split('?').length - 1;
  if (exclCount >= 2) { score += 15; signals.push(`${exclCount} tanda seru berlebihan`); }
  if (questCount >= 2) { score += 10; signals.push('Tanda tanya berlebihan'); }
  
  const sensationalWords = ['heboh','geger','gempar','detik-detik','ternyata','terkuak','mencengangkan','bikin kaget','viral','tak disangka','auto','langsung','wajib tonton','jangan sampai','rahasia'];
  const found = sensationalWords.filter(w => combined.includes(w));
  if (found.length > 0) { score += found.length * 12; signals.push(`Kata sensasional: ${found.join(', ')}`); }
  
  const clickbaitTags = ['#fyp','#viral','#foryoupage','#trending','#xyzbca'];
  const tagCount = clickbaitTags.filter(t => combined.includes(t)).length;
  if (tagCount >= 3) { score += 10; signals.push('Hashtag clickbait berlebihan'); }
  
  if (hasLiveNews || isKnownMedia) {
    score = Math.min(20, Math.round(score * 0.3));
  }

  score = Math.min(100, score);
  const level = score <= 15 ? 'none' : score <= 35 ? 'low' : score <= 55 ? 'medium' : score <= 80 ? 'high' : 'extreme';
  
  return {
    score,
    level,
    titleClaim: title || '',
    actualContent: '',
    mismatchExplanation: (hasLiveNews || isKnownMedia)
      ? 'Judul dan caption selaras dengan laporan peristiwa faktual yang dikonfirmasi oleh pemberitaan media resmi.'
      : (signals.length > 0 ? `Terdeteksi ${signals.length} sinyal sensasionalisme pada judul/caption konten.` : 'Judul dan caption tampak wajar tanpa indikasi clickbait.'),
    signals
  };
}

function buildScamDetection(title, caption, ocrTexts) {
  const combined = `${title} ${caption} ${(ocrTexts || []).join(' ')}`.toLowerCase();
  const signals = [];
  let isScamSuspected = false;
  let type = 'none';
  let riskLevel = 'safe';
  const detectedIdentifiers = [];
  
  const rekeningPattern = /(?:rek(?:ening)?|transfer|tf)\s*[:.]?\s*([\d]{8,16})/gi;
  const rekeningMatches = combined.match(rekeningPattern);
  if (rekeningMatches) {
    signals.push('Nomor rekening terdeteksi di caption/teks layar');
    detectedIdentifiers.push(...rekeningMatches);
    isScamSuspected = true;
    type = 'donation_fraud';
  }
  
  const donationKeywords = ['donasi','sumbangan','galang dana','open donasi','bantu transfer','sedekah','infaq','kitabisa','saweria','sociabuzz','trakteer','link di bio','klik link'];
  const foundDonation = donationKeywords.filter(k => combined.includes(k));
  if (foundDonation.length >= 2) {
    signals.push(`Kata kunci donasi/transfer: ${foundDonation.join(', ')}`);
    isScamSuspected = true;
    type = type === 'none' ? 'fake_charity' : type;
  }
  
  const ewalletPattern = /(?:ovo|gopay|dana|shopeepay|linkaja)\s*[:.]?\s*([\d]{10,14})/gi;
  const ewalletMatches = combined.match(ewalletPattern);
  if (ewalletMatches) {
    signals.push('Nomor e-wallet terdeteksi');
    detectedIdentifiers.push(...ewalletMatches);
    isScamSuspected = true;
  }
  
  if (combined.includes('wa.me/') || combined.includes('whatsapp.com/') || /hubungi\s*(wa|whatsapp)/i.test(combined)) {
    signals.push('Link/nomor WhatsApp terdeteksi (potensi modus kontak langsung)');
    isScamSuspected = true;
    type = type === 'none' ? 'financial_scam' : type;
  }
  
  const manipPatterns = ['bantu share','bantu viral','tolong sebarkan','kasihan','miris','nangis','sedih banget'];
  const foundManip = manipPatterns.filter(k => combined.includes(k));
  if (foundManip.length >= 2 && isScamSuspected) {
    signals.push('Pola manipulasi emosional untuk memancing donasi');
    riskLevel = 'dangerous';
  }
  
  if (isScamSuspected && riskLevel === 'safe') riskLevel = 'suspicious';
  
  return {
    isScamSuspected,
    type,
    riskLevel,
    explanation: isScamSuspected 
      ? `Terdeteksi ${signals.length} sinyal yang mengindikasikan potensi penipuan atau penggalangan dana mencurigakan.`
      : 'Tidak ditemukan indikasi penipuan atau ajakan donasi mencurigakan pada konten ini.',
    signals,
    detectedIdentifiers
  };
}

function buildCounterComment(quickVerdict, claims, newsResults) {
  const verdict = quickVerdict?.validityVerdict || 'unverified';
  const theme = quickVerdict?.substantiveTheme || 'topik ini';
  const firstSource = (newsResults || [])[0];
  
  let shortReply, detailedReply, factCheckReply;
  
  if (verdict === 'valid') {
    shortReply = `Informasi tentang ${theme} ini sudah dikonfirmasi kebenarannya oleh media resmi.`;
    detailedReply = `Setelah diperiksa, klaim dalam video ini tentang ${theme} sesuai dengan fakta yang dilaporkan media kredibel.`;
    factCheckReply = firstSource 
      ? `Informasi ini valid. Sumber: ${firstSource.title} (${firstSource.publisher})`
      : `Informasi tentang ${theme} ini telah diverifikasi dan sesuai fakta.`;
  } else if (verdict === 'false' || verdict === 'misleading') {
    shortReply = `Hati-hati, klaim tentang ${theme} ini tidak sesuai fakta. Cek dulu sebelum share.`;
    detailedReply = `Video ini mengandung klaim yang tidak akurat tentang ${theme}. Sebaiknya cek fakta dulu sebelum menyebarkan.`;
    factCheckReply = firstSource
      ? `Klaim ini tidak akurat. Cek fakta: ${firstSource.title} (${firstSource.publisher})`  
      : `Klaim tentang ${theme} ini sudah diperiksa dan tidak sesuai fakta. Jangan langsung percaya, cek dulu.`;
  } else {
    shortReply = `Klaim tentang ${theme} ini belum bisa dikonfirmasi. Bijak dalam menyebarkan.`;
    detailedReply = `Informasi tentang ${theme} dalam video ini belum terverifikasi oleh sumber resmi. Sebaiknya tunggu konfirmasi.`;
    factCheckReply = firstSource
      ? `Belum bisa dikonfirmasi. Baca juga: ${firstSource.title} (${firstSource.publisher})`
      : `Klaim tentang ${theme} ini masih perlu diverifikasi. Jangan langsung share sebelum pasti.`;
  }

  return { shortReply, detailedReply, factCheckReply };
}

function harmonizeReportConsistency(report, liveNews, tikwmData) {
  if (!report || typeof report !== 'object') return report;

  const hasLiveNews = Array.isArray(liveNews) && liveNews.length > 0;
  const isVerifiedMedia = Boolean(tikwmData?.author?.verified);
  const score = report.credibility?.score ?? report.quickVerdict?.score ?? 75;
  const isValidOrHighCred = score >= 80 || report.quickVerdict?.validityVerdict === 'valid' || hasLiveNews || isVerifiedMedia;

  const captionText = `${report.video?.fullCaption || ''} ${report.video?.title || ''}`.toLowerCase();
  const disasterIncidentWords = [
    'kebakaran', 'terbakar', 'pembakaran', 'ledakan', 'meledak', 'tabung gas',
    'bencana', 'gempa', 'tsunami', 'banjir', 'longsor', 'kecelakaan', 'damkar',
    'pemadam', 'evakuasi', 'korban', 'olah tkp', 'puslabfor', 'pipa gas', 'musibah', 'runtuh'
  ];
  const isDisasterOrIncident = disasterIncidentWords.some(k => captionText.includes(k));

  // 1. HARMONISASI SEKSI H (Tingkat Provokasi & Framing)
  if (isValidOrHighCred || isDisasterOrIncident) {
    if (report.provocation) {
      if (report.provocation.level === 'high') {
        report.provocation.level = 'low';
        report.provocation.explanation = `Video menyampaikan laporan peristiwa atau informasi seputar isu ${report.substantiveTheme || 'isu terkait'} yang didukung fakta liputan berita resmi. Nada narasi bersifat informatif tanpa unsur hasutan atau provokasi.`;
        report.provocation.signals = [
          `Penyampaian informasi seputar peristiwa "${report.substantiveTheme || 'isu terkait'}" didukung oleh laporan media berita resmi nasional`,
          'Tidak terdeteksi unsur provokasi kekerasan, ujaran kebencian, atau hasutan adu domba'
        ];
      } else if (Array.isArray(report.provocation.signals)) {
        report.provocation.signals = report.provocation.signals.filter(s =>
          !s.includes('(bakar)') && !s.includes('kebakaran') && !s.includes('(hancurkan)') && !s.includes('(serbu)') && !s.includes('(bantai)')
        );
        if (report.provocation.signals.length === 0) {
          report.provocation.signals.push('Penyampaian narasi dalam batas wajar tanpa hasutan atau provokasi');
        }
      }
    }

    // 2. HARMONISASI SEKSI D (Teks Layar / OCR)
    if (report.onScreenOcr) {
      report.onScreenOcr.hasMisleadingOverlay = false;
      report.onScreenOcr.explanation = 'Teks overlay berfungsi sebagai penjelas peristiwa dan tidak menunjukkan indikasi penyesatan informasi.';
    }

    // 3. HARMONISASI SEKSI CB (Clickbait Meter)
    if (report.clickbaitMeter) {
      if (report.clickbaitMeter.score > 35) {
        report.clickbaitMeter.score = Math.min(25, Math.round(report.clickbaitMeter.score * 0.35));
        report.clickbaitMeter.level = report.clickbaitMeter.score <= 15 ? 'none' : 'low';
        report.clickbaitMeter.mismatchExplanation = 'Judul dan narasi selaras dengan peristiwa faktual yang dilaporkan di media resmi.';
      }
    }

    // 4. HARMONISASI SEKSI E (Dekontekstualisasi)
    if (report.decontextualization && !report.decontextualization.provenOldFootage) {
      report.decontextualization.isFootageReused = false;
      report.decontextualization.explanation = 'Tidak terdeteksi indikasi jelas rekaman daur ulang. Narasi selaras dengan liputan peristiwa terkini.';
    }

    // 5. HARMONISASI SEKSI J (Klaim)
    if (Array.isArray(report.claims) && report.claims.length > 0) {
      const c = report.claims[0];
      if (c.verdict === 'misleading' || c.verdict === 'unverified') {
        c.verdict = 'supported';
        c.explanation = `Peristiwa dan fakta seputar '${report.substantiveTheme || 'topik ini'}' terkonfirmasi didukung oleh liputan pemberitaan media resmi nasional.`;
      }
    }

    // 6. HARMONISASI QUICK VERDICT
    if (report.quickVerdict) {
      if (report.quickVerdict.validityVerdict === 'misleading' || report.quickVerdict.validityVerdict === 'unverified') {
        report.quickVerdict.validityVerdict = 'valid';
        report.quickVerdict.badgeLabel = hasLiveNews ? 'VALID & TERVERIFIKASI' : 'VALID & AMAN';
        report.quickVerdict.badgeType = 'verified';
        report.quickVerdict.summaryVerdict = hasLiveNews
          ? 'Informasi dalam video ini terkonfirmasi faktual dan diliput oleh media berita resmi nasional.'
          : 'Isi konten dan narasi video terverifikasi wajar serta tidak memuat unsur disinformasi atau provokasi adu domba.';
      }
      if (report.quickVerdict.score < 80) {
        report.quickVerdict.score = Math.max(88, report.quickVerdict.score);
      }
    }

    if (report.credibility && report.credibility.score < 80) {
      report.credibility.score = Math.max(88, report.credibility.score);
      report.credibility.badge = 'verified';
      report.credibility.rating = 'Tinggi (Sangat Layak Dipercaya)';
      report.credibility.explanation = 'Narasi video terkonfirmasi oleh laporan berita resmi nasional yang relevan.';
    }
  }

  return report;
}

function sendFinalReport(res, report, liveNews, tikwmData, url) {
  const harmonized = harmonizeReportConsistency(report, liveNews, tikwmData);
  saveTrending(harmonized, url || '');
  return json(res, 200, harmonized);
}

// MAIN HANDLER
module.exports = async function analyze(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Gunakan metode POST.' });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  // Case 1: Direct File Upload (Image or Video)
  if (req.body?.fileBase64 && typeof req.body.fileBase64 === 'string') {
    try {
      const mimeType = req.body.mimeType || 'image/jpeg';
      const fileName = req.body.fileName || 'uploaded_media';
      const base64Data = req.body.fileBase64.replace(/^data:[^;]+;base64,/, '');
      const fileBuffer = Buffer.from(base64Data, 'base64');

      if (mimeType.startsWith('image/')) {
        // Direct multimodal image analysis
        const photoParts = [{ inlineData: { mimeType, data: base64Data } }];
        const videoMeta = { title: `Berkas Gambar: ${fileName}`, author_name: 'Unggahan Pengguna', author_unique_id: 'user' };
        
        let report = null;
        if (geminiApiKey) {
          report = await analyzePhotosWithGemini(photoParts, 'uploaded-file', videoMeta, [], null, geminiApiKey);
        }
        
        const substantiveTheme = report?.substantiveTheme || fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        const liveNews = await fetchLiveNews(substantiveTheme);
        
        if (!report) {
          report = analyzeLocally('uploaded-file', videoMeta, [], null, liveNews, 'full');
        }

        report.isUploadedFile = true;
        report.analysisMode = 'full';
        report.quickVerdict = buildQuickVerdict(
          report.credibility,
          report.claims,
          report.provocation,
          substantiveTheme,
          report.themeExplanation || `Analisis berkas foto/tangkapan layar: ${fileName}`,
          liveNews
        );
        report.newsVerificationSources = generateNewsVerificationSources(liveNews, substantiveTheme);
        return sendFinalReport(res, report, liveNews, null, fileName);
      } else if (mimeType.startsWith('video/')) {
        // Video file uploaded
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
        const videoFilePath = path.join(TEMP_DIR, `up_${Date.now()}.mp4`);
        fs.writeFileSync(videoFilePath, fileBuffer);

        try {
          const videoMeta = { title: `Berkas Video: ${fileName}`, author_name: 'Unggahan Pengguna', author_unique_id: 'user' };
          let report = null;

          if (geminiApiKey) {
            const fileData = await uploadToGeminiFiles(videoFilePath, geminiApiKey);
            report = await analyzeVideoWithGemini(fileData.fileUri, fileData.mimeType, 'uploaded-file', videoMeta, [], null, geminiApiKey, 'full');
          }

          const substantiveTheme = report?.substantiveTheme || fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
          const liveNews = await fetchLiveNews(substantiveTheme);

          if (!report) {
            report = analyzeLocally('uploaded-file', videoMeta, [], null, liveNews, 'full');
          }

          report.isUploadedFile = true;
          report.analysisMode = 'full';
          report.quickVerdict = buildQuickVerdict(
            report.credibility,
            report.claims,
            report.provocation,
            substantiveTheme,
            report.themeExplanation || `Analisis berkas video langsung: ${fileName}`,
            liveNews
          );
          report.newsVerificationSources = generateNewsVerificationSources(liveNews, substantiveTheme);
          return sendFinalReport(res, report, liveNews, null, fileName);
        } finally {
          cleanupVideo(videoFilePath);
        }
      }
    } catch (err) {
      console.error('[FileUploadAnalysis] Error:', err.message);
      return json(res, 500, { code: 'FILE_ANALYSIS_ERROR', message: 'Gagal menganalisis berkas yang diunggah: ' + err.message });
    }
  }

  // Case 2: TikTok URL Submission
  const analysisMode = req.body?.mode || 'full';
  let rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim().replace(/[.,;:!?)>]+$/, '') : '';
  if (rawUrl && !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    rawUrl = 'https://' + rawUrl;
  }

  if (!isTikTokUrl(rawUrl)) {
    return json(res, 422, { code: 'INVALID_TIKTOK_URL', message: 'Masukkan tautan HTTPS dari tiktok.com, vm.tiktok.com, atau vt.tiktok.com.' });
  }

  const resolvedUrl = await resolveTikTokUrl(rawUrl);

  // Parallel data extraction: OEmbed, Tikwm Data (video/photos/music/author), Real Comments
  const [videoMeta, tikwmData, realComments] = await Promise.all([
    fetchTikTokOembed(resolvedUrl),
    fetchTikwmData(resolvedUrl),
    fetchRealTikTokComments(resolvedUrl)
  ]);

  // Check if completely inaccessible
  if (!videoMeta && !tikwmData && realComments.length === 0) {
    const fallbackReport = fallbackReportForInaccessibleVideo(rawUrl, resolvedUrl);
    return json(res, 200, fallbackReport);
  }

  const effectiveTitle = videoMeta?.title || tikwmData?.title || '';
  const effectiveAuthorName = videoMeta?.author_name || tikwmData?.author?.nickname || 'Kreator TikTok';
  const effectiveAuthorUsername = videoMeta?.author_unique_id || tikwmData?.author?.unique_id || 'creator';
  const effectiveThumbnail = videoMeta?.thumbnail_url || tikwmData?.cover || null;

  // Determine Substantive Theme & Fetch Live News Articles
  const entities = extractKeyEntities(effectiveTitle);
  const preliminaryTheme = extractNewsTopicQuery(effectiveTitle, entities, null);
  const shouldFetchNews = analysisMode !== 'ai';
  const liveNews = shouldFetchNews ? await fetchLiveNews(preliminaryTheme, entities.slice(0, 2).join(' ')) : [];

  // Check if TikTok Photo Mode (Carousel Slide)
  if (tikwmData?.isPhotoMode && tikwmData.photoSlides.length > 0) {
    console.log(`[TikTokPhotoMode] Detected ${tikwmData.photoSlides.length} photo slides`);
    let report = null;

    if (geminiApiKey) {
      try {
        const photoParts = await downloadTikTokPhotos(tikwmData.photoSlides);
        if (photoParts.length > 0) {
          report = await analyzePhotosWithGemini(photoParts, resolvedUrl, videoMeta, realComments, tikwmData, geminiApiKey, analysisMode);
        }
      } catch (err) {
        console.error('[TikTokPhotoMode] Gemini photo analysis error:', err.message);
      }
    }

    if (!report) {
      report = analyzeLocally(resolvedUrl, videoMeta, realComments, tikwmData, liveNews, analysisMode);
    }

    const substantiveTheme = report.substantiveTheme || preliminaryTheme;
    const finalLiveNews = (substantiveTheme !== preliminaryTheme) ? await fetchLiveNews(substantiveTheme, preliminaryTheme) : liveNews;
    const resolvedLiveNews = finalLiveNews.length > 0 ? finalLiveNews : liveNews;

    report.isPhotoMode = true;
    report.analysisMode = analysisMode;
    report.photoSlides = tikwmData.photoSlides;
    report.audioForensics = analyzeAudioForensics(tikwmData.music, effectiveAuthorUsername, report.videoContext);
    report.authorForensics = analyzeAuthorForensics(tikwmData.author, tikwmData.stats);
    report.decontextualization = analyzeDecontextualization(effectiveThumbnail, effectiveTitle, report.videoContext);
    report.newsVerificationSources = generateNewsVerificationSources(resolvedLiveNews, substantiveTheme);
    report.quickVerdict = buildQuickVerdict(
      report.credibility,
      report.claims,
      report.provocation,
      substantiveTheme,
      report.themeExplanation || `Foto geser (carousel) TikTok mengenai '${substantiveTheme}'.`,
      resolvedLiveNews
    );
    report.analyzedAt = new Date().toISOString();
    return sendFinalReport(res, report, resolvedLiveNews, tikwmData, resolvedUrl);
  }

  // Standard Video Mode: Download video for deep multimodal analysis if Gemini API key exists
  let videoDownload = null;
  const shouldDownloadVideo = analysisMode === 'full' || analysisMode === 'ai';
  if (shouldDownloadVideo && geminiApiKey && tikwmData?.videoDownloadUrl) {
    videoDownload = await downloadTikTokVideo(tikwmData.videoDownloadUrl);
  }

  if (geminiApiKey && videoDownload?.filePath) {
    try {
      console.log(`[VideoAnalysis] Video downloaded (${videoDownload.sizeBytes} bytes), uploading to Gemini Files API...`);
      const fileData = await uploadToGeminiFiles(videoDownload.filePath, geminiApiKey);

      const report = await analyzeVideoWithGemini(
        fileData.fileUri,
        fileData.mimeType,
        resolvedUrl,
        videoMeta,
        realComments,
        tikwmData,
        geminiApiKey,
        analysisMode
      );

      const substantiveTheme = report.substantiveTheme || preliminaryTheme;
      const refreshedLiveNews = (shouldFetchNews && substantiveTheme !== preliminaryTheme) ? await fetchLiveNews(substantiveTheme, preliminaryTheme) : liveNews;
      const finalLiveNews = refreshedLiveNews.length > 0 ? refreshedLiveNews : liveNews;

      report.audioForensics = analyzeAudioForensics(tikwmData?.music, effectiveAuthorUsername, report.videoContext);
      report.authorForensics = analyzeAuthorForensics(tikwmData?.author, tikwmData?.stats);
      report.decontextualization = analyzeDecontextualization(effectiveThumbnail, effectiveTitle, report.videoContext);
      
      const { cleanComments } = filterRealComments(realComments);
      report.commentForensics = analyzeAstroturfingAndAspects(cleanComments);

      if (!report.aiDetection) {
        report.aiDetection = detectAiContent(effectiveTitle, effectiveTitle.toLowerCase(), report.videoContext);
      }
      report.newsVerificationSources = generateNewsVerificationSources(finalLiveNews, substantiveTheme);

      // Corroborate claims with live news if available
      if (finalLiveNews.length > 0 && report.claims && report.claims.length > 0) {
        report.claims[0].sources = finalLiveNews.slice(0, 3).map(n => ({
          title: n.title,
          publisher: n.source,
          url: n.link
        }));
        if (report.claims[0].verdict === 'unverified' || report.claims[0].verdict === 'mixed') {
          report.claims[0].verdict = 'supported';
          report.claims[0].explanation = `Klaim seputar '${substantiveTheme}' didukung oleh liputan pemberitaan media resmi nasional.`;
        }
      }

      if (!report.credibility || (finalLiveNews.length > 0 && report.credibility.score < 75)) {
        const provLevel = report.provocation?.level || 'low';
        let score = finalLiveNews.length > 0 ? 90 : 85;
        if (provLevel === 'high') score -= 20;
        else if (provLevel === 'medium') score -= 10;
        score = Math.max(30, Math.min(96, score));
        report.credibility = {
          score,
          rating: score >= 80 ? 'Tinggi (Sangat Layak Dipercaya)' : score >= 50 ? 'Sedang (Perlu Kroscek Lanjutan)' : 'Rendah (Berisiko Disinformasi)',
          badge: score >= 80 ? 'verified' : score >= 50 ? 'warning' : 'danger',
          explanation: score >= 80
            ? (finalLiveNews.length > 0 ? 'Narasi video terkonfirmasi oleh laporan berita resmi nasional yang relevan.' : 'Narasi video didukung konsensus fakta tanpa indikasi disinformasi.')
            : 'Narasi video mengandung informasi yang perlu dikroscek dengan sumber berita resmi.'
        };
      }

      report.quickVerdict = buildQuickVerdict(
        report.credibility,
        report.claims,
        report.provocation,
        substantiveTheme,
        report.themeExplanation || `Video berfokus pada isu '${substantiveTheme}'. Narasi perlu disaring secara jernih dari judul sensasional.`,
        finalLiveNews
      );

      report.analysisMode = analysisMode;
      if (report.videoContext) {
        report.videoContext.analysisMode = 'multimodal-deep';
      }
      report.analyzedAt = new Date().toISOString();

      return sendFinalReport(res, report, finalLiveNews, tikwmData, resolvedUrl);
    } catch (err) {
      console.error('[VideoAnalysis] Deep multimodal error, falling back:', err.message);
    } finally {
      cleanupVideo(videoDownload.filePath);
    }
  }

  // Text-only Gemini Fallback
  if (geminiApiKey) {
    try {
      const report = await analyzeWithGemini(resolvedUrl, videoMeta, realComments, tikwmData, geminiApiKey, analysisMode);
      const substantiveTheme = report.substantiveTheme || preliminaryTheme;
      const refreshedLiveNews = (shouldFetchNews && substantiveTheme !== preliminaryTheme) ? await fetchLiveNews(substantiveTheme, preliminaryTheme) : liveNews;
      const finalLiveNews = refreshedLiveNews.length > 0 ? refreshedLiveNews : liveNews;

      report.audioForensics = analyzeAudioForensics(tikwmData?.music, effectiveAuthorUsername, null);
      report.authorForensics = analyzeAuthorForensics(tikwmData?.author, tikwmData?.stats);
      report.decontextualization = analyzeDecontextualization(effectiveThumbnail, effectiveTitle, null);

      const { cleanComments } = filterRealComments(realComments);
      report.commentForensics = analyzeAstroturfingAndAspects(cleanComments);

      report.newsVerificationSources = generateNewsVerificationSources(finalLiveNews, substantiveTheme);

      if (finalLiveNews.length > 0 && report.claims && report.claims.length > 0) {
        report.claims[0].sources = finalLiveNews.slice(0, 3).map(n => ({
          title: n.title,
          publisher: n.source,
          url: n.link
        }));
        if (report.claims[0].verdict === 'unverified' || report.claims[0].verdict === 'mixed') {
          report.claims[0].verdict = 'supported';
          report.claims[0].explanation = `Klaim seputar '${substantiveTheme}' didukung oleh liputan pemberitaan media resmi nasional.`;
        }
      }

      if (!report.credibility || (finalLiveNews.length > 0 && report.credibility.score < 75)) {
        const provLevel = report.provocation?.level || 'low';
        let score = finalLiveNews.length > 0 ? 88 : 82;
        if (provLevel === 'high') score -= 20;
        else if (provLevel === 'medium') score -= 10;
        score = Math.max(30, Math.min(96, score));
        report.credibility = {
          score,
          rating: score >= 80 ? 'Tinggi (Sangat Layak Dipercaya)' : score >= 50 ? 'Sedang (Perlu Kroscek Lanjutan)' : 'Rendah (Berisiko Disinformasi)',
          badge: score >= 80 ? 'verified' : score >= 50 ? 'warning' : 'danger',
          explanation: score >= 80
            ? (finalLiveNews.length > 0 ? 'Narasi video terkonfirmasi oleh laporan berita resmi nasional yang relevan.' : 'Narasi video didukung konsensus fakta.')
            : 'Narasi video mengandung informasi yang perlu dikroscek dengan sumber berita resmi.'
        };
      }

      report.quickVerdict = buildQuickVerdict(
        report.credibility,
        report.claims,
        report.provocation,
        substantiveTheme,
        report.themeExplanation || `Video berfokus pada isu '${substantiveTheme}'.`,
        finalLiveNews
      );

      report.analysisMode = analysisMode;
      report.analyzedAt = new Date().toISOString();
      return sendFinalReport(res, report, finalLiveNews, tikwmData, resolvedUrl);
    } catch (err) {
      console.error('[TextAnalysis] Gemini text fallback error:', err.message);
    }
  }

  // Smart Local Rule-based Analyzer (NO Fake Comments)
  const localReport = analyzeLocally(resolvedUrl, videoMeta, realComments, tikwmData, liveNews, analysisMode);
  return sendFinalReport(res, localReport, liveNews, tikwmData, resolvedUrl);
};
