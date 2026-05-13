export type Status = "Compliant" | "Needs Review" | "Failed" | "Processing";
export type Platform = "TikTok" | "YouTube" | "Instagram";

export interface ComplianceRule {
  id: number;
  name: string;
  passed: boolean;
  response: string;
}

export interface ComplianceReport {
  score: number;
  status: Status;
  rules: ComplianceRule[];
}

export interface VideoRecord {
  id: string;
  title: string;
  handle: string;
  platform: Platform;
  score: number | null;
  status: Status;
  date: string;
  report?: ComplianceReport;
}
