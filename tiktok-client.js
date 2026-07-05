// tiktok-client.js
//
// Direct calls to TikTok's official Content Posting API using the user's
// own access token (Authorization: Bearer <token>). No client_secret is
// needed for any of this — it only lives on the Vercel backend.
// Docs: https://developers.tiktok.com/doc/content-posting-api-get-started

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

async function tiktokFetch(path, token, options = {}) {
  const res = await fetch(`${TIKTOK_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok || data.error?.code !== 'ok') {
    throw new Error(data.error?.message || `TikTok API error (${res.status})`);
  }
  return data.data;
}

/**
 * Required before every post: TikTok's UX guidelines require showing the
 * creator's username/avatar and the privacy options actually available to
 * them before letting them hit "post".
 * https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info
 */
function getCreatorInfo(token) {
  return tiktokFetch('/post/publish/creator_info/query/', token, { method: 'POST' });
}

function pickChunking(videoSize) {
  const MIN_WHOLE = 5_000_000; // 5MB — below this, upload as a single chunk
  const CHUNK_SIZE = 10_000_000; // 10MB, matches TikTok's own example

  if (videoSize < MIN_WHOLE) {
    return { chunkSize: videoSize, totalChunkCount: 1 };
  }
  const totalChunkCount = Math.floor(videoSize / CHUNK_SIZE) || 1;
  return { chunkSize: CHUNK_SIZE, totalChunkCount };
}

/**
 * Initializes a direct-post video publish and returns { publish_id, upload_url }.
 * privacyLevel must be one of the values returned by getCreatorInfo() for
 * this creator (e.g. "PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY").
 *
 * Note: until your app passes TikTok's Content Posting audit, all posts are
 * forced to SELF_ONLY regardless of what you request here — that's TikTok
 * enforcing it server-side, not a bug in this client.
 */
async function initVideoPublish(token, { title, privacyLevel, videoSize, disableComment, disableDuet, disableStitch }) {
  const { chunkSize, totalChunkCount } = pickChunking(videoSize);

  return tiktokFetch('/post/publish/video/init/', token, {
    method: 'POST',
    body: JSON.stringify({
      post_info: {
        title,
        privacy_level: privacyLevel,
        disable_comment: !!disableComment,
        disable_duet: !!disableDuet,
        disable_stitch: !!disableStitch,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    }),
  });
}

/**
 * Uploads the raw video file to the upload_url returned by initVideoPublish.
 * Sends the whole file in one PUT with a full Content-Range header, which
 * TikTok's transfer guide allows regardless of chunk_size declared above
 * (chunk_size only affects how TikTok expects the byte ranges to arrive).
 */
async function uploadVideoFile(uploadUrl, file) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Range': `bytes 0-${file.size - 1}/${file.size}`,
      'Content-Type': 'video/mp4',
    },
    body: file,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Video upload failed (${res.status}): ${text}`);
  }
}

/** Poll until PUBLISH_COMPLETE / FAILED. */
function getPublishStatus(token, publishId) {
  return tiktokFetch('/post/publish/status/fetch/', token, {
    method: 'POST',
    body: JSON.stringify({ publish_id: publishId }),
  });
}

async function pollUntilDone(token, publishId, { intervalMs = 2000, timeoutMs = 60000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await getPublishStatus(token, publishId);
    if (status.status === 'PUBLISH_COMPLETE' || status.status === 'FAILED') {
      return status;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Timed out waiting for TikTok to finish processing the post.');
}

window.TikTokClient = {
  getCreatorInfo,
  initVideoPublish,
  uploadVideoFile,
  getPublishStatus,
  pollUntilDone,
};
