<p align="center">
  <img src="icon.svg" width="80" height="80" alt="NextSocial icon">
</p>

<h1 align="center">NextSocial</h1>

<p align="center">Good things come next.</p>

<p align="center">
  <a href="https://leolunelove.github.io/NextSocial/">Open NextSocial</a> ·
  <a href="#get-started">Using NextSocial</a> ·
  <a href="#run-locally">Run locally</a>
</p>

## Paste, preview, get a yes

- **Start with an image.** Paste, drag and drop, or choose a file. NextSocial detects its dimensions and suggests suitable platforms.
- **Add the details.** Write a caption, choose a platform, and add an optional planned date. Drafts save on this device.
- **See the post.** Switch between Instagram, LinkedIn, X, and Facebook previews. The editor and approval page use the same layouts, including platform-specific image proportions.
- **Get a second look.** Create a private approval link and send it yourself. The reviewer can approve or request changes without an account.
- **Keep moving.** Pending holds drafts and reviews. Approved posts move to Up Next, ordered by date. Today counts approved posts planned for the current day; Mark as Posted moves finished work into the archive.
- **Make it comfortable.** Clear Sky styling, readable text, compact mobile previews, and approval actions that stay within reach.
- **Keep a copy.** Export and import a backup of your local posts. The quiet Profile preview tool lets you try a photo with an Instagram story ring and Notes bubble.

## Get started

1. [Open NextSocial](https://leolunelove.github.io/NextSocial/) and paste an image or choose **Add**.
2. Fill in the title, caption, platform, and optional date. Open **Preview** to check the post.
3. Choose **Create approval link**, copy it, and send it to your reviewer. You can also choose **Approve myself**.
4. Once approved, find the post in **Up Next**. Publish it yourself, then choose **Mark as Posted**.

NextSocial organises posts and approvals. It does not publish to social platforms automatically.

## Your posts and approval links

Original images and drafts stay in IndexedDB in the browser where you create them. There are no accounts or cross-device workspace syncing. Export a backup before clearing site data or moving browsers. Local posts do not transfer automatically between website addresses.

Creating an approval link uploads a JPEG review copy and that version of the post details. Originals stay local. Links expire after seven days and can be revoked. Anyone holding a link can submit one response; optional reviewer names are not verified. A shared version stays fixed until you edit and replace its link.

The shared service allows 20 active links, with review images up to 512 KB. Keep exported backups private: they contain link-management keys as well as your content.

Profile preview photos and settings stay on this device in a separate store. They are not uploaded or included in post backups.

## Run locally

The browser app uses plain HTML, CSS, and JavaScript, with no frontend dependencies or build step.

```sh
git clone https://github.com/leolunelove/NextSocial.git
cd NextSocial
python3 -m http.server 8080
```

Open [localhost:8080](http://127.0.0.1:8080/). Local drafts work in this browser. Approval links require the configured shared review service and point reviewers to the hosted app; running the static files does not start a local approval backend.

## Repository guide

| Path | Purpose |
| --- | --- |
| [index.html](index.html) | Workspace and editor structure |
| [style.css](style.css) | Clear Sky styling and responsive layouts |
| [app.js](app.js) | Workspace interactions and shared social previews |
| [core.js](core.js) | Post states, dates, platform suggestions, and image ratios |
| [storage.js](storage.js) | Local IndexedDB persistence |
| [sharing.js](sharing.js) | Approval links, reviewer feedback, and confirmations |
| [profile.js](profile.js) | Local profile photo preview tool |
| [icon.svg](icon.svg) | App icon |
| [approval.mjs](approval.mjs) | Review API and validation |
| [supabase-bucket.mjs](supabase-bucket.mjs) | Atomic shared review storage |
| [supabase-edge.ts](supabase-edge.ts) | Hosted review function entrypoint |
| [supabase-schema.sql](supabase-schema.sql) | Isolated review tables and permissions |

GitHub Pages hosts the static app from this repository. The approval service is deployed separately; uploading these files to Pages does not deploy that service.

## Built with

HTML, CSS, and JavaScript, with IndexedDB for local drafts and Supabase Edge Functions and PostgreSQL for selected review copies. Shared review tables use row-level security and are inaccessible to browser database roles. Server credentials stay in the function environment, outside the app.

Feed previews approximate single-image posts; social platforms may render them differently. Previously Social Hub. The repository and Pages app now use NextSocial. Browser storage does not move automatically from the old address. The current approval-link generator still targets the former /social-hub/ address and needs updating before new links are relied on.
