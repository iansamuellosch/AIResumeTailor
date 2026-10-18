"use client";
import { useEffect, useState } from "react";
import { getDatabase, openDatabase } from "@/lib/storage/database";
export function StorageStatus() {
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function initialize() {
      try { await openDatabase(getDatabase()); }
      catch (error) { if (active) setError(error instanceof Error ? error.message : "Local storage is unavailable."); }
    }
    void initialize();
    return () => { active = false; };
  }, []);
  return error ? <p role="alert" className="mb-6 text-sm text-destructive">{error}</p> : null;
}
