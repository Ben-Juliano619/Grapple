"use client";

import { useEffect } from "react";
import { setupNativeChrome } from "./lib/native";

export default function NativeSetup() {
  useEffect(() => {
    setupNativeChrome();
  }, []);
  return null;
}
