document.addEventListener('DOMContentLoaded', () => {
  // Create the theme toggle button
  const themeToggleButton = document.createElement('button');
  themeToggleButton.classList.add('theme-toggle');
  themeToggleButton.id = 'theme-toggle';
  themeToggleButton.innerHTML = `
    <!-- Day Icon -->
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bi bi-sun-fill toggle-icon sun hide-in-dark" viewBox="0 0 16 16">
      <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708"/>
    </svg>
    <!-- Night Icon -->
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bi bi-moon-fill toggle-icon moon hide-in-light" viewBox="0 0 16 16">
      <path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278"/>
    </svg>
  `;
  document.body.appendChild(themeToggleButton);

  // Add event listener for theme toggle
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    document.body.classList.toggle('light-theme');
    updateIcons();
    saveTheme();
  });

  // Update icons based on the current theme
  function updateIcons() {
    const isDark = document.body.classList.contains('dark-theme');
    const sunIcon = document.querySelector('.toggle-icon.sun') as HTMLElement;
    const moonIcon = document.querySelector('.toggle-icon.moon') as HTMLElement;
    if (sunIcon && moonIcon) {
      sunIcon.style.display = isDark ? 'none' : 'block';
      moonIcon.style.display = isDark ? 'block' : 'none';
    }
  }

  // Save the current theme to localStorage
  function saveTheme() {
    const theme = document.body.classList.contains('dark-theme')
      ? 'dark'
      : 'light';
    localStorage.setItem('theme', theme);
  }

  // Load the theme from localStorage
  function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      document.body.classList.add(
        savedTheme === 'dark' ? 'dark-theme' : 'light-theme'
      );
    } else {
      document.body.classList.add('light-theme'); // Default to light theme
    }
  }

  // Initialize theme on page load
  loadTheme();
  updateIcons();

  // Add dynamic theme styles
  const style = document.createElement('style');
  style.innerHTML = `
    body.light-theme {
      background-color: #ffffff;
      color: #000000;
    }
    body.dark-theme {
      background-color: #121212;
      color: #ffffff;
    }
    .theme-toggle {
      position: fixed;
      bottom: 1rem;
      left: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      background-color: #f0f0f0;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      transition: background-color 0.3s, transform 0.3s;
    }
    .theme-toggle:hover {
      transform: scale(1.1);
    }
    .theme-toggle .toggle-icon {
      width: 1.5rem;
      height: 1.5rem;
    }
    .theme-toggle .toggle-icon.sun {
      color: #f39c12;
    }
    .theme-toggle .toggle-icon.moon {
      color: #3498db;
    }
    .hide-in-dark .sun,
    .hide-in-light .moon {
      display: none;
    }
    body.dark-theme .theme-toggle .hide-in-dark {
      display: none;
    }
    body.light-theme .theme-toggle .hide-in-light {
      display: none;
    }

    /* Additional Dark Theme Styles */
    body.dark-theme .jumbotron {
      background-color: #1e1e1e;
      color: #ffffff;
    }
    body.dark-theme .card {
      background-color: #2a2a2a;
      color: #ffffff;
    }
    body.dark-theme .card-header {
      background-color: #333333;
      color: #ffffff;
    }
    body.dark-theme .btn-primary {
      background-color: #3a3a3a;
      border-color: #555555;
    }
    body.dark-theme .btn-primary:hover {
      background-color: #4a4a4a;
      border-color: #666666;
    }
    body.dark-theme input[type="text"] {
      background-color: #3a3a3a;
      color: #ffffff;
      border-color: #555555;
    }
    body.dark-theme .filter-option {
      background-color: #2a2a2a;
      color: #ffffff;
    }
    body.dark-theme .filter-option:hover {
      background-color: #3a3a3a;
    }
    body.dark-theme table {
      background-color: #2a2a2a;
      color: #ffffff;
      border-color: #555555;
    }
    body.dark-theme table th,
    body.dark-theme table td {
      background-color: #2a2a2a;
      color: #ffffff;
    }
    body.dark-theme table th {
      background-color: #333333;
    }
    body.dark-theme .list-group {
      background-color: #2a2a2a;
      color: #ffffff;
    }
    body.dark-theme .list-group-item {
      background-color: #2a2a2a;
      color: #ffffff;
    }
    body.dark-theme .list-group-item-action {
      background-color: #2a2a2a;
      color: #ffffff;
    }
    body.dark-theme .list-group-item-action:hover {
      background-color: #3a3a3a;
    }
    body.dark-theme .list-min-padding {
      background-color: #2a2a2a;
      color: #ffffff;
    }
    body.dark-theme img {
      filter: invert(0.8) contrast(1.2);
    }

    body.dark-theme pre {
      color: #ffffff;
    }

    body.dark-theme filter-header {
      color: #ffffff;
    }

    body.dark-theme .branch-filter-sidebar {
      background-color: #2a2a2a;
      color: #ffffff;
    }

    body.dark-theme .filter-options {
      background-color: #2a2a2a;
      color: #ffffff;
    }

    body.dark-theme ::-webkit-scrollbar {
      width: 12px;
    }
    body.dark-theme ::-webkit-scrollbar-thumb {
      background-color: #333333;
    }
    body.dark-theme ::-webkit-scrollbar-thumb:hover {
      background-color: #444444;
    }
    body.dark-theme ::-webkit-scrollbar-track {
      background-color: #2a2a2a;
    } 
    


  `;
  document.head.appendChild(style);
});
