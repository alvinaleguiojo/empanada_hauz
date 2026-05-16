export function ThemeScript() {
  const code = `
    const saved = localStorage.getItem('empanada-theme');
    const theme = saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
  `;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
