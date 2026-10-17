"use client";

import React, { useState } from "react";
import { X, Sparkles, CheckCircle2, Play, Sliders, Eye, Zap, Layers } from "lucide-react";
import RobotMascot, { RobotState, RobotEyeExpression } from "./RobotMascot";

interface RobotAnimationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RobotAnimationGuideModal({
  isOpen,
  onClose,
}: RobotAnimationGuideModalProps) {
  const [selectedState, setSelectedState] = useState<RobotState>("idle");
  const [selectedEye, setSelectedEye] = useState<RobotEyeExpression>("normal");
  const [selectedPose, setSelectedPose] = useState<"sitting" | "standing">("sitting");
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<number>(3);

  if (!isOpen) return null;

  const STATES_LIST: { id: RobotState; label: string; desc: string; trigger: string }[] = [
    {
      id: "idle",
      label: "1. Idle Animation (Default State)",
      desc: "Gentle floating (6–10px), occasional blinking, subtle head rotation, and softly pulsing antenna.",
      trigger: "Default ambient state when idle",
    },
    {
      id: "hover",
      label: "2. Hover Interaction",
      desc: "Slight scale up, hand wave gesture, and friendly 'Hi! 👋' speech bubble response.",
      trigger: "Triggers when user hovers or focuses on the robot",
    },
    {
      id: "working",
      label: "3. Active / Working State",
      desc: "Brighter eyes with radar scanner, rapid antenna pulse with wave rings, and processing indicator.",
      trigger: "Triggers during dataset profiling and AutoML model training",
    },
    {
      id: "success",
      label: "4. Success State",
      desc: "Happy curved arc eyes, celebratory cheer bounce, arms raised, radiant antenna halo, and checkmark badge.",
      trigger: "Triggers upon model convergence and leaderboard generation",
    },
    {
      id: "thinking",
      label: "5. Idle Thinking State",
      desc: "Inquisitive head tilt (-7°), thoughtful gaze, dim antenna pulse, and animated thought bubble.",
      trigger: "Triggers while evaluating candidate trade-offs and waiting for action",
    },
  ];

  const EYES_LIST: { id: RobotEyeExpression; label: string }[] = [
    { id: "normal", label: "Normal (Pill)" },
    { id: "blinking", label: "Blinking (Slit)" },
    { id: "happy", label: "Happy (Arc)" },
    { id: "thinking", label: "Thinking (Gaze)" },
    { id: "processing", label: "Processing (Radar)" },
    { id: "success", label: "Success (Stars)" },
  ];

  const WORKFLOW_STEPS = [
    { step: 1, title: "01 Upload Dataset", msg: "Let's start with your data!" },
    { step: 2, title: "02 Dataset Profiling", msg: "Analyzing dataset..." },
    { step: 3, title: "03 AutoML Training", msg: "Training models..." },
    { step: 4, title: "04 Model Evaluation", msg: "Evaluating results..." },
    { step: 5, title: "05 Predictions", msg: "Here are your predictions!" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-3xl bg-[#0D1815] border border-[#2A4E42] shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-5 sm:p-8 text-[#F1EFE1] font-sans my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-[#070D0C] border border-[#2A4E42] text-[#AEBEB5] hover:text-[#F1EFE1] hover:border-[#68E7B5] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6 pb-4 border-b border-[#2A4E42]/80">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#68E7B5] animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-[#68E7B5]">
              AUTONEXA ROBOT MASCOT
            </span>
          </div>
          <h2 className="font-editorial text-2xl sm:text-3xl text-[#F1EFE1]">
            Robot Animation Guide & State Tester
          </h2>
          <p className="text-xs text-[#AEBEB5] mt-1">
            Interactive verification of all canonical motion states, eye expressions, antenna lights, and workflow sync.
          </p>
        </div>

        {/* Main 2-Column Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Live Robot Stage Canvas (5 cols) */}
          <div className="lg:col-span-5 rounded-2xl bg-[#070D0C] border border-[#2A4E42] p-6 flex flex-col items-center justify-between text-center relative overflow-hidden min-h-[380px]">
            {/* Soft Ambient Radial Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#68E7B5]/10 rounded-full blur-3xl pointer-events-none" />

            <div className="w-full flex items-center justify-between text-xs font-mono text-[#AEBEB5] z-10">
              <span className="px-2.5 py-1 rounded-md bg-[#162A23] border border-[#2A4E42] text-[#68E7B5]">
                State: {selectedState.toUpperCase()}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-[#12201C] border border-[#2A4E42]">
                Eye: {selectedEye}
              </span>
            </div>

            {/* Central Animated Robot */}
            <div className="my-8 z-10 flex flex-col items-center">
              <RobotMascot
                size="lg"
                state={selectedState}
                eyeExpression={selectedEye}
                pose={selectedPose}
                isInteractive={true}
              />
            </div>

            {/* Pose & Reset Controls */}
            <div className="w-full flex items-center justify-between gap-3 pt-3 border-t border-[#2A4E42]/60 z-10 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="text-[#AEBEB5]/70 text-[11px]">Pose:</span>
                <button
                  onClick={() => setSelectedPose("sitting")}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    selectedPose === "sitting"
                      ? "bg-[#68E7B5] text-[#070D0C] font-bold"
                      : "bg-[#12201C] border border-[#2A4E42] text-[#AEBEB5]"
                  }`}
                >
                  Sitting
                </button>
                <button
                  onClick={() => setSelectedPose("standing")}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    selectedPose === "standing"
                      ? "bg-[#68E7B5] text-[#070D0C] font-bold"
                      : "bg-[#12201C] border border-[#2A4E42] text-[#AEBEB5]"
                  }`}
                >
                  Standing
                </button>
              </div>

              <span className="text-[10px] text-[#AEBEB5]/60">Click robot anytime to trigger interaction</span>
            </div>
          </div>

          {/* Right Column: Controls & Matrix (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* 1. Five Canonical States Selector */}
            <div className="p-4 rounded-2xl bg-[#12201C] border border-[#2A4E42]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#68E7B5]">
                  1. Canonical Motion States (Sections 1–5)
                </h3>
                <span className="text-[10px] font-mono text-[#AEBEB5]">Select to test</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {STATES_LIST.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => {
                      setSelectedState(st.id);
                      if (st.id === "working") setSelectedEye("processing");
                      else if (st.id === "success") setSelectedEye("happy");
                      else if (st.id === "thinking") setSelectedEye("thinking");
                      else setSelectedEye("normal");
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedState === st.id
                        ? "bg-[#162A23] border-[#68E7B5] text-[#F1EFE1] shadow-[0_0_12px_rgba(104,231,181,0.2)]"
                        : "bg-[#0D1815] border-[#2A4E42] text-[#AEBEB5] hover:text-[#F1EFE1]"
                    }`}
                  >
                    <span className="text-xs font-semibold block capitalize">{st.id}</span>
                    <span className="text-[10px] text-[#AEBEB5]/70 block truncate">{st.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Eye Expressions (Section 7) */}
            <div className="p-4 rounded-2xl bg-[#12201C] border border-[#2A4E42]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#68E7B5]">
                  2. Eye Expression Matrix (Section 7)
                </h3>
                <span className="text-[10px] font-mono text-[#AEBEB5]">6 Expressions</span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {EYES_LIST.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEye(e.id)}
                    className={`py-2 px-2 rounded-xl border text-center text-xs font-mono transition-all cursor-pointer ${
                      selectedEye === e.id
                        ? "bg-[#68E7B5] text-[#070D0C] font-bold border-[#68E7B5]"
                        : "bg-[#0D1815] border-[#2A4E42] text-[#AEBEB5] hover:text-[#F1EFE1]"
                    }`}
                  >
                    {e.id}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Workflow Stage Synchronization (Section 6) */}
            <div className="p-4 rounded-2xl bg-[#12201C] border border-[#2A4E42]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#68E7B5]">
                  3. Workflow Synchronization (Section 6)
                </h3>
                <span className="text-[10px] font-mono text-[#AEBEB5]">5-Stage Pipeline</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {WORKFLOW_STEPS.map((wf) => (
                  <button
                    key={wf.step}
                    onClick={() => {
                      setActiveWorkflowStep(wf.step);
                      if (wf.step === 1) {
                        setSelectedState("idle");
                        setSelectedEye("normal");
                      } else if (wf.step === 2) {
                        setSelectedState("working");
                        setSelectedEye("processing");
                      } else if (wf.step === 3) {
                        setSelectedState("working");
                        setSelectedEye("processing");
                      } else if (wf.step === 4) {
                        setSelectedState("thinking");
                        setSelectedEye("thinking");
                      } else if (wf.step === 5) {
                        setSelectedState("success");
                        setSelectedEye("happy");
                      }
                    }}
                    className={`p-2 rounded-xl border text-left text-xs font-mono transition-all cursor-pointer ${
                      activeWorkflowStep === wf.step
                        ? "bg-[#162A23] border-[#68E7B5] text-[#68E7B5] font-bold"
                        : "bg-[#0D1815] border-[#2A4E42] text-[#AEBEB5] hover:text-[#F1EFE1]"
                    }`}
                  >
                    <span className="block text-[11px] font-bold">Stage 0{wf.step}</span>
                    <span className="block text-[9px] text-[#AEBEB5]/70 truncate">&ldquo;{wf.msg}&rdquo;</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Specifications checklist footer */}
            <div className="grid grid-cols-3 gap-3 text-[11px] font-mono text-[#AEBEB5] pt-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#68E7B5]" />
                <span>Ivory-white shell</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#68E7B5]" />
                <span>Glossy black visor</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#68E7B5]" />
                <span>Mint-green eyes</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
