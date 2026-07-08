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
  $('html').attr('data-bs-theme', theme);
}

function showActiveTheme(theme: string) {
  const themeSwitcher = $('#theme-switcher');
  if (themeSwitcher.length === 0) {
    return;
  }

  $('.theme-icon').removeClass('active');
  $(`#theme-icon-${theme}`).addClass('active');
}

function toggleTheme() {
  const themeIcons = $('.theme-icon');

  let currentTheme = getPreferredTheme(); // that's the fallback

  // let's see what the current user setting is
  const activeThemeIcon = themeIcons.filter('.active').first();
  if (activeThemeIcon.length > 0) {
    if (activeThemeIcon.attr('id') === 'theme-icon-light') {
      currentTheme = 'light';
    } else {
      currentTheme = 'dark';
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

  $(() => {
    showActiveTheme(getPreferredTheme());
    $('#theme-switcher').on('click', toggleTheme);
  });
})();
