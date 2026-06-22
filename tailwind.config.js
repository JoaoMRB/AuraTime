/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        luxury: {
          gold: '#D4AF37',
          emerald: '#0A3B1F',
          darkEmerald: '#052211',
          platinum: '#E5E4E2',
          bronze: '#CD7F32',
          charcoal: '#0C0F0D',
          mint: '#D8F3DC',
        }
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        playfair: ['Playfair Display', 'serif'],
        outfit: ['Outfit', 'sans-serif'],
        inter: ['Inter', 'sans-serif']
      },
      animation: {
        'liquid-slow': 'liquid 25s ease-in-out infinite alternate',
        'liquid-fast': 'liquid 15s ease-in-out infinite alternate',
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-out': 'fadeOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        liquid: {
          '0%': { transform: 'translate(0px, 0px) scale(1) rotate(0deg)' },
          '33%': { transform: 'translate(40px, -60px) scale(1.2) rotate(120deg)' },
          '66%': { transform: 'translate(-30px, 30px) scale(0.85) rotate(240deg)' },
          '100%': { transform: 'translate(0px, 0px) scale(1) rotate(360deg)' }
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(15px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        fadeOut: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(15px)' }
        }
      }
    },
  },
  plugins: [],
}

