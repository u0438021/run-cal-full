import "./styles.css";
import Script from "next/script";
import PwaRegister from "./pwa-register";

export const metadata = {
  title: "RUN | CAL",
  description: "วิเคราะห์ข้อมูลการวิ่งจากไฟล์ FIT",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};
export const viewport = { themeColor: "#f45125" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="th"><body>
    <Script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js" strategy="beforeInteractive" />
    <Script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js" strategy="beforeInteractive" />
    <Script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js" strategy="beforeInteractive" />
    <Script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-storage-compat.js" strategy="beforeInteractive" />
    <PwaRegister />
    {children}
  </body></html>;
}
