"use client";

import { FormEvent, useEffect, useState } from "react";

import { useTheme } from "@/components/theme-provider";
import { getSettings, saveApiKey } from "@/lib/api";

export default function SettingsPage() {
  const { mode, setMode } = useTheme();
  const [apiKey, setApiKey] = useState("");
  const [masked, setMasked] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const settings = await getSettings();
        if (mounted) {
          setMasked(settings.masked_api_key);
        }
      } catch {
        if (mounted) setStatus("Failed to load settings.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!apiKey.trim()) {
      setStatus("Enter a valid API key.");
      return;
    }
    setStatus("Saving API key...");

    try {
      const result = await saveApiKey(apiKey.trim());
      setMasked(result.masked_api_key);
      setApiKey("");
      setStatus("API key saved and masked.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="h2 mono">Settings</h2>
        <p className="b2 text-muted">Manage model key and display mode.</p>
      </header>

      <div className="panel grid gap-6 p-5 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="label">Display Mode</p>
          <div className="flex gap-2">
            <button
              type="button"
              className={`btn ${mode === "dark" ? "btn-primary" : "btn-muted"}`}
              onClick={() => setMode("dark")}
            >
              Dark
            </button>
            <button
              type="button"
              className={`btn ${mode === "light" ? "btn-primary" : "btn-muted"}`}
              onClick={() => setMode("light")}
            >
              Light
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="label">Model</p>
          <p className="panel-strong b2 rounded-xl px-3 py-2">nvidia/nemotron-3-nano-30b-a3b</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="panel max-w-3xl space-y-4 p-5">
        <p className="label">NVIDIA API Key</p>
        <input
          type="password"
          className="input"
          value={apiKey}
          placeholder={masked ? "Enter new key to replace existing key" : "nvapi-..."}
          onChange={(event) => setApiKey(event.target.value)}
        />

        {!isLoading && masked && (
          <p className="b2 text-muted">
            Saved key: <span className="mono">{masked}</span>
          </p>
        )}

        <button className="btn btn-primary" type="submit">
          Save Key
        </button>

        {status && <p className="b2 text-muted">{status}</p>}
      </form>
    </section>
  );
}
