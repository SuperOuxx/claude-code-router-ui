import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const GeminiLogo = ({ className = 'w-5 h-5' }) => {
  const { isDarkMode } = useTheme();

  return (
    <img
      src={isDarkMode ? "/icons/gemini-white.svg" : "/icons/gemini.svg"}
      alt="Gemini"
      className={className}
    />
  );
};

export default GeminiLogo;
