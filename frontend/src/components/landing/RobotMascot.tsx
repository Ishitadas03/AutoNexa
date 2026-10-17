"use client";

import React, { useState, useEffect, useRef } from "react";

export type RobotState = "idle" | "hover" | "working" | "success" | "thinking";
export type RobotEyeExpression = "normal" | "blinking" | "happy" | "thinking" | "processing" | "success";
export type RobotPose = "sitting" | "standing";

interface RobotMascotProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  state?: RobotState;
  eyeExpression?: RobotEyeExpression;
  pose?: RobotPose;
  message?: string;
  showMessage?: boolean;
  isInteractive?: boolean;
  onClick?: () => void;
  // Workflow stage sync: 1..5 or '01'..'05'
  stage?: number | string;
}

export default function RobotMascot({
  className = "",
  size = "md",
  state: controlledState,
  eyeExpression: controlledEye,
  pose = "sitting",
  message: controlledMessage,
  showMessage: controlledShowMessage,
  isInteractive = true,
  onClick,
  stage,
}: RobotMascotProps) {
  // Internal state when not externally forced
  const [isHovered, setIsHovered] = useState(false);
  const [internalState, setInternalState] = useState<RobotState>("idle");
  const [isBlinking, setIsBlinking] = useState(false);
  const [clickReaction, setClickReaction] = useState<RobotState | null>(null);
  const blinkTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Workflow stage auto-sync
  const stageNum = typeof stage === "string" ? parseInt(stage, 10) : stage;

  // Determine effective state
  const effectiveState: RobotState =
    clickReaction ||
    controlledState ||
    (isHovered && isInteractive
      ? "hover"
      : stageNum === 1
      ? "idle"
      : stageNum === 2
      ? "working"
      : stageNum === 3
      ? "working"
      : stageNum === 4
      ? "thinking"
      : stageNum === 5
      ? "success"
      : internalState);

  // Determine effective eye expression
  const effectiveEye: RobotEyeExpression =
    controlledEye ||
    (isBlinking
      ? "blinking"
      : effectiveState === "working"
      ? "processing"
      : effectiveState === "success"
      ? "happy"
      : effectiveState === "thinking"
      ? "thinking"
      : effectiveState === "hover"
      ? "happy"
      : "normal");

  // Determine speech / thought message
  const defaultMessages: Record<RobotState, string> = {
    idle: "Ready to assist",
    hover: "Hi! 👋",
    working: stageNum === 2 ? "Analyzing dataset..." : "Training models...",
    success: stageNum === 5 ? "Here are your predictions!" : "Task Complete! ✨",
    thinking: "Evaluating results...",
  };

  const stageMessages: Record<number, string> = {
    1: "Let's start with your data!",
    2: "Analyzing dataset...",
    3: "Training models...",
    4: "Evaluating results...",
    5: "Here are your predictions!",
  };

  const effectiveMessage =
    controlledMessage ||
    (stageNum && stageMessages[stageNum]) ||
    defaultMessages[effectiveState];

  const shouldShowMessage =
    controlledShowMessage !== undefined
      ? controlledShowMessage
      : isHovered || effectiveState !== "idle";

  // Natural eye blink interval in idle / hover
  useEffect(() => {
    const scheduleNextBlink = () => {
      const delay = Math.random() * 3000 + 2500; // blink every 2.5s - 5.5s
      blinkTimerRef.current = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 160);
        scheduleNextBlink();
      }, delay);
    };

    scheduleNextBlink();
    return () => {
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);
    };
  }, []);

  // Click interaction reaction
  const handleClick = () => {
    if (onClick) {
      onClick();
    }
    if (!isInteractive) return;

    // Cycle through cheerful reaction
    const next: RobotState = effectiveState === "hover" ? "success" : "hover";
    setClickReaction(next);
    setTimeout(() => {
      setClickReaction(null);
    }, 1800);
  };

  // Dimensions configuration
  const sizeMap = {
    xs: { width: "w-16 h-20", scale: 0.65 },
    sm: { width: "w-24 h-28 sm:w-28 sm:h-32", scale: 0.85 },
    md: { width: "w-36 h-44 sm:w-44 sm:h-52", scale: 1.0 },
    lg: { width: "w-48 h-56 sm:w-56 sm:h-64", scale: 1.25 },
    xl: { width: "w-60 h-72 sm:w-72 sm:h-80", scale: 1.5 },
  }[size];

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative select-none flex flex-col items-center justify-center ${sizeMap.width} ${
        isInteractive ? "cursor-pointer group" : ""
      } ${className}`}
      title={isInteractive ? "AutoNexa Bot (Click to interact)" : undefined}
    >
      <style jsx>{`
        /* Floating Physics */
        @keyframes floatIdle {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-8px) rotate(1.5deg);
          }
        }
        @keyframes floatWorking {
          0%, 100% {
            transform: translateY(-2px) rotate(0deg);
          }
          50% {
            transform: translateY(-9px) rotate(-1deg);
          }
        }
        @keyframes cheerJump {
          0%, 100% {
            transform: translateY(0px) scale(1);
          }
          30% {
            transform: translateY(-14px) scale(1.05);
          }
          60% {
            transform: translateY(-4px) scale(0.98);
          }
        }
        @keyframes headTiltThinking {
          0%, 100% {
            transform: rotate(-7deg) translateY(-2px);
          }
          50% {
            transform: rotate(-5deg) translateY(-4px);
          }
        }

        /* Hand Waves */
        @keyframes waveRightHand {
          0%, 100% {
            transform: rotate(-15deg);
          }
          25% {
            transform: rotate(-45deg);
          }
          50% {
            transform: rotate(-20deg);
          }
          75% {
            transform: rotate(-40deg);
          }
        }
        @keyframes armsCheering {
          0%, 100% {
            transform: rotate(-50deg);
          }
          50% {
            transform: rotate(-65deg);
          }
        }
        @keyframes armsCheeringLeft {
          0%, 100% {
            transform: rotate(50deg);
          }
          50% {
            transform: rotate(65deg);
          }
        }

        /* Antenna Pulses */
        @keyframes antennaPulseSlow {
          0%, 100% {
            opacity: 0.8;
            transform: scale(1);
            filter: drop-shadow(0 0 4px #68E7B5);
          }
          50% {
            opacity: 1;
            transform: scale(1.25);
            filter: drop-shadow(0 0 10px #68E7B5);
          }
        }
        @keyframes antennaPulseFast {
          0%, 100% {
            opacity: 0.7;
            transform: scale(1);
            filter: drop-shadow(0 0 5px #68E7B5);
          }
          50% {
            opacity: 1;
            transform: scale(1.4);
            filter: drop-shadow(0 0 16px #68E7B5);
          }
        }
        @keyframes antennaSuccessRadiance {
          0%, 100% {
            transform: scale(1.1);
            filter: drop-shadow(0 0 12px #68E7B5) drop-shadow(0 0 20px #2A916E);
          }
          50% {
            transform: scale(1.4);
            filter: drop-shadow(0 0 18px #68E7B5) drop-shadow(0 0 28px #68E7B5);
          }
        }

        /* Radar Scanner Eye */
        @keyframes radarScan {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        /* Speech Bubble Fade / Float */
        @keyframes bubbleEntrance {
          0% {
            opacity: 0;
            transform: translateY(6px) scale(0.92);
          }
          100% {
            opacity: 1;
            transform: translateY(0px) scale(1);
          }
        }

        .bot-float-idle {
          animation: floatIdle 3.8s ease-in-out infinite;
        }
        .bot-float-working {
          animation: floatWorking 1.6s ease-in-out infinite;
        }
        .bot-cheer {
          animation: cheerJump 1.2s ease-in-out infinite;
        }
        .bot-thinking {
          animation: headTiltThinking 3s ease-in-out infinite;
        }

        .bot-hand-wave {
          animation: waveRightHand 0.45s ease-in-out infinite;
          transform-origin: 145px 138px;
        }
        .bot-arm-cheer-right {
          animation: armsCheering 0.8s ease-in-out infinite;
          transform-origin: 145px 138px;
        }
        .bot-arm-cheer-left {
          animation: armsCheeringLeft 0.8s ease-in-out infinite;
          transform-origin: 55px 138px;
        }

        .antenna-idle {
          animation: antennaPulseSlow 2.4s ease-in-out infinite;
          transform-origin: 100px 24px;
        }
        .antenna-working {
          animation: antennaPulseFast 0.65s ease-in-out infinite;
          transform-origin: 100px 24px;
        }
        .antenna-success {
          animation: antennaSuccessRadiance 1.2s ease-in-out infinite;
          transform-origin: 100px 24px;
        }
        .antenna-thinking {
          opacity: 0.5;
          filter: drop-shadow(0 0 3px #2A916E);
        }

        .eye-radar {
          animation: radarScan 1.5s linear infinite;
          transform-origin: center;
        }

        .bubble-anim {
          animation: bubbleEntrance 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .bot-float-idle,
          .bot-float-working,
          .bot-cheer,
          .bot-thinking,
          .bot-hand-wave,
          .bot-arm-cheer-right,
          .bot-arm-cheer-left,
          .antenna-idle,
          .antenna-working,
          .antenna-success,
          .eye-radar,
          .bubble-anim {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* Dynamic Speech / Reaction Bubble */}
      {shouldShowMessage && (
        <div className="absolute -top-10 sm:-top-12 z-30 pointer-events-none bubble-anim">
          <div className="px-3 py-1.5 rounded-full bg-[#0D1815]/95 border border-[#2A4E42] shadow-[0_6px_20px_rgba(0,0,0,0.6)] backdrop-blur-md flex items-center gap-1.5 text-xs font-mono text-[#F1EFE1] whitespace-nowrap">
            {effectiveState === "working" && (
              <span className="w-2 h-2 rounded-full bg-[#68E7B5] animate-ping" />
            )}
            {effectiveState === "success" && (
              <span className="w-3.5 h-3.5 rounded-full bg-[#162A23] border border-[#68E7B5] text-[#68E7B5] flex items-center justify-center text-[9px] font-bold">
                ✓
              </span>
            )}
            {effectiveState === "thinking" && (
              <span className="text-[#68E7B5] font-bold">···</span>
            )}
            <span>{effectiveMessage}</span>
          </div>
          {/* Cute pointer triangle */}
          <div className="w-2 h-2 bg-[#0D1815] border-r border-b border-[#2A4E42] rotate-45 mx-auto -mt-1" />
        </div>
      )}

      {/* Subtle Ground / Base Contact Shadow */}
      <div className="absolute bottom-1 w-3/5 h-3 bg-[#000000]/80 rounded-full blur-md pointer-events-none transition-all duration-300 group-hover:scale-110 opacity-70" />

      {/* Main Robot Structure with Dynamic Motion Classes */}
      <div
        className={`relative w-full h-full flex flex-col items-center justify-center transition-transform duration-300 ${
          isHovered ? "scale-105" : "scale-100"
        } ${
          effectiveState === "working"
            ? "bot-float-working"
            : effectiveState === "success"
            ? "bot-cheer"
            : effectiveState === "thinking"
            ? "bot-thinking"
            : "bot-float-idle"
        }`}
      >
        <svg
          viewBox="0 0 200 240"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]"
        >
          <defs>
            {/* Ivory White Ceramic Body Gradients */}
            <linearGradient id="ivoryHeadGrad" x1="100" y1="40" x2="100" y2="125" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="45%" stopColor="#F2F6F3" />
              <stop offset="85%" stopColor="#DFE7E1" />
              <stop offset="100%" stopColor="#C8D4CC" />
            </linearGradient>

            <linearGradient id="ivoryBodyGrad" x1="100" y1="125" x2="100" y2="195" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="50%" stopColor="#EDF3EF" />
              <stop offset="90%" stopColor="#D5DFD8" />
              <stop offset="100%" stopColor="#BFCBC3" />
            </linearGradient>

            <linearGradient id="darkJointsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1E362D" />
              <stop offset="100%" stopColor="#0B1512" />
            </linearGradient>

            {/* Glossy Black Visor Gradient */}
            <linearGradient id="visorScreenGrad" x1="100" y1="62" x2="100" y2="110" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#0E1A16" />
              <stop offset="60%" stopColor="#060C0A" />
              <stop offset="100%" stopColor="#040807" />
            </linearGradient>

            {/* Glowing Mint Accent Filter */}
            <filter id="mintGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            <filter id="intenseMintGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="blur1" />
              <feGaussianBlur stdDeviation="9" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ===================================================================
              ANTENNA ASSEMBLY
              =================================================================== */}
          <g id="antenna">
            {/* Concentric Signal Rings in Working / Success States */}
            {effectiveState === "working" && (
              <g className="animate-ping" style={{ transformOrigin: "100px 24px" }}>
                <circle cx="100" cy="24" r="14" stroke="#68E7B5" strokeWidth="1.5" opacity="0.4" fill="none" />
              </g>
            )}
            {effectiveState === "success" && (
              <g>
                <circle cx="100" cy="24" r="18" stroke="#68E7B5" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.6" fill="none" className="animate-spin" style={{ transformOrigin: "100px 24px" }} />
                <circle cx="100" cy="24" r="26" stroke="#2A916E" strokeWidth="1" opacity="0.3" fill="none" />
              </g>
            )}

            {/* Antenna Stem */}
            <path
              d="M 98 42 L 98 27 Q 98 25 100 25 Q 102 25 102 27 L 102 42 Z"
              fill="url(#darkJointsGrad)"
              stroke="#2A4E42"
              strokeWidth="1"
            />

            {/* Antenna Glowing Orb */}
            <circle
              cx="100"
              cy="24"
              r="6.5"
              fill="#68E7B5"
              className={
                effectiveState === "working"
                  ? "antenna-working"
                  : effectiveState === "success"
                  ? "antenna-success"
                  : effectiveState === "thinking"
                  ? "antenna-thinking"
                  : "antenna-idle"
              }
              filter="url(#mintGlow)"
            />
            {/* Highlight specular dot on orb */}
            <circle cx="98" cy="22" r="1.8" fill="#FFFFFF" opacity="0.8" />
          </g>

          {/* ===================================================================
              EAR BOLTS & SIDE COMM PODS
              =================================================================== */}
          <g id="ear-pods">
            {/* Left Ear Pod */}
            <rect x="34" y="70" width="10" height="24" rx="4" fill="#D5DFD8" stroke="#2A4E42" strokeWidth="1.5" />
            <circle cx="39" cy="82" r="3.5" fill="#12201C" />
            <circle cx="39" cy="82" r="1.5" fill="#68E7B5" opacity="0.9" />

            {/* Right Ear Pod */}
            <rect x="156" y="70" width="10" height="24" rx="4" fill="#D5DFD8" stroke="#2A4E42" strokeWidth="1.5" />
            <circle cx="161" cy="82" r="3.5" fill="#12201C" />
            <circle cx="161" cy="82" r="1.5" fill="#68E7B5" opacity="0.9" />
          </g>

          {/* ===================================================================
              HEAD (Ivory Shell + Glossy Visor Screen)
              =================================================================== */}
          <g id="head">
            {/* Ivory Helmet Outer Shell */}
            <rect
              x="40"
              y="40"
              width="120"
              height="84"
              rx="36"
              fill="url(#ivoryHeadGrad)"
              stroke="#BFCBC3"
              strokeWidth="1.5"
            />
            {/* Subtle chin accent line */}
            <path
              d="M 68 122 Q 100 126 132 122"
              stroke="#2A4E42"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.6"
            />

            {/* Helmet Specular Highlight Arc */}
            <path
              d="M 58 48 Q 100 42 142 48"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.75"
            />

            {/* Glossy Black Visor Frame & Screen */}
            <rect
              x="53"
              y="58"
              width="94"
              height="54"
              rx="22"
              fill="url(#visorScreenGrad)"
              stroke="#1E362D"
              strokeWidth="2"
            />
            {/* Inner Visor Shadow */}
            <rect
              x="54"
              y="59"
              width="92"
              height="52"
              rx="21"
              fill="none"
              stroke="#040807"
              strokeWidth="1.5"
            />

            {/* Curved Visor Glass Reflection */}
            <path
              d="M 58 66 Q 90 60 140 68 Q 115 76 62 74 Z"
              fill="#FFFFFF"
              opacity="0.08"
            />

            {/* ===============================================================
                EYES — DYNAMIC EXPRESSION SWITCHER
                =============================================================== */}
            <g id="eyes" filter="url(#mintGlow)">
              {effectiveEye === "normal" && (
                /* NORMAL EYES: Two rounded vertical pill capsules */
                <g>
                  <rect x="74" y="74" width="12" height="22" rx="6" fill="#68E7B5" />
                  <rect x="114" y="74" width="12" height="22" rx="6" fill="#68E7B5" />
                  {/* Subtle inner eye glint */}
                  <circle cx="77" cy="78" r="2" fill="#FFFFFF" opacity="0.9" />
                  <circle cx="117" cy="78" r="2" fill="#FFFFFF" opacity="0.9" />
                </g>
              )}

              {effectiveEye === "blinking" && (
                /* BLINKING: Thin horizontal glowing slits */
                <g>
                  <rect x="72" y="84" width="16" height="3" rx="1.5" fill="#68E7B5" />
                  <rect x="112" y="84" width="16" height="3" rx="1.5" fill="#68E7B5" />
                </g>
              )}

              {effectiveEye === "happy" && (
                /* HAPPY: Upward smiling crescent curves (⌒ ⌒) */
                <g>
                  <path
                    d="M 72 87 Q 80 73 88 87"
                    stroke="#68E7B5"
                    strokeWidth="4"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M 112 87 Q 120 73 128 87"
                    stroke="#68E7B5"
                    strokeWidth="4"
                    strokeLinecap="round"
                    fill="none"
                  />
                </g>
              )}

              {effectiveEye === "thinking" && (
                /* THINKING: Pupils shifted upward/right with curious gaze */
                <g>
                  <ellipse cx="80" cy="77" rx="7" ry="9" fill="#68E7B5" />
                  <ellipse cx="120" cy="77" rx="7" ry="9" fill="#68E7B5" />
                  <circle cx="82" cy="75" r="2.2" fill="#FFFFFF" opacity="0.95" />
                  <circle cx="122" cy="75" r="2.2" fill="#FFFFFF" opacity="0.95" />
                </g>
              )}

              {effectiveEye === "processing" && (
                /* PROCESSING: Radar / concentric scanner rings */
                <g>
                  <circle cx="80" cy="85" r="9" stroke="#68E7B5" strokeWidth="2.5" fill="none" opacity="0.9" />
                  <circle cx="80" cy="85" r="4" fill="#68E7B5" />
                  <circle cx="120" cy="85" r="9" stroke="#68E7B5" strokeWidth="2.5" fill="none" opacity="0.9" />
                  <circle cx="120" cy="85" r="4" fill="#68E7B5" />
                  {/* Rotating radar indicator */}
                  <g className="eye-radar" style={{ transformOrigin: "80px 85px" }}>
                    <line x1="80" y1="85" x2="87" y2="80" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                  </g>
                  <g className="eye-radar" style={{ transformOrigin: "120px 85px" }}>
                    <line x1="120" y1="85" x2="127" y2="80" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                  </g>
                </g>
              )}

              {effectiveEye === "success" && (
                /* SUCCESS: Joyful curved arches with sparkle star */
                <g>
                  <path
                    d="M 72 86 Q 80 72 88 86"
                    stroke="#68E7B5"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M 112 86 Q 120 72 128 86"
                    stroke="#68E7B5"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                  {/* Tiny sparkle stars */}
                  <path d="M 67 76 L 69 72 L 71 76 L 75 78 L 71 80 L 69 84 L 67 80 L 63 78 Z" fill="#68E7B5" opacity="0.9" />
                  <path d="M 133 76 L 135 72 L 137 76 L 141 78 L 137 80 L 135 84 L 133 80 L 129 78 Z" fill="#68E7B5" opacity="0.9" />
                </g>
              )}
            </g>
          </g>

          {/* ===================================================================
              NECK ARTICULATION
              =================================================================== */}
          <rect x="88" y="122" width="24" height="8" rx="3" fill="#162A23" stroke="#2A4E42" strokeWidth="1" />

          {/* ===================================================================
              ARMS (Left & Right with wave / cheer animations)
              =================================================================== */}
          <g id="arms">
            {/* Left Arm */}
            <g
              className={
                effectiveState === "success"
                  ? "bot-arm-cheer-left"
                  : ""
              }
            >
              <rect
                x="44"
                y="136"
                width="14"
                height="38"
                rx="7"
                fill="url(#ivoryBodyGrad)"
                stroke="#BFCBC3"
                strokeWidth="1.2"
                transform="rotate(8 51 136)"
              />
              {/* Shoulder joint */}
              <circle cx="51" cy="138" r="6" fill="#162A23" stroke="#2A4E42" strokeWidth="1" />
            </g>

            {/* Right Arm */}
            <g
              className={
                effectiveState === "success"
                  ? "bot-arm-cheer-right"
                  : effectiveState === "hover"
                  ? "bot-hand-wave"
                  : ""
              }
            >
              <rect
                x="142"
                y="136"
                width="14"
                height="38"
                rx="7"
                fill="url(#ivoryBodyGrad)"
                stroke="#BFCBC3"
                strokeWidth="1.2"
                transform="rotate(-8 149 136)"
              />
              {/* Shoulder joint */}
              <circle cx="149" cy="138" r="6" fill="#162A23" stroke="#2A4E42" strokeWidth="1" />
              {/* Right hand glove highlight */}
              <circle cx="147" cy="170" r="5" fill="#D5DFD8" />
            </g>
          </g>

          {/* ===================================================================
              TORSO / CHEST (Ivory shell + AutoNexa 'A' Emblem Plate)
              =================================================================== */}
          <g id="torso">
            {/* Body Outer Shell */}
            <rect
              x="60"
              y="128"
              width="80"
              height="64"
              rx="24"
              fill="url(#ivoryBodyGrad)"
              stroke="#BFCBC3"
              strokeWidth="1.5"
            />

            {/* Torso Top Specular Highlight */}
            <path
              d="M 72 134 Q 100 131 128 134"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.8"
            />

            {/* Recessed Chest Display Plate */}
            <rect
              x="83"
              y="142"
              width="34"
              height="30"
              rx="10"
              fill="#070D0C"
              stroke="#2A4E42"
              strokeWidth="1.5"
            />

            {/* AutoNexa Emerald 'A' Logo */}
            <g transform="translate(90, 147) scale(0.65)" filter="url(#mintGlow)">
              <path d="M16 4 L6 24 L11 24 L16 13 L21 24 L26 24 Z" fill="#68E7B5" />
              <path d="M12 18 L20 18 L18 21 L14 21 Z" fill="#2A916E" />
            </g>

            {/* Status Pulse Indicator Bar */}
            <rect x="91" y="165" width="18" height="2" rx="1" fill="#68E7B5" opacity="0.8" />
          </g>

          {/* ===================================================================
              LEGS & BASE
              =================================================================== */}
          <g id="legs">
            {pose === "sitting" ? (
              /* Sitting Pose: Folded chubby legs in front */
              <g>
                {/* Left foot */}
                <ellipse cx="78" cy="194" rx="15" ry="9" fill="url(#ivoryBodyGrad)" stroke="#BFCBC3" strokeWidth="1.2" />
                <ellipse cx="78" cy="195" rx="11" ry="5" fill="#12201C" stroke="#2A4E42" strokeWidth="1" />

                {/* Right foot */}
                <ellipse cx="122" cy="194" rx="15" ry="9" fill="url(#ivoryBodyGrad)" stroke="#BFCBC3" strokeWidth="1.2" />
                <ellipse cx="122" cy="195" rx="11" ry="5" fill="#12201C" stroke="#2A4E42" strokeWidth="1" />
              </g>
            ) : (
              /* Standing Pose: Short rounded legs */
              <g>
                <rect x="74" y="188" width="16" height="22" rx="7" fill="url(#ivoryBodyGrad)" stroke="#BFCBC3" strokeWidth="1.2" />
                <ellipse cx="82" cy="208" rx="12" ry="5" fill="#12201C" stroke="#2A4E42" strokeWidth="1" />

                <rect x="110" y="188" width="16" height="22" rx="7" fill="url(#ivoryBodyGrad)" stroke="#BFCBC3" strokeWidth="1.2" />
                <ellipse cx="118" cy="208" rx="12" ry="5" fill="#12201C" stroke="#2A4E42" strokeWidth="1" />
              </g>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}
