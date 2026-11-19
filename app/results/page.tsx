"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanResult, TranscriptData } from "@/types";
import { ScheduleCard } from "@/components/ScheduleCard";
import { PlanNotices } from "@/components/PlanNotices";

type Tab = "primary" | "backup1" | "backup2";

const TABS: { key: Tab; label: string; sublabel: string }[] = [
  { key: "primary", label: "Primary", sublabel: "Best match" },
  { key: "backup1", label: "Backup 1", sublabel: "Alternative" },
  { key: "backup2", label: "Backup 2", sublabel: "Alternative" },
];

export default function ResultsPage() {
  const router = useRouter();
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("primary");
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("plan_result");
    const rawTranscript = sessionStorage.getItem("transcript");
    if (!raw || !rawTranscript) {
      router.replace("/");
      return;
    }
    setPlanResult(JSON.parse(raw));
    setTranscript(JSON.parse(rawTranscript));
  }, [router]);

  if (!planResult || !transcript) return null;

  const activeSchedule =
    activeTab === "primary"
      ? planResult.primary
      : activeTab === "backup1"
      ? planResult.backups[0]
      : planResult.backups[1];

  const allValid = planResult.primary.validation.valid;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header bar */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold">S1</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {transcript.studentName || "Your Schedule"}
              </div>
              <div className="text-xs text-gray-400">{transcript.major} · Winter 2027</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {allValid && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                All schedules checked
              </span>
            )}
            <button
              onClick={() => router.push("/onboarding")}
              className="text-xs border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition"
            >
              Start over
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Summary banner */}
        <div className="bg-blue-600 rounded-2xl p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold mb-1">Your schedule is ready</h1>
            <p className="text-blue-100 text-sm">
              {planResult.primary.courses.length} courses · {planResult.primary.totalUnits} units · 1 primary + 2 backup options
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <div className="text-center bg-white/10 rounded-xl px-4 py-2">
              <div className="text-2xl font-bold">{planResult.primary.totalUnits}</div>
              <div className="text-blue-200 text-xs">units</div>
            </div>
            <div className="text-center bg-white/10 rounded-xl px-4 py-2">
              <div className="text-2xl font-bold">{planResult.primary.courses.length}</div>
              <div className="text-blue-200 text-xs">courses</div>
            </div>
            <div className="text-center bg-white/10 rounded-xl px-4 py-2">
              <div className="text-2xl font-bold">3</div>
              <div className="text-blue-200 text-xs">options</div>
            </div>
          </div>
        </div>

        {/* Remaining requirements */}
        {planResult.remainingRequirements.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
            <div className="flex items-start gap-2">
              <div>
                <div className="text-sm font-semibold text-amber-800 mb-1">Requirements still needed after this quarter</div>
                <div className="flex flex-wrap gap-1.5">
                  {planResult.remainingRequirements.map((r) => (
                    <span key={r} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full border border-amber-200">{r}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <PlanNotices plan={planResult} />

        {/* Tab switcher */}
        <div className="flex gap-2">
          {TABS.map((tab) => {
            const schedule = tab.key === "primary" ? planResult.primary : tab.key === "backup1" ? planResult.backups[0] : planResult.backups[1];
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 sm:flex-none px-5 py-3 rounded-xl border text-left transition ${
                  isActive
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:border-blue-300"
                }`}
              >
                <div className={`text-sm font-semibold ${isActive ? "text-white" : "text-gray-800"}`}>{tab.label}</div>
                <div className={`text-xs mt-0.5 ${isActive ? "text-blue-100" : "text-gray-400"}`}>
                  {schedule.totalUnits}u · {tab.sublabel}
                </div>
              </button>
            );
          })}
        </div>

        {/* Schedule card */}
        <ScheduleCard
          schedule={activeSchedule}
          title={activeTab === "primary" ? "Primary Schedule" : activeTab === "backup1" ? "Backup Schedule 1" : "Backup Schedule 2"}
          isPrimary={activeTab === "primary"}
          groupNames={planResult.groupNames}
        />

        {/* Transcript accordion */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <button
            onClick={() => setShowTranscript((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">
                Courses from your transcript ({transcript.completedCourses.length})
              </span>
              <span className="text-xs text-gray-400">{transcript.totalUnitsEarned} units total</span>
            </div>
            <span className={`text-gray-400 transition-transform ${showTranscript ? "rotate-180" : ""}`}>▾</span>
          </button>
          {showTranscript && (
            <div className="px-5 pb-5 border-t border-gray-100 pt-4">
              <div className="flex flex-wrap gap-1.5">
                {transcript.completedCourses.map((c) => (
                  <span key={c.code} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg">
                    {c.code} <span className="text-gray-400 font-medium">{c.grade}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          Schedule One · Mock data only · Not affiliated with UCSB
        </p>
      </div>
    </div>
  );
}
