"use client";

import { useState } from "react";
import { PlusCircle, Video, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddVideoModal } from "@/components/add-video-modal";
import { ReportDrawer } from "@/components/report-drawer";
import type { Platform, Status, VideoRecord } from "@/lib/types";

// ─── Sample data ─────────────────────────────────────────────────────────────

const INITIAL_VIDEOS: VideoRecord[] = [
  {
    id: "1",
    title: "GlowSerum AM Routine — Full Review",
    handle: "@radiantrosie",
    platform: "TikTok",
    score: 94,
    status: "Compliant",
    date: "May 11, 2026",
  },
  {
    id: "2",
    title: "My Honest Skincare Faves ft. GlowBrand",
    handle: "@beautybymarco",
    platform: "YouTube",
    score: 71,
    status: "Needs Review",
    date: "May 10, 2026",
  },
  {
    id: "3",
    title: "Clear Skin in 7 Days? I Tried It",
    handle: "@thedermdiaries",
    platform: "Instagram",
    score: 38,
    status: "Failed",
    date: "May 9, 2026",
  },
  {
    id: "4",
    title: "GlowBrand Unboxing + First Impressions",
    handle: "@luxelena",
    platform: "YouTube",
    score: 88,
    status: "Compliant",
    date: "May 8, 2026",
  },
  {
    id: "5",
    title: "Does the Vitamin C Serum Actually Work?",
    handle: "@skincarewithjay",
    platform: "TikTok",
    score: 62,
    status: "Needs Review",
    date: "May 7, 2026",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
}

function ScoreCell({ score }: { score: number | null }) {
  if (score === null)
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-400 text-sm">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Pending</span>
      </span>
    );
  return (
    <span className={`font-semibold tabular-nums ${scoreColor(score)}`}>
      {score}%
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const variants: Record<Status, string> = {
    Compliant:
      "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
    "Needs Review":
      "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
    Failed: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
    Processing: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50",
  };
  return (
    <Badge variant="outline" className={variants[status]}>
      {status}
    </Badge>
  );
}

function PlatformBadge({ platform }: { platform: Platform }) {
  const colors: Record<Platform, string> = {
    TikTok: "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100",
    YouTube: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
    Instagram:
      "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50",
  };
  return (
    <Badge variant="outline" className={colors[platform]}>
      {platform}
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [videos, setVideos] = useState<VideoRecord[]>(INITIAL_VIDEOS);
  const [modalOpen, setModalOpen] = useState(false);
  const [reportVideo, setReportVideo] = useState<VideoRecord | null>(null);

  function handleAddVideo(video: VideoRecord) {
    setVideos((prev) => [video, ...prev]);
  }

  const totalVideos = videos.length;
  const compliantCount = videos.filter((v) => v.status === "Compliant").length;
  const reviewCount = videos.filter((v) => v.status === "Needs Review").length;
  const failedCount = videos.filter((v) => v.status === "Failed").length;

  const metrics = [
    {
      label: "Total Videos Analyzed",
      value: totalVideos,
      icon: Video,
      iconClass: "text-slate-500",
      sub: "All submissions",
    },
    {
      label: "Fully Compliant",
      value: compliantCount,
      icon: CheckCircle2,
      iconClass: "text-emerald-500",
      sub: `${Math.round((compliantCount / totalVideos) * 100)}% of total`,
    },
    {
      label: "Needs Review",
      value: reviewCount,
      icon: AlertTriangle,
      iconClass: "text-amber-500",
      sub: `${Math.round((reviewCount / totalVideos) * 100)}% of total`,
    },
    {
      label: "Failed",
      value: failedCount,
      icon: XCircle,
      iconClass: "text-red-500",
      sub: `${Math.round((failedCount / totalVideos) * 100)}% of total`,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">G</span>
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">
              GlowBrand Compliance
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => setModalOpen(true)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 gap-2"
          >
            <PlusCircle className="h-4 w-4" />
            Add Video
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Page heading */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            AI-powered influencer video compliance analysis
          </p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {metrics.map((m) => (
            <Card
              key={m.label}
              className="bg-white border-slate-200 shadow-sm"
            >
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">
                  {m.label}
                </CardTitle>
                <m.icon className={`h-4 w-4 ${m.iconClass}`} />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-slate-900">{m.value}</p>
                <p className="text-xs text-slate-400 mt-1">{m.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Video table */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">
              Video Reviews
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="w-16 pl-6 text-slate-500 font-medium">
                    Thumb
                  </TableHead>
                  <TableHead className="text-slate-500 font-medium">
                    Video Title
                  </TableHead>
                  <TableHead className="text-slate-500 font-medium">
                    Influencer
                  </TableHead>
                  <TableHead className="text-slate-500 font-medium">
                    Platform
                  </TableHead>
                  <TableHead className="text-slate-500 font-medium">
                    Score
                  </TableHead>
                  <TableHead className="text-slate-500 font-medium">
                    Status
                  </TableHead>
                  <TableHead className="text-slate-500 font-medium">
                    Submitted
                  </TableHead>
                  <TableHead className="pr-6 text-slate-500 font-medium">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videos.map((video) => (
                  <TableRow
                    key={video.id}
                    className="border-slate-100 hover:bg-slate-50/60"
                  >
                    <TableCell className="pl-6">
                      <div className="h-10 w-16 rounded-md bg-slate-200 flex items-center justify-center">
                        <Video className="h-4 w-4 text-slate-400" />
                      </div>
                    </TableCell>

                    <TableCell className="font-medium text-slate-800 max-w-[220px]">
                      <span className="line-clamp-2 leading-snug">
                        {video.title}
                      </span>
                    </TableCell>

                    <TableCell className="text-slate-500 text-sm">
                      {video.handle}
                    </TableCell>

                    <TableCell>
                      <PlatformBadge platform={video.platform} />
                    </TableCell>

                    <TableCell>
                      <ScoreCell score={video.score} />
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={video.status} />
                    </TableCell>

                    <TableCell className="text-slate-500 text-sm whitespace-nowrap">
                      {video.date}
                    </TableCell>

                    <TableCell className="pr-6">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!video.report}
                        onClick={() => setReportVideo(video)}
                        className="text-slate-700 border-slate-200 hover:bg-slate-100 text-xs disabled:opacity-40"
                      >
                        View Report
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <AddVideoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleAddVideo}
      />

      <ReportDrawer
        video={reportVideo}
        onClose={() => setReportVideo(null)}
      />
    </div>
  );
}
