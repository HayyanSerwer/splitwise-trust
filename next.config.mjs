/** @type {import('next').NextConfig} */
export default {
  // A stray lockfile in the home directory makes Next guess the wrong workspace
  // root; pin it to this project.
  outputFileTracingRoot: import.meta.dirname,
  // Browsers must always re-check the service worker so updates roll out.
  async headers() {
    return [{
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    }];
  },
};
