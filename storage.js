(function (root) {
  'use strict';
  let db;
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('social-hub', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('posts', { keyPath: 'id' });
      request.onsuccess = () => { db = request.result; db.onversionchange = () => db.close(); resolve(); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other NextSocial tabs, then reload.'));
    });
  }
  function all() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('posts', 'readonly');
      const r = tx.objectStore('posts').getAll();
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Storage read was interrupted.'));
    });
  }
  function addMany(posts) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('posts', 'readwrite');
      for (const post of posts) tx.objectStore('posts').add(post);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Nothing was saved. Please try again.'));
    });
  }
  // Read and mutate inside one transaction to avoid stale updates across tabs.
  function update(id, mutate) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('posts', 'readwrite');
      const store = tx.objectStore('posts');
      const r = store.get(id); let result, failure;
      r.onsuccess = () => {
        try {
          if (!r.result) throw new Error('This post no longer exists.');
          result = mutate(r.result);
          if (result) store.put(result); else store.delete(id);
        } catch (e) { failure = e; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(failure || tx.error || new Error('Save was interrupted.'));
    });
  }
  // Merge atomically. Existing IDs always win, so importing never overwrites work.
  function merge(posts) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('posts', 'readwrite');
      const store = tx.objectStore('posts'); let added = 0;
      for (const post of posts) {
        const r = store.get(post.id);
        r.onsuccess = () => { if (!r.result) { store.add(post); added++; } };
      }
      tx.oncomplete = () => resolve(added);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Import was interrupted. No posts were added.'));
    });
  }
  root.PostStore = { open, all, addMany, update, merge };
})(window);
