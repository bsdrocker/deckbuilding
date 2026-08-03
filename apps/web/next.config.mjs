/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Card images are served from Scryfall's CDN.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cards.scryfall.io' }],
  },
};

export default nextConfig;
