"use client";

import { useRef, useState } from "react";
import {
  Loader2,
  UploadCloud,
  Layers,
  Link,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { Platform, VideoRecord } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "single" | "bulk" | "url";

interface SharedFields {
  title: string;
  handle: string;
  platform: Platform | null;
}

type UploadPhase = "idle" | "uploading" | "analyzing";

type BulkFileStatus = "queued" | "uploading" | "analyzing" | "complete" | "failed";

interface BulkFile {
  id: string;
  file: File;
  title: string;
  handle: string;
  platform: Platform | null;
  status: BulkFileStatus;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function buildRecord(data: Record<string, unknown>, fields: SharedFields): VideoRecord {
  const handle = (fields.handle ?? "").trim();
  return {
    id: data.jobId as string,
    title: (fields.title ?? "").trim(),
    handle: handle.startsWith("@") ? handle : `@${handle}`,
    platform: fields.platform!,
    score: (data.score as number) ?? null,
    status: (data.status as VideoRecord["status"]) ?? "Processing",
    date: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    report: data.report as VideoRecord["report"],
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "single", label: "Single Upload", icon: UploadCloud },
  { id: "bulk", label: "Bulk Upload", icon: Layers },
  { id: "url", label: "Direct URL", icon: Link },
];

const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
]);
const ACCEPT = ".mp4,.mov,.avi,.webm";
const MAX_FILE_BYTES = 500 * 1024 * 1024;
const MAX_BULK_FILES = 10;

const SHARED_EMPTY: SharedFields = { title: "", handle: "", platform: null };

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  BulkFileStatus,
  { label: string; className: string; icon: React.ElementType }
> = {
  queued:    { label: "Queued",    className: "bg-slate-100 text-slate-600",   icon: Clock },
  uploading: { label: "Uploading", className: "bg-blue-50 text-blue-600",      icon: Loader2 },
  analyzing: { label: "Analyzing", className: "bg-purple-50 text-purple-600",  icon: Loader2 },
  complete:  { label: "Complete",  className: "bg-green-50 text-green-700",    icon: CheckCircle2 },
  failed:    { label: "Failed",    className: "bg-red-50 text-red-600",        icon: XCircle },
};

function StatusBadge({ status }: { status: BulkFileStatus }) {
  const { label, className, icon: Icon } = STATUS_CONFIG[status];
  const spinning = status === "uploading" || status === "analyzing";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
        className
      )}
    >
      <Icon className={cn("h-3 w-3", spinning && "animate-spin")} />
      {label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (video: VideoRecord) => void;
}

export function AddVideoModal({ open, onClose, onSuccess }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("single");
  const [shared, setShared] = useState<SharedFields>(SHARED_EMPTY);

  // Single Upload tab
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk Upload tab
  const [bulkFiles, setBulkFiles] = useState<BulkFile[]>([]);
  const [bulkDragOver, setBulkDragOver] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkCompleted, setBulkCompleted] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [applyHandle, setApplyHandle] = useState("");
  const [applyPlatform, setApplyPlatform] = useState<Platform | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  // Direct URL tab
  const [videoUrl, setVideoUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  const isInFlight = uploadPhase !== "idle" || bulkProcessing || urlLoading;

  function resetAll() {
    setShared(SHARED_EMPTY);
    setFile(null);
    setDragOver(false);
    setUploadPhase("idle");
    setUploadError(null);
    setBulkFiles([]);
    setBulkDragOver(false);
    setBulkProcessing(false);
    setBulkCompleted(0);
    setBulkTotal(0);
    setApplyHandle("");
    setApplyPlatform(null);
    setVideoUrl("");
    setUrlLoading(false);
  }

  function handleClose() {
    if (isInFlight) return;
    resetAll();
    onClose();
  }

  function setSharedField<K extends keyof SharedFields>(k: K, v: SharedFields[K]) {
    setShared((prev) => ({ ...prev, [k]: v }));
  }

  // ─── Single Upload handlers ─────────────────────────────────────────────────

  function handleFileSelect(f: File) {
    setUploadError(null);
    if (f.size > MAX_FILE_BYTES) {
      setUploadError(`File is ${formatBytes(f.size)} — maximum is 500 MB.`);
      return;
    }
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }

  async function handleUploadSubmit() {
    if (!file || !shared.title || !shared.handle || !shared.platform) return;
    setUploadError(null);

    try {
      console.log("[modal:single] Step 1/2 — uploading directly to Supabase", { name: file.name, size: file.size });
      setUploadPhase("uploading");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `uploads/${Date.now()}_${safeName}`;
      const { error: storageError } = await supabase.storage
        .from("videos")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (storageError) {
        console.error("[modal:single] Supabase upload error:", storageError);
        setUploadError(`Upload failed: ${storageError.message}`);
        setUploadPhase("idle");
        return;
      }
      const { data: urlData } = supabase.storage.from("videos").getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;
      console.log("[modal:single] Supabase upload success, publicUrl:", publicUrl);

      console.log("[modal:single] Step 2/2 — sending publicUrl to /api/analyze");
      setUploadPhase("analyzing");
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: publicUrl, ...shared }),
      });
      const analyzeData = await analyzeRes.json();
      console.log("[modal:single] /api/analyze response:", { ok: analyzeRes.ok, score: analyzeData.score, error: analyzeData.error });

      if (!analyzeRes.ok) {
        setUploadError(analyzeData.error ?? "Analysis failed");
        setUploadPhase("idle");
        return;
      }

      onSuccess(buildRecord(analyzeData, shared));
      toast.success("Analysis complete", {
        description: `"${shared.title}" scored ${analyzeData.score ?? "—"}% — ${analyzeData.status}.`,
      });
      resetAll();
      onClose();
    } catch (err) {
      console.error("[modal:single] Upload/analyze error:", err);
      setUploadError("Unexpected error. Please try again.");
      setUploadPhase("idle");
    }
  }

  // ─── Bulk Upload handlers ───────────────────────────────────────────────────

  function addBulkFiles(incoming: FileList | File[]) {
    const arr = Array.from(incoming).filter((f) => ALLOWED_TYPES.has(f.type));
    setBulkFiles((prev) => {
      const slots = MAX_BULK_FILES - prev.length;
      if (slots <= 0) return prev;
      const toAdd: BulkFile[] = arr.slice(0, slots).map((f) => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file: f,
        title: f.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "),
        handle: "",
        platform: null,
        status: "queued",
      }));
      return [...prev, ...toAdd];
    });
  }

  function handleBulkDrop(e: React.DragEvent) {
    e.preventDefault();
    setBulkDragOver(false);
    addBulkFiles(e.dataTransfer.files);
  }

  function updateBulkFile(
    id: string,
    updates: Partial<Pick<BulkFile, "title" | "handle" | "platform">>
  ) {
    setBulkFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }

  function removeBulkFile(id: string) {
    setBulkFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function applyToAll() {
    setBulkFiles((prev) =>
      prev.map((f) =>
        f.status === "queued"
          ? {
              ...f,
              handle: applyHandle || f.handle,
              platform: applyPlatform ?? f.platform,
            }
          : f
      )
    );
  }

  async function handleBulkSubmit() {
    // Mark incomplete queued files as failed immediately so user gets feedback
    setBulkFiles((prev) =>
      prev.map((f) => {
        if (f.status === "queued" && (!f.title.trim() || !f.handle.trim() || !f.platform)) {
          return { ...f, status: "failed" as BulkFileStatus, error: "Fill in title, handle, and platform" };
        }
        return f;
      })
    );

    const queue = bulkFiles.filter(
      (f) => f.status === "queued" && f.title.trim() && f.handle.trim() && f.platform
    );
    if (queue.length === 0) return;

    setBulkProcessing(true);
    setBulkCompleted(0);
    setBulkTotal(queue.length);

    let succeeded = 0;
    let failed = 0;

    for (const item of queue) {
      const { id, file: f, title, handle, platform } = item;
      try {
        setBulkFiles((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: "uploading" } : r))
        );
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `uploads/${Date.now()}_${safeName}`;
        const { error: storageError } = await supabase.storage
          .from("videos")
          .upload(storagePath, f, { contentType: f.type, upsert: false });
        if (storageError) throw new Error(`Upload failed: ${storageError.message}`);
        const { data: urlData } = supabase.storage.from("videos").getPublicUrl(storagePath);
        const publicUrl = urlData.publicUrl;
        console.log(`[modal:bulk] ${f.name} uploaded → ${publicUrl}`);

        setBulkFiles((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: "analyzing" } : r))
        );
        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: publicUrl, title, handle, platform }),
        });
        const analyzeData = await analyzeRes.json();
        if (!analyzeRes.ok) throw new Error(analyzeData.error ?? "Analysis failed");

        setBulkFiles((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: "complete" } : r))
        );
        onSuccess(buildRecord(analyzeData, { title, handle, platform }));
        succeeded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        setBulkFiles((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: "failed", error: msg } : r))
        );
        failed++;
      }

      setBulkCompleted((c) => c + 1);
    }

    setBulkProcessing(false);

    if (failed === 0) {
      toast.success(`${succeeded} video${succeeded !== 1 ? "s" : ""} analyzed successfully`);
      resetAll();
      onClose();
    } else if (succeeded > 0) {
      toast.warning(`${succeeded} succeeded, ${failed} failed — review errors below`);
    } else {
      toast.error("All submissions failed — review errors below");
    }
  }

  // ─── Direct URL handler ─────────────────────────────────────────────────────

  async function handleUrlSubmit() {
    if (!videoUrl.trim() || !shared.title || !shared.handle || !shared.platform) return;
    setUrlLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: videoUrl.trim(), ...shared }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");

      onSuccess(buildRecord(data, shared));
      toast.success("Analysis complete", {
        description: `"${shared.title}" scored ${data.score ?? "—"}% — ${data.status}.`,
      });
      resetAll();
      onClose();
    } catch (err) {
      toast.error("Submission failed", {
        description: err instanceof Error ? err.message : "Could not reach the analysis API.",
      });
    } finally {
      setUrlLoading(false);
    }
  }

  // ─── Submit button config ───────────────────────────────────────────────────

  const uploadValid =
    file !== null && !uploadError && shared.title && shared.handle && shared.platform;
  const urlValid =
    videoUrl.trim() && shared.title && shared.handle && shared.platform;
  const readyBulkFiles = bulkFiles.filter(
    (f) => f.status === "queued" && f.title.trim() && f.handle.trim() && f.platform
  );

  function submitButton() {
    if (activeTab === "single") {
      const label =
        uploadPhase === "uploading"
          ? "Uploading…"
          : uploadPhase === "analyzing"
            ? "Analyzing… (1–3 min)"
            : "Submit for Analysis";
      return {
        disabled: !uploadValid || uploadPhase !== "idle",
        label,
        loading: uploadPhase !== "idle",
        onClick: handleUploadSubmit,
      };
    }

    if (activeTab === "bulk") {
      const label = bulkProcessing
        ? `${Math.min(bulkCompleted + 1, bulkTotal)} of ${bulkTotal} complete`
        : `Start Analysis${readyBulkFiles.length > 0 ? ` (${readyBulkFiles.length})` : ""}`;
      return {
        disabled: readyBulkFiles.length === 0 || bulkProcessing,
        label,
        loading: bulkProcessing,
        onClick: handleBulkSubmit,
      };
    }

    return {
      disabled: !urlValid || urlLoading,
      label: urlLoading ? "Analyzing… (1–3 min)" : "Submit for Analysis",
      loading: urlLoading,
      onClick: handleUrlSubmit,
    };
  }

  const btn = submitButton();

  // ─── Shared fields (single + url tabs only) ─────────────────────────────────

  const sharedDisabled = isInFlight;

  const sharedFields = (
    <div className="space-y-3 pt-1">
      <div className="space-y-1.5">
        <Label htmlFor="shared-title">Video Title</Label>
        <Input
          id="shared-title"
          placeholder="e.g. My Honest GlowBrand Review"
          value={shared.title}
          onChange={(e) => setSharedField("title", e.target.value)}
          disabled={sharedDisabled}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="shared-handle">Influencer Handle</Label>
          <Input
            id="shared-handle"
            placeholder="@beautybylaura"
            value={shared.handle}
            onChange={(e) => setSharedField("handle", e.target.value)}
            disabled={sharedDisabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shared-platform">Platform</Label>
          <select
            id="shared-platform"
            value={shared.platform ?? ""}
            onChange={(e) =>
              setSharedField("platform", (e.target.value as Platform) || null)
            }
            disabled={sharedDisabled}
            className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>Select…</option>
            <option value="YouTube">YouTube</option>
            <option value="TikTok">TikTok</option>
            <option value="Instagram">Instagram</option>
          </select>
        </div>
      </div>
    </div>
  );

  // ─── Single Upload panel ─────────────────────────────────────────────────────

  const singlePanel = (
    <div className="space-y-3">
      <div
        onClick={() => !isInFlight && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
          dragOver
            ? "border-purple-400 bg-purple-50"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
          isInFlight && "pointer-events-none opacity-50"
        )}
      >
        <UploadCloud className="h-8 w-8 text-slate-400" />
        <div>
          <p className="text-sm font-medium text-slate-700">
            Drop a video here or <span className="text-purple-600">browse</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">.mp4, .mov, .avi, .webm · max 500 MB</p>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
      />

      {file && !uploadError && (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="truncate text-slate-700 font-medium">{file.name}</span>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="text-slate-400 text-xs">{formatBytes(file.size)}</span>
            {uploadPhase === "idle" && (
              <button onClick={() => setFile(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {uploadError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}

      {uploadPhase === "uploading" && (
        <p className="text-xs text-slate-500 text-center">Uploading to storage…</p>
      )}
      {uploadPhase === "analyzing" && (
        <p className="text-xs text-slate-500 text-center">
          Analyzing with TwelveLabs Pegasus… (1–3 min)
        </p>
      )}
    </div>
  );

  // ─── Bulk Upload panel ───────────────────────────────────────────────────────

  const slotsLeft = MAX_BULK_FILES - bulkFiles.length;

  const bulkPanel = (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onClick={() =>
          !bulkProcessing && slotsLeft > 0 && bulkFileInputRef.current?.click()
        }
        onDragOver={(e) => { e.preventDefault(); setBulkDragOver(true); }}
        onDragLeave={() => setBulkDragOver(false)}
        onDrop={handleBulkDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          slotsLeft > 0 && !bulkProcessing
            ? "cursor-pointer hover:border-slate-300 hover:bg-slate-50"
            : "cursor-not-allowed opacity-50",
          bulkDragOver ? "border-purple-400 bg-purple-50" : "border-slate-200"
        )}
      >
        <UploadCloud className="h-7 w-7 text-slate-400" />
        <div>
          <p className="text-sm font-medium text-slate-700">
            Drag and drop video files here or{" "}
            <span className="text-purple-600">click to browse</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Supports .mp4, .mov, .webm — up to {MAX_BULK_FILES} files at once
            {bulkFiles.length > 0 &&
              ` · ${slotsLeft} slot${slotsLeft !== 1 ? "s" : ""} remaining`}
          </p>
        </div>
      </div>
      <input
        ref={bulkFileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) addBulkFiles(e.target.files); }}
      />

      {/* Apply to all row */}
      {bulkFiles.some((f) => f.status === "queued") && (
        <div className="flex items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-slate-500">Handle — apply to all</Label>
            <Input
              placeholder="@beautybylaura"
              value={applyHandle}
              onChange={(e) => setApplyHandle(e.target.value)}
              disabled={bulkProcessing}
              className="h-7 text-xs"
            />
          </div>
          <div className="w-32 space-y-1">
            <Label className="text-xs text-slate-500">Platform — apply to all</Label>
            <select
              value={applyPlatform ?? ""}
              onChange={(e) => setApplyPlatform((e.target.value as Platform) || null)}
              disabled={bulkProcessing}
              className="flex h-7 w-full rounded-lg border border-input bg-background px-2 py-0.5 text-xs text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>Platform…</option>
              <option value="YouTube">YouTube</option>
              <option value="TikTok">TikTok</option>
              <option value="Instagram">Instagram</option>
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs shrink-0"
            disabled={bulkProcessing || (!applyHandle && !applyPlatform)}
            onClick={applyToAll}
          >
            Apply to all
          </Button>
        </div>
      )}

      {/* File list */}
      {bulkFiles.length > 0 && (
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-0.5">
          {bulkFiles.map((item) => (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-3 py-2.5 space-y-2",
                item.status === "failed"
                  ? "border-red-200 bg-red-50"
                  : item.status === "complete"
                    ? "border-green-200 bg-green-50/40"
                    : "border-slate-200 bg-white"
              )}
            >
              {/* Top row: badge + filename + size + remove */}
              <div className="flex items-center gap-2">
                <StatusBadge status={item.status} />
                <span className="truncate text-sm font-medium text-slate-700 flex-1">
                  {item.file.name}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatBytes(item.file.size)}
                </span>
                {item.status === "queued" && (
                  <button
                    onClick={() => removeBulkFile(item.id)}
                    className="shrink-0 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Error */}
              {item.status === "failed" && item.error && (
                <p className="text-xs text-red-600">{item.error}</p>
              )}

              {/* Editable fields — queued only */}
              {item.status === "queued" && (
                <div className="grid grid-cols-[1fr_1fr_7rem] gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Title</Label>
                    <Input
                      placeholder="Video title"
                      value={item.title}
                      onChange={(e) => updateBulkFile(item.id, { title: e.target.value })}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Handle</Label>
                    <Input
                      placeholder="@handle"
                      value={item.handle}
                      onChange={(e) => updateBulkFile(item.id, { handle: e.target.value })}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Platform</Label>
                    <select
                      value={item.platform ?? ""}
                      onChange={(e) =>
                        updateBulkFile(item.id, {
                          platform: (e.target.value as Platform) || null,
                        })
                      }
                      className="flex h-7 w-full rounded-lg border border-input bg-background px-2 py-0.5 text-xs text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
                    >
                      <option value="" disabled>Platform</option>
                      <option value="YouTube">YouTube</option>
                      <option value="TikTok">TikTok</option>
                      <option value="Instagram">Instagram</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Overall progress bar */}
      {bulkProcessing && (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500 text-center">
            {bulkCompleted} of {bulkTotal} complete
          </p>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-purple-600 transition-all duration-500"
              style={{ width: `${Math.round((bulkCompleted / bulkTotal) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );

  // ─── Direct URL panel ────────────────────────────────────────────────────────

  const urlPanel = (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor="video-url">Video URL</Label>
        <Input
          id="video-url"
          placeholder="https://mybucket.s3.amazonaws.com/video.mp4"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          disabled={urlLoading}
        />
      </div>
      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 space-y-1">
        <p className="text-xs font-medium text-slate-600">Must be a direct video file link</p>
        <p className="text-xs text-slate-500">
          Supports Amazon S3, Cloudflare R2, Backblaze B2, or any public CDN.
          Social media page URLs (YouTube, TikTok, Instagram) are not supported.
        </p>
        <p className="text-xs text-slate-400 font-mono mt-1">
          e.g. https://mybucket.s3.amazonaws.com/video.mp4
        </p>
      </div>
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Video for Compliance Review</DialogTitle>
          <DialogDescription>
            Upload a file, batch upload multiple videos, or paste a direct URL — we&apos;ll
            run an AI compliance check using TwelveLabs Pegasus 1.5.
          </DialogDescription>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex border-b border-border -mx-4 px-4">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              disabled={isInFlight}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors disabled:pointer-events-none",
                activeTab === id
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Shared title/handle/platform — not shown on bulk tab (each row has its own) */}
        {activeTab !== "bulk" && sharedFields}

        {/* Tab panel */}
        <div className="pt-1">
          {activeTab === "single" && singlePanel}
          {activeTab === "bulk" && bulkPanel}
          {activeTab === "url" && urlPanel}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isInFlight}>
            Cancel
          </Button>
          <Button
            onClick={btn.onClick}
            disabled={btn.disabled}
            className="bg-purple-600 hover:bg-purple-700 text-white min-w-[180px]"
          >
            {btn.loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {btn.label}
              </>
            ) : (
              btn.label
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
