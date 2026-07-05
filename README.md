# Zernio TikTok Uploader

A clean, ToS-compliant TikTok posting flow: a small Vercel backend for
TikTok Login Kit (OAuth) + Zernio profile management, and a companion
Chrome extension that lets you log in with TikTok and post a video straight
from your browser using **TikTok's official Content Posting API**.

## What changed from the original extension

The extension you uploaded (`1dleryu-x-tiktok`) patched MP4 files with
fabricated video-sample data to defeat TikTok's own upload/detection
systems, and injected a promotional signature into every caption that it
actively re-inserted if you removed it. None of that is here. This project
instead:

- Uses `chrome.identity.launchWebAuthFlow` + TikTok's real OAuth endpoints
  to log in (`lib/tiktok.js`, `background.js`)
- Uploads your video file as-is, with metadata exactly as you typed it, via
  `POST /v2/post/publish/video/init/` and the returned `upload_url`
  (`extension/tiktok-client.js`)
- Never touches your video bytes or caption

**One real constraint to know about:** TikTok requires apps to pass a
Content Posting audit before public posts are allowed. Until then, every
post your `client_key` makes is forced to `SELF_ONLY` visibility by TikTok
itself, regardless of what privacy level you pick in the popup. This is not
a bug in the code — see TikTok's own note in the
[Content Posting API guide](https://developers.tiktok.com/doc/content-posting-api-get-started).

## Repo layout

```
api/
  auth/tiktok/login.js      GET  redirect to TikTok's consent screen
  auth/tiktok/callback.js   POST exchange auth code -> tokens
  auth/tiktok/refresh.js    POST refresh an expired access token
  auth/tiktok/revoke.js     POST revoke on logout
  zernio/profiles.js        GET/POST list/create Zernio profiles
lib/
  tiktok.js                 TikTok OAuth helper (server-side only)
  zernio.js                 Zernio API client + billing-gate handling
extension/
  manifest.json              MV3 manifest (identity + storage only)
  background.js               OAuth flow, token storage/refresh
  tiktok-client.js             Direct calls to TikTok's Content Posting API
  popup.html / popup.js       UI: login, pick profile, pick video, post
  config.js                   Set BACKEND_URL here
```

The backend is intentionally **stateless** — it never stores your TikTok
tokens in a database. It only does the two things that require a secret
(exchanging a code for tokens, and refreshing a token); the tokens
themselves live in the extension's `chrome.storage.local`.

## 1. Register a TikTok app

1. Go to [developers.tiktok.com](https://developers.tiktok.com) → Manage apps → Create app.
2. Add the **Login Kit** and **Content Posting API** products.
3. Note your `client_key` and `client_secret`.
4. You'll add a redirect URI in step 3 below (it depends on your unpacked extension's ID).
5. Request the `user.info.basic` and `video.publish` scopes for your app.
6. (Later, when you want public posts instead of `SELF_ONLY`) submit the
   app for the Content Posting audit — TikTok's UX review checks for a
   privacy-level selector, duet/stitch/comment toggles, and displaying the
   creator's username before posting. This project already includes all of that.

## 2. Deploy the backend to Vercel

```bash
npm install -g vercel   # if you don't have it
cd zernio-tiktok-uploader
vercel login
vercel
```

In the Vercel dashboard, set these environment variables (Project → Settings → Environment Variables):

| Variable | Value |
|---|---|
| `TIKTOK_CLIENT_KEY` | from the TikTok developer portal |
| `TIKTOK_CLIENT_SECRET` | from the TikTok developer portal |
| `TIKTOK_REDIRECT_URI` | `https://<your-extension-id>.chromiumapp.org/` (see step 3) |
| `ZERNIO_API_KEY` | your Zernio API key |

Then redeploy: `vercel --prod`. Copy the deployment URL, e.g.
`https://zernio-tiktok-uploader.vercel.app`.

## 3. Load the extension and get its ID

1. Chrome → `chrome://extensions` → enable Developer Mode → **Load unpacked** → select the `extension/` folder.
2. Copy the extension ID Chrome assigns it.
3. Your redirect URI is `https://<that-id>.chromiumapp.org/`. Add it as the
   `TIKTOK_REDIRECT_URI` env var on Vercel (step 2), **and** register it as
   an allowed redirect URI in the TikTok developer portal for your app.
4. Edit `extension/config.js` and `extension/manifest.json` — replace
   `YOUR-VERCEL-APP.vercel.app` with your real Vercel deployment URL in both
   places.
5. Reload the extension in `chrome://extensions`.

## 4. Try it

Click the extension icon → "Log in with TikTok" → approve → pick a Zernio
profile, choose a video file, write a caption, hit "Post to TikTok".

## Zernio billing gates

`api/zernio/profiles.js` passes through Zernio's `402` responses as-is, so
the popup can show the right message and (for `free_tier_exceeded` /
`twitter_passthrough`) a link to add a payment method, or (for
`enterprise_required`) a link to Zernio's enterprise contact page. See
`lib/zernio.js` for the `ZernioBillingError` shape.

## Pushing to GitHub

```bash
cd zernio-tiktok-uploader
git init
git add .
git commit -m "Initial commit: Zernio + TikTok Login Kit uploader"
git branch -M main
git remote add origin https://github.com/<you>/zernio-tiktok-uploader.git
git push -u origin main
```

Then connect the repo to Vercel (Import Project) instead of deploying from
the CLI, if you'd rather deploy on every push.
