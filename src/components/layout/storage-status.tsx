"use client";
import { useEffect, useState } from "react";
import { getDatabase, openDatabase } from "@/lib/storage/database";
export function StorageStatus() {
  const [status, setStatus] = useState("Checking local storage…");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    async function initialize() {
      try { await openDatabase(getDatabase()); if (active) setStatus("Local storage ready · Saved on this browser"); }
      catch (error) { if (active) { setFailed(true); setStatus(error instanceof Error ? error.message : "Local storage is unavailable."); } }
    }
    void initialize();
    return () => { active = false; };
  }, []);
  return <p role={failed ? "alert" : "status"} className={failed ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>{status}</p>;
}
