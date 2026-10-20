import type { Config } from 'tailwindcss';

// Same palette used in the original single-file app, so the look carries over.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F8F5FF',
        surface: '#FFFFFF',
        surfaceAlt: '#EDE7FF',
        textPrimary: '#3F2A72',
        textSecondary: '#817895',
        accent: '#6C4CC7',
        accentDark: '#5636A8',
        income: '#2FA968',
        incomeBg: '#E1F5EA',
        expense: '#E5484D',
        expenseBg: '#FCE6E7',
        warn: '#C98A2B',
        warnBg: '#FBF0DC',
        info: '#2569C4',
        infoBg: '#E3EEFD',
        border: '#E4DCFA',
      },
      fontFamily: {
        sans: ['"Noto Sans Thai"', 'sans-serif'],
        serif: ['"Noto Serif Thai"', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
