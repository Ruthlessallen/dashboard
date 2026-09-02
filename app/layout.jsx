import './globals.css';

export const metadata = {
  title: 'Dashboard · Ruth',
  description: 'Gmail, Calendar, noticias de IA/data/web y checklists en un solo sitio',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
