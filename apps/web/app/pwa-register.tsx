"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // The application remains fully usable online if a browser blocks workers.
      });
    }
  }, []);

  return null;
}
