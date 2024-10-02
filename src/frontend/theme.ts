/*!
 * Based on:
 * Color mode toggler for Bootstrap's docs (https://getbootstrap.com/)
 * Copyright 2011-2024 The Bootstrap Authors
 * Licensed under the Creative Commons Attribution 3.0 Unported License.
 */

function getStoredTheme(): string | null {
  return localStorage.getItem('theme');
}

function setStoredTheme(theme: string) {
  localStorage.setItem('theme', theme);
}

function getSystemPreferredTheme(): string {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getPreferredTheme(): string {
  const storedTheme = getStoredTheme();
  if (storedTheme) {
    return storedTheme;
  }

  return getSystemPreferredTheme();
}

function setTheme(theme: string) {
  document.documentElement.setAttribute('data-bs-theme', theme);
}

function showActiveTheme(theme: string) {
  const themeSwitcher = document.querySelector('#theme-switcher');

  if (!themeSwitcher) {
    return;
  }

  const themeIcons = document.querySelectorAll('.theme-icon');
  for (const themeIcon of themeIcons) {
    themeIcon.classList.remove('active');
  }

  const iconToActivate = document.querySelector(`#theme-icon-${theme}`);

  if (!iconToActivate) {
    return;
  }

  iconToActivate.classList.add('active');
}

function toggleTheme() {
  const themeIcons = document.querySelectorAll('.theme-icon');

  let currentTheme = getPreferredTheme(); // that's the fallback

  // let's see what the current user setting is
  for (const themeIcon of themeIcons) {
    if (themeIcon.classList.contains('active')) {
      if (themeIcon.id === 'theme-icon-light') {
        currentTheme = 'light';
      } else {
        currentTheme = 'dark';
      }
      break;
    }
  }

  // flip the theme
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';

  setStoredTheme(newTheme);
  setTheme(newTheme);
  showActiveTheme(newTheme);
}

(() => {
  setTheme(getPreferredTheme());

  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      const newTheme = getSystemPreferredTheme();
      setTheme(newTheme);
      showActiveTheme(newTheme);
    });

  window.addEventListener('DOMContentLoaded', () => {
    showActiveTheme(getPreferredTheme());

    const themeSwitcher = document.querySelector('#theme-switcher');
    if (!themeSwitcher) {
      return;
    }

    themeSwitcher.addEventListener('click', toggleTheme);
  });
})();
