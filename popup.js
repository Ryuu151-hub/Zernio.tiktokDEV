const loggedOutView = document.getElementById('loggedOutView');
const loggedInView = document.getElementById('loggedInView');
const accountEl = document.getElementById('account');
const statusEl = document.getElementById('status');
const profileSelect = document.getElementById('profileSelect');
const privacySelect = document.getElementById('privacySelect');
const fileInput = document.getElementById('fileInput');
const captionInput = document.getElementById('captionInput');

function setStatus(text) {
  statusEl.textContent = text || '';
}

function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || 'Unknown error'));
        return;
      }
      resolve(response);
    });
  });
}

async function loadCreatorInfo() {
  const { token } = await sendMessage('GET_VALID_TOKEN');
  const info = await window.TikTokClient.getCreatorInfo(token);

  accountEl.textContent = `Posting as: ${info.creator_nickname || info.creator_username || 'TikTok user'}`;

  privacySelect.innerHTML = '';
  (info.privacy_level_options || []).forEach((level) => {
    const opt = document.createElement('option');
    opt.value = level;
    opt.textContent = level.replaceAll('_', ' ');
    privacySelect.appendChild(opt);
  });

  document.getElementById('disableComment').checked = !!info.comment_disabled;
  document.getElementById('disableDuet').checked = !!info.duet_disabled;
  document.getElementById('disableStitch').checked = !!info.stitch_disabled;
}

async function loadZernioProfiles() {
  const res = await fetch(`${BACKEND_URL}/api/zernio/profiles`);
  const data = await res.json();

  if (res.status === 402) {
    profileSelect.innerHTML = '<option value="">(billing action required)</option>';
    setStatus(`Zernio: ${data.error}${data.dashboard_url ? `\n${data.dashboard_url}` : ''}`);
    return;
  }
  if (!res.ok) {
    setStatus(`Zernio profile list failed: ${data.error}`);
    return;
  }

  profileSelect.innerHTML = '';
  (data.profiles || []).forEach((profile) => {
    const opt = document.createElement('option');
    opt.value = profile._id;
    opt.textContent = profile.name;
    profileSelect.appendChild(opt);
  });
}

async function refreshLoggedInUI() {
  setStatus('Loading account info...');
  try {
    await Promise.all([loadCreatorInfo(), loadZernioProfiles()]);
    setStatus('');
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

async function init() {
  const { auth } = await sendMessage('GET_AUTH');
  if (auth) {
    loggedOutView.style.display = 'none';
    loggedInView.style.display = 'block';
    refreshLoggedInUI();
  } else {
    loggedOutView.style.display = 'block';
    loggedInView.style.display = 'none';
  }
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  setStatus('Opening TikTok login...');
  try {
    await sendMessage('LOGIN');
    loggedOutView.style.display = 'none';
    loggedInView.style.display = 'block';
    await refreshLoggedInUI();
  } catch (err) {
    setStatus(`Login failed: ${err.message}`);
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await sendMessage('LOGOUT');
  loggedOutView.style.display = 'block';
  loggedInView.style.display = 'none';
  setStatus('Logged out.');
});

document.getElementById('postBtn').addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    setStatus('Choose a video file first.');
    return;
  }
  const privacyLevel = privacySelect.value;
  if (!privacyLevel) {
    setStatus('No privacy level available — reload and try again.');
    return;
  }

  const postBtn = document.getElementById('postBtn');
  postBtn.disabled = true;

  try {
    setStatus('Getting a fresh access token...');
    const { token } = await sendMessage('GET_VALID_TOKEN');

    setStatus('Starting upload with TikTok...');
    const init = await window.TikTokClient.initVideoPublish(token, {
      title: captionInput.value,
      privacyLevel,
      videoSize: file.size,
      disableComment: document.getElementById('disableComment').checked,
      disableDuet: document.getElementById('disableDuet').checked,
      disableStitch: document.getElementById('disableStitch').checked,
    });

    setStatus('Uploading video file...');
    await window.TikTokClient.uploadVideoFile(init.upload_url, file);

    setStatus('Waiting for TikTok to process the post...');
    const finalStatus = await window.TikTokClient.pollUntilDone(token, init.publish_id);

    if (finalStatus.status === 'PUBLISH_COMPLETE') {
      setStatus('Posted! Check your TikTok profile.');
    } else {
      setStatus(`TikTok reported: ${finalStatus.status}${finalStatus.fail_reason ? ` (${finalStatus.fail_reason})` : ''}`);
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  } finally {
    postBtn.disabled = false;
  }
});

init();
