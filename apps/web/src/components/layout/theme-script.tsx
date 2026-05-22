export function ThemeScript() {
  const code = `
    localStorage.setItem('empanada-theme', 'dark');
    document.documentElement.classList.add('dark');
  `;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
