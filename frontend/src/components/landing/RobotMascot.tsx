"use client";

import React, { useState } from "react";

interface RobotMascotProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  isInteractive?: boolean;
}

export default function RobotMascot({
  className = "",
  size = "md",
  isInteractive = true,
}: RobotMascotProps) {
  const [isWaving, setIsWaving] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);

  const sizeClasses = {
    sm: "w-24 h-28",
    md: "w-36 h-44 sm:w-44 sm:h-52",
    lg: "w-52 h-60",
  }[size];

  const triggerInteraction = () => {
    if (!isInteractive) return;
    setIsWaving(true);
    setIsBlinking(true);
    setTimeout(() => setIsBlinking(false), 300);
    setTimeout(() => setIsWaving(false), 1600);
  };

  return (
    <div
      onClick={triggerInteraction}
      className={`relative select-none flex flex-col items-center justify-center ${sizeClasses} ${
        isInteractive ? "cursor-pointer group" : ""
      } ${className}`}
      title={isInteractive ? "Click AutoNexa Bot!" : undefined}
    >
      <style jsx>{`
        @keyframes floatIdle {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-8px) rotate(1deg);
          }
        }
        @keyframes eyeGlow {
          0%, 100% {
            opacity: 0.95;
            filter: drop-shadow(0 0 6px #68E7B5);
          }
          50% {
            opacity: 0.8;
            filter: drop-shadow(0 0 3px #2A916E);
          }
        }
        @keyframes blink {
          0%, 90%, 100% {
            transform: scaleY(1);
          }
          95% {
            transform: scaleY(0.1);
          }
        }
        @keyframes waveHand {
          0%, 100% {
            transform: rotate(0deg);
          }
          25% {
            transform: rotate(-25deg);
          }
          75% {
            transform: rotate(20deg);
          }
        }
        .robot-floating {
          animation: floatIdle 4s ease-in-out infinite;
        }
        .robot-eye {
          animation: blink 4s infinite, eyeGlow 2.5s infinite;
          transform-origin: center;
        }
        .robot-eye-blink {
          transform: scaleY(0.1) !important;
        }
        .robot-hand-wave {
          animation: waveHand 0.4s ease-in-out 4;
          transform-origin: top right;
        }
      `}</style>

      {/* Subtle ambient platform shadow */}
      <div className="absolute bottom-2 w-3/4 h-3 bg-emerald-950/80 rounded-full blur-md opacity-60 pointer-events-none" />

      {/* Floating Robot Body Structure */}
      <div className="robot-floating relative w-full h-full flex flex-col items-center">
        {/* Antennas */}
        <div className="relative flex items-center justify-center -mb-1 z-0">
          <div className="w-1.5 h-3 bg-gradient-to-t from-[#2A4E42] to-[#68E7B5] rounded-full" />
          <div className="absolute -top-1 w-2.5 h-2.5 rounded-full bg-[#68E7B5] shadow-[0_0_8px_#68E7B5] animate-pulse" />
        </div>

        {/* Head */}
        <div className="relative w-28 h-20 sm:w-32 sm:h-22 rounded-2xl bg-gradient-to-b from-[#1E362D] via-[#162A23] to-[#0D1815] border border-[#336152] shadow-[0_8px_20px_rgba(0,0,0,0.6)] flex items-center justify-center p-2 z-10">
          {/* Side ear bolts */}
          <div className="absolute -left-2 w-2 h-5 rounded-l-md bg-[#2A4E42] border-l border-y border-[#336152]" />
          <div className="absolute -right-2 w-2 h-5 rounded-r-md bg-[#2A4E42] border-r border-y border-[#336152]" />

          {/* Visor Screen */}
          <div className="w-full h-full rounded-xl bg-[#070D0C] border border-[#19332A] flex items-center justify-center gap-4 px-3 relative overflow-hidden shadow-inner">
            {/* Soft scanline gloss reflection */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent pointer-events-none" />

            {/* Left Eye */}
            <div
              className={`w-4 h-6 sm:w-5 sm:h-7 rounded-full bg-[#68E7B5] robot-eye ${
                isBlinking ? "robot-eye-blink" : ""
              }`}
            />
            {/* Right Eye */}
            <div
              className={`w-4 h-6 sm:w-5 sm:h-7 rounded-full bg-[#68E7B5] robot-eye ${
                isBlinking ? "robot-eye-blink" : ""
              }`}
            />
          </div>
        </div>

        {/* Neck */}
        <div className="w-8 h-2 bg-[#12201C] border-x border-[#2A4E42] -my-0.5 z-0" />

        {/* Torso / Body */}
        <div className="relative w-22 h-18 sm:w-26 sm:h-20 rounded-2xl bg-gradient-to-b from-[#162A23] to-[#0D1815] border border-[#2A4E42] flex flex-col items-center justify-center p-2 z-10 shadow-[0_10px_25px_rgba(0,0,0,0.5)]">
          {/* Chest Brand Emblem: AutoNexa 'A' */}
          <div className="w-7 h-7 rounded-lg bg-[#070D0C] border border-[#2A4E42] flex items-center justify-center shadow-inner group-hover:border-[#68E7B5] transition-colors">
            <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
              <path d="M16 4 L6 24 L11 24 L16 13 L21 24 L26 24 Z" fill="#68E7B5" />
              <path d="M12 18 L20 18 L18 21 L14 21 Z" fill="#2A916E" />
            </svg>
          </div>

          {/* Status Heartbeat Dot */}
          <div className="mt-1.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#68E7B5] animate-ping opacity-75" />
            <span className="text-[9px] font-mono tracking-wider text-[#AEBEB5]">ACTIVE</span>
          </div>

          {/* Left Arm */}
          <div className="absolute -left-2.5 top-2 w-3 h-8 rounded-full bg-[#162A23] border border-[#2A4E42] origin-top rotate-12" />

          {/* Right Arm (Waving) */}
          <div
            className={`absolute -right-2.5 top-2 w-3 h-8 rounded-full bg-[#162A23] border border-[#2A4E42] origin-top -rotate-12 ${
              isWaving ? "robot-hand-wave" : "group-hover:-rotate-30 transition-transform"
            }`}
          />
        </div>

        {/* Small Legs / Base */}
        <div className="flex gap-4 -mt-1 z-0">
          <div className="w-4 h-3 rounded-b-md bg-[#12201C] border border-t-0 border-[#2A4E42]" />
          <div className="w-4 h-3 rounded-b-md bg-[#12201C] border border-t-0 border-[#2A4E42]" />
        </div>
      </div>
    </div>
  );
}
