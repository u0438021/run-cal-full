import "./styles.css";
import Script from "next/script";
export const metadata = { title: "Running Data Analytics" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="th"><body>
    <Script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js" strategy="beforeInteractive" />
    <Script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js" strategy="beforeInteractive" />
    <Script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js" strategy="beforeInteractive" />
    <Script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-storage-compat.js" strategy="beforeInteractive" />
    {children}
  </body></html>;
}
