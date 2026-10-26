/** @type {import('next').NextConfig} */
let targetApi = (process.env.API_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');

// If API_URL points to the public Render URL or if on Render, use local internal port 4000
if (
  (process.env.RENDER_EXTERNAL_URL && targetApi === process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '')) ||
  targetApi.includes('zecapturescheduler.onrender.com') ||
  targetApi === 'http://localhost:4000'
) {
  targetApi = 'http://127.0.0.1:4000';
}

const API_URL = targetApi;

// every address on common home networks: 192.168.1.1-254 and 192.168.0.1-254
const lan = ['192.168.1', '192.168.0'].flatMap((p) =>
  Array.from({ length: 254 }, (_, i) => `${p}.${i + 1}`)
);

module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: [...lan, '10.167.43.207', '*.local'],
  turbopack: { root: __dirname },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};