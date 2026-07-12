"use client";

import { createContext, useContext, useState } from "react";

interface SidebarState {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}

export function SidebarProvider({
  initialCollapsed,
  children,
}: {
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsedState] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persist across visits in a cookie so the server can render the rail in the
  // remembered state (no flash of the wrong width on load).
  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    document.cookie = `hh-sidebar=${v ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}
