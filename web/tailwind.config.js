/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主强调色：蓝靛系，对标 MankTV 视觉（白色 + 浅蓝色）
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        // 渐变品牌色：按钮/标题文字的蓝→浅蓝过渡
        accent: {
          start: '#3B82F6',
          end: '#60A5FA',
        },
        // 各功能区独立强调色（对标参考站）
        novel: {
          50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE', 300: '#A5B4FC',
          400: '#818CF8', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA',
          DEFAULT: '#6366F1',
        },
        image: {
          50: '#ECFEFF', 100: '#CFFAFE', 200: '#A5F3FC', 300: '#67E8F9',
          400: '#22D3EE', 500: '#06B6D4', 600: '#0891B2', 700: '#0E7490',
          DEFAULT: '#0891B2',
        },
        audio: {
          50: '#FDF2F8', 100: '#FCE7F3', 200: '#FBCFE8', 300: '#F9A8D4',
          400: '#F472B6', 500: '#EC4899', 600: '#DB2777', 700: '#BE185D',
          DEFAULT: '#EC4899',
        },
        video: {
          50: '#FFFBEB', 100: '#FEF3C7', 200: '#FDE68A', 300: '#FCD34D',
          400: '#FBBF24', 500: '#F59E0B', 600: '#D97706', 700: '#B45309',
          DEFAULT: '#D97706',
        },
        community: {
          50: '#F0FDF4', 100: '#DCFCE7', 200: '#BBF7D0', 300: '#86EFAC',
          400: '#4ADE80', 500: '#22C55E', 600: '#16A34A', 700: '#15803D',
          DEFAULT: '#16A34A',
        },
        // 漫画板块：紫罗兰系（与 FeatureLanding ACCENTS.comic 对齐）
        comic: {
          50: '#F5F3FF', 100: '#EDE9FE', 200: '#DDD6FE', 300: '#C4B5FD',
          400: '#A78BFA', 500: '#8B5CF6', 600: '#7C3AED', 700: '#6D28D9',
          DEFAULT: '#7C3AED',
        },
        // 中性色：偏冷的灰，SaaS 标配
        ink: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: ['"SF Mono"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgba(17, 24, 39, 0.04), 0 1px 3px 0 rgba(17, 24, 39, 0.06)',
        card: '0 4px 6px -1px rgba(17, 24, 39, 0.05), 0 2px 4px -2px rgba(17, 24, 39, 0.05)',
        pop: '0 10px 25px -5px rgba(124, 58, 237, 0.15), 0 8px 10px -6px rgba(124, 58, 237, 0.1)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      animation: {
        'fade-up': 'fadeUp 0.5s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
}
