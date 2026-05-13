"use client";

import { useRef, useState } from "react";
import { Loader2, UploadCloud, FileText, Link, X, AlertCircle } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Platform, VideoRecord } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "upload" | "bulk" | "url";

interface SharedFields {
  title: string;
  handle: string;
  platform: Platform | null;
}

type UploadPhase = "idle" | "uploading" | "analyzing";

interface CsvRow {
  title: string;
  handle: string;
  platform: Platform;
  video_url: string;
  _rowIndex: number;
  _parseError?: string;
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
// Simple comma-split parser. Values containing commas must be pre-processed
// (no RFC 4180 quoted-field support). Falls back to shared fields for empty cells.

const VALID_PLATFORMS = new Set<Platform>(["YouTube", "TikTok", "Instagram"]);

function parseCsv(text: string, fallback: SharedFields): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);

  const titleCol = col("title");
  const handleCol = col("handle");
  const platformCol = col("platform");
  const urlCol = col("video_url");

  if (urlCol === -1) {
    return [
      {
        title: "",
        handle: "",
        platform: "YouTube",
        video_url: "",
        _rowIndex: 1,
        _parseError: "CSV must have a 'video_url' column",
      },
    ];
  }

  return lines.slice(1).map((line, i) => {
    const cols = line.split(",").map((c) => c.trim());
    const rawTitle = titleCol !== -1 ? (cols[titleCol] ?? "") : "";
    const rawHandle = handleCol !== -1 ? (cols[handleCol] ?? "") : "";
    const rawPlatform = platformCol !== -1 ? (cols[platformCol] ?? "") : "";
    const rawUrl = urlCol !== -1 ? (cols[urlCol] ?? "") : "";

    const title = rawTitle || fallback.title;
    const handle = rawHandle || fallback.handle;
    const platform = VALID_PLATFORMS.has(rawPlatform as Platform)
      ? (rawPlatform as Platform)
      : (fallback.platform ?? "YouTube");

    const _parseError = !rawUrl ? `Row ${i + 2}: video_url is empty` : undefined;

    return { title, handle, platform, video_url: rawUrl, _rowIndex: i + 2, _parseError };
  });
}

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
  { id: "upload", label: "File Upload", icon: UploadCloud },
  { id: "bulk", label: "Bulk Import", icon: FileText },
  { id: "url", label: "Direct URL", icon: Link },
];

const SHARED_EMPTY: SharedFields = { title: "", handle: "", platform: null };

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (video: VideoRecord) => void;
}

export function AddVideoModal({ open, onClose, onSuccess }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [shared, setShared] = useState<SharedFields>(SHARED_EMPTY);

  // File Upload tab
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk Import tab
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkIndex, setBulkIndex] = useState(0);

  // Direct URL tab
  const [videoUrl, setVideoUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  const isInFlight =
    uploadPhase !== "idle" || bulkProcessing || urlLoading;

  function resetAll() {
    setShared(SHARED_EMPTY);
    setFile(null);
    setDragOver(false);
    setUploadPhase("idle");
    setUploadError(null);
    setCsvRows([]);
    setBulkProcessing(false);
    setBulkIndex(0);
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

  // ─── File Upload handlers ──────────────────────────────────────────────────

  const MAX_FILE_BYTES = 500 * 1024 * 1024;
  const ACCEPT = ".mp4,.mov,.avi,.webm";

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
      console.log("[modal] Step 1/2 — uploading file to /api/upload", { name: file.name, size: file.size });
      setUploadPhase("uploading");
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
      const uploadData = await uploadRes.json();
      console.log("[modal] /api/upload response:", { ok: uploadRes.ok, status: uploadRes.status, publicUrl: uploadData.publicUrl, error: uploadData.error });

      if (!uploadRes.ok) {
        setUploadError(uploadData.error ?? "Upload failed");
        setUploadPhase("idle");
        return;
      }

      if (!uploadData.publicUrl) {
        console.error("[modal] Upload succeeded but publicUrl is missing in response:", uploadData);
        setUploadError("Upload succeeded but no public URL was returned. Check Supabase bucket is public.");
        setUploadPhase("idle");
        return;
      }

      console.log("[modal] Step 2/2 — sending publicUrl to /api/analyze:", uploadData.publicUrl);
      setUploadPhase("analyzing");
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: uploadData.publicUrl, ...shared }),
      });
      const analyzeData = await analyzeRes.json();
      console.log("[modal] /api/analyze response:", { ok: analyzeRes.ok, status: analyzeRes.status, score: analyzeData.score, analyzeStatus: analyzeData.status, error: analyzeData.error });

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
      console.error("[modal] Upload/analyze error:", err);
      setUploadError("Unexpected error. Please try again.");
      setUploadPhase("idle");
    }
  }

  // ─── Bulk Import handlers ──────────────────────────────────────────────────

  function handleCsvFile(f: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvRows(parseCsv(text, shared));
    };
    reader.readAsText(f);
  }

  async function handleBulkSubmit() {
    const validRows = csvRows.filter((r) => !r._parseError);
    if (validRows.length === 0) return;

    setBulkProcessing(true);
    setBulkIndex(0);
    const errors: string[] = [];

    for (let i = 0; i < validRows.length; i++) {
      setBulkIndex(i);
      const row = validRows[i];
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoUrl: row.video_url,
            title: row.title,
            handle: row.handle,
            platform: row.platform,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Analysis failed");
        onSuccess(
          buildRecord(data, {
            title: row.title,
            handle: row.handle,
            platform: row.platform,
          })
        );
      } catch (err) {
        errors.push(
          `Row ${row._rowIndex} (${row.title || row.video_url}): ${err instanceof Error ? err.message : "failed"}`
        );
      }
    }

    setBulkProcessing(false);
    const succeeded = validRows.length - errors.length;

    if (errors.length === 0) {
      toast.success(`${succeeded} video${succeeded !== 1 ? "s" : ""} analyzed successfully`);
    } else if (succeeded > 0) {
      toast.warning(`${succeeded} succeeded, ${errors.length} failed`, {
        description: errors[0],
      });
    } else {
      toast.error("All submissions failed", { description: errors[0] });
    }

    resetAll();
    onClose();
  }

  // ─── Direct URL handler ────────────────────────────────────────────────────

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

  // ─── Submit button config ──────────────────────────────────────────────────

  const uploadValid = file !== null && !uploadError && shared.title && shared.handle && shared.platform;
  const validBulkRows = csvRows.filter((r) => !r._parseError);
  const bulkValid = validBulkRows.length > 0;
  const urlValid = videoUrl.trim() && shared.title && shared.handle && shared.platform;

  function submitButton() {
    if (activeTab === "upload") {
      const label =
        uploadPhase === "uploading"
          ? "Uploading…"
          : uploadPhase === "analyzing"
            ? "Analyzing… (1–3 min)"
            : "Submit for Analysis";
      return { disabled: !uploadValid || uploadPhase !== "idle", label, loading: uploadPhase !== "idle", onClick: handleUploadSubmit };
    }
    if (activeTab === "bulk") {
      const label = bulkProcessing
        ? `Analyzing ${bulkIndex + 1} of ${validBulkRows.length}…`
        : `Import ${validBulkRows.length} video${validBulkRows.length !== 1 ? "s" : ""}`;
      return { disabled: !bulkValid || bulkProcessing, label, loading: bulkProcessing, onClick: handleBulkSubmit };
    }
    return {
      disabled: !urlValid || urlLoading,
      label: urlLoading ? "Analyzing… (1–3 min)" : "Submit for Analysis",
      loading: urlLoading,
      onClick: handleUrlSubmit,
    };
  }

  const btn = submitButton();

  // ─── Shared fields (rendered on all tabs) ────────────────────────────────

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

  // ─── Tab panels ───────────────────────────────────────────────────────────

  const uploadPanel = (
    <div className="space-y-3">
      <div
        onClick={() => !isInFlight && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
          dragOver ? "border-purple-400 bg-purple-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
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
        <p className="text-xs text-slate-500 text-center">Analyzing with TwelveLabs Pegasus… (1–3 min)</p>
      )}
    </div>
  );

  const bulkPanel = (
    <div className="space-y-3">
      <div>
        <Label htmlFor="csv-file" className="mb-1.5 block">CSV File</Label>
        <p className="text-xs text-slate-500 mb-2">
          Required columns: <code className="bg-slate-100 px-1 rounded">title</code>,{" "}
          <code className="bg-slate-100 px-1 rounded">handle</code>,{" "}
          <code className="bg-slate-100 px-1 rounded">platform</code>,{" "}
          <code className="bg-slate-100 px-1 rounded">video_url</code>.
          Empty cells fall back to the fields below.
        </p>
        <input
          id="csv-file"
          type="file"
          accept=".csv"
          disabled={bulkProcessing}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleCsvFile(f);
          }}
          className="block w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-200 file:text-xs file:font-medium file:text-slate-700 file:bg-white hover:file:bg-slate-50 disabled:opacity-50"
        />
      </div>

      {csvRows.length > 0 && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="max-h-[180px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="text-xs py-2 pl-3">Title</TableHead>
                  <TableHead className="text-xs py-2">Handle</TableHead>
                  <TableHead className="text-xs py-2">Platform</TableHead>
                  <TableHead className="text-xs py-2 pr-3 max-w-[140px]">URL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {csvRows.map((row) => (
                  <TableRow
                    key={row._rowIndex}
                    className={cn(
                      "text-xs",
                      row._parseError && "bg-red-50 text-red-700"
                    )}
                  >
                    <TableCell className="py-1.5 pl-3 font-medium max-w-[100px] truncate">
                      {row._parseError ? row._parseError : (row.title || "—")}
                    </TableCell>
                    {!row._parseError && (
                      <>
                        <TableCell className="py-1.5">{row.handle || "—"}</TableCell>
                        <TableCell className="py-1.5">{row.platform}</TableCell>
                        <TableCell className="py-1.5 pr-3 max-w-[140px] truncate text-slate-400">
                          {row.video_url}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
            {validBulkRows.length} valid · {csvRows.length - validBulkRows.length} errors
          </div>
        </div>
      )}

      {bulkProcessing && (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">
            Analyzing {bulkIndex + 1} of {validBulkRows.length}…
          </p>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-purple-600 transition-all duration-500"
              style={{ width: `${Math.round(((bulkIndex + 1) / validBulkRows.length) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );

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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Video for Compliance Review</DialogTitle>
          <DialogDescription>
            Upload a file, import from CSV, or paste a direct URL — we&apos;ll run an AI
            compliance check using TwelveLabs Pegasus 1.5.
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

        {/* Shared fields */}
        {sharedFields}

        {/* Tab-specific panel */}
        <div className="pt-1">
          {activeTab === "upload" && uploadPanel}
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
