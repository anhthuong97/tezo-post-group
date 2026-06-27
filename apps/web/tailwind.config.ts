import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1877f2', hover: '#1664d8' },
      },
    },
  },
  plugins: [],
};

export default config;
