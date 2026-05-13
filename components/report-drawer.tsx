"use client";

import { CheckCircle2, XCircle, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { VideoRecord } from "@/lib/types";

interface Props {
  video: VideoRecord | null;
  onClose: () => void;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
}

function statusVariant(status: string) {
  if (status === "Compliant")
    return "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50";
  if (status === "Needs Review")
    return "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50";
  return "bg-red-50 text-red-700 border-red-200 hover:bg-red-50";
}

export function ReportDrawer({ video, onClose }: Props) {
  const open = video !== null && video.report !== undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">
            {video?.title ?? "Compliance Report"}
          </DialogTitle>
          <DialogDescription>
            {video?.handle} · {video?.platform} · {video?.date}
          </DialogDescription>
        </DialogHeader>

        {video?.report && (
          <div className="space-y-5">
            {/* Score + status */}
            <div className="flex items-center gap-4">
              <span
                className={`text-5xl font-bold tabular-nums ${scoreColor(video.report.score)}`}
              >
                {video.report.score}%
              </span>
              <div className="space-y-1">
                <Badge
                  variant="outline"
                  className={statusVariant(video.report.status)}
                >
                  {video.report.status}
                </Badge>
                <p className="text-xs text-slate-500">
                  {video.report.rules.filter((r) => r.id !== 6 && r.passed).length} of 5
                  scored rules passed
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-100" />

            {/* Rules list */}
            <div className="space-y-4">
              {video.report.rules.map((rule) => {
                const isInfo = rule.id === 6;
                return (
                  <div key={rule.id} className="flex gap-3">
                    <div className="mt-0.5 shrink-0">
                      {isInfo ? (
                        <Info className="h-4 w-4 text-blue-400" />
                      ) : rule.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {rule.name}
                        </span>
                        {isInfo && (
                          <span className="text-xs text-blue-500 font-normal">
                            informational
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {rule.response}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter showCloseButton className="-mx-4 -mb-4" />
      </DialogContent>
    </Dialog>
  );
}
