/** @type {import('next').NextConfig} */
const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');

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