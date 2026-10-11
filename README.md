# Social Hub

A small workspace for preparing posts and getting a second pair of eyes.

Paste an image, add a caption and planned date, preview it, then copy a private approval link. The reviewer can approve or request changes without an account. Approved posts appear in Up Next; completed posts move to the archive.

Originals and drafts stay in IndexedDB in your browser. Only the selected JPEG review copy and its details are shared. Links expire after seven days and can be revoked. The shared service allows 20 active links with review images up to 512 KB; originals stay local. Anyone holding a review link can submit one response; reviewer names are optional and unverified.

The browser app needs no build step or third-party libraries. Export a backup before clearing browser data or moving to another browser. Backups contain private link-management keys; keep them private.

The hosted app uses GitHub Pages. Its isolated approval service uses the existing Supabase Free project and Supabase Edge Functions with capability authentication. Its database table has row-level security enabled and is inaccessible to browser roles. The server-only service key comes from the Edge runtime environment and is never included in the app.

`approval.mjs` implements the API, `supabase-bucket.mjs` provides atomic database storage, `supabase-edge.ts` is the function entrypoint, and `supabase-schema.sql` creates the isolated storage objects. No other application's tables are modified.

Social feed previews approximate single-image posts. Automatic social publishing is not included.

### Profile preview
A quiet footer utility for trying a profile photo with an Instagram story ring
and Notes bubble. Paste, upload or drop an image; adjust zoom and position.
Photo and settings stay in a separate IndexedDB store on this device and are
not uploaded or included in post backups.
