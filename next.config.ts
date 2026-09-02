import type { NextConfig } from 'next';

// Chrome's WebMCP origin trial (Chrome 149+) turns the API on for this origin without the flag.
// The token is tied to the deployed origin and safe to publish; it is read from the environment
// so the same code runs on preview and production hosts without one.
const originTrialToken = process.env.WEBMCP_ORIGIN_TRIAL_TOKEN;

const nextConfig: NextConfig = {
  async headers() {
    if (!originTrialToken) return [];
    return [{ source: '/:path*', headers: [{ key: 'Origin-Trial', value: originTrialToken }] }];
  },
};

export default nextConfig;
