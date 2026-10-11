/* Pure domain rules. Storage and UI are deliberately separate from approval rules. */
(function (root) {
  'use strict';
  const platforms = ['Instagram', 'LinkedIn', 'X', 'Facebook'];
  const statuses = ['pending', 'approved', 'posted'];
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const limits = { image: 20 * 1024 * 1024, backup: 250 * 1024 * 1024, records: 1000 };
  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function validDate(value) {
    if (value === '') return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T12:00:00');
    return !isNaN(d) && dateKey(d) === value;
  }
  function dateLabel(value, now = new Date()) {
    if (!value) return 'Unscheduled';
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    if (value === dateKey(now)) return 'Today';
    if (value === dateKey(tomorrow)) return 'Tomorrow';
    return new Date(value + 'T12:00:00').toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', ...(value.slice(0, 4) !== String(now.getFullYear()) ? { year: 'numeric' } : {})
    });
  }
  function ratioLabel(width, height) {
    const presets = [[1,1],[4,5],[3,4],[9,16],[16,9],[3,2],[2,3],[4,3],[1.91,1],[2,1],[3,1]];
    const match = presets.find(([w,h]) => Math.abs(width / height - w / h) < 0.015);
    return match ? match.join(':') : `${(width / height).toFixed(2)}:1`;
  }
  function suggested(width, height) {
    const r = width / height;
    if (r >= 0.75 && r <= 1.05) return ['Instagram', 'Facebook', ...(r >= .8 ? ['LinkedIn'] : []), 'X'];
    if (r > 1.05 && r <= 2) return ['LinkedIn', 'X', 'Facebook', ...(r <= 1.91 ? ['Instagram'] : [])];
    if (r > 2 && r <= 3) return ['LinkedIn', 'Facebook'];
    return ['Facebook'];
  }
  function previewRatio(platform, width, height) {
    const r = width / height;
    const ranges = { Instagram: [.75, 1.91], LinkedIn: [.8, 3], X: [.75, 2], Facebook: [.75, 2] };
    const [min, max] = ranges[platform];
    return Math.min(max, Math.max(min, r));
  }
  function sortPosts(posts, status) {
    return posts.filter(p => p.status === status).sort((a,b) => status === 'approved'
      ? (a.plannedDate || '9999').localeCompare(b.plannedDate || '9999') || a.createdAt.localeCompare(b.createdAt)
      : status === 'posted' ? (b.postedAt || '').localeCompare(a.postedAt || '') : b.createdAt.localeCompare(a.createdAt));
  }
  function transition(post, action, now = new Date().toISOString()) {
    const expected = { approve: 'pending', post: 'approved', restore: 'posted', unapprove: 'approved' };
    const next = { approve: 'approved', post: 'posted', restore: 'pending', unapprove: 'pending' };
    if (post.status !== expected[action]) throw new Error('This post has changed. Please try again.');
    return { ...post, status: next[action], updatedAt: now, approvedAt: action === 'approve' ? now : action === 'post' ? post.approvedAt : null, postedAt: action === 'post' ? now : null };
  }
  function edit(post, patch, now = new Date().toISOString()) {
    if (post.status === 'posted') throw new Error('Move this post to Pending before editing it.');
    const safe = {};
    for (const key of ['title', 'caption', 'platform', 'plannedDate']) if (Object.hasOwn(patch, key)) safe[key] = patch[key];
    const changed = Object.keys(safe).some(k => safe[k] !== post[k]);
    return changed ? { ...post, ...safe, updatedAt: now, status: 'pending', approvedAt: null } : post;
  }
  function validateRecord(p) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !/^[\w-]{1,100}$/.test(p.id)) throw new Error('Invalid post identifier.');
    for (const [key, max] of [['title',200],['caption',20000],['filename',300]]) if (typeof p[key] !== 'string' || p[key].length > max) throw new Error(`Invalid ${key} in backup.`);
    if (!platforms.includes(p.platform) || !statuses.includes(p.status) || !validDate(p.plannedDate)) throw new Error('Invalid platform, status, or date in backup.');
    for (const key of ['createdAt', 'updatedAt']) if (typeof p[key] !== 'string' || !Number.isFinite(Date.parse(p[key]))) throw new Error('Invalid timestamp in backup.');
    for (const key of ['approvedAt','postedAt']) if (p[key] != null && (typeof p[key] !== 'string' || !Number.isFinite(Date.parse(p[key])))) throw new Error('Invalid timestamp in backup.');
    if (p.status === 'posted' && !p.postedAt) throw new Error('Posted date is missing.');
    return p;
  }
  const api = { platforms, statuses, imageTypes, limits, dateKey, validDate, dateLabel, ratioLabel, suggested, previewRatio, sortPosts, transition, edit, validateRecord };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Hub = api;
})(typeof window !== 'undefined' ? window : globalThis);
