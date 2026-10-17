"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";

interface ScrollRevealProps {
  children: React.ReactNode;
  direction?: "up" | "down" | "left" | "right" | "none";
  delay?: number;
  duration?: number;
  distance?: number;
  scale?: number;
  className?: string;
  viewportAmount?: number | "some" | "all";
}

export default function ScrollReveal({
  children,
  direction = "up",
  delay = 0,
  duration = 0.6,
  distance = 28,
  scale = 1,
  className = "",
  viewportAmount = 0.15,
}: ScrollRevealProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== "undefined" && window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  const effectiveDistance = isMobile ? Math.min(distance, 14) : distance;

  const getInitialPosition = () => {
    switch (direction) {
      case "left":
        return { x: -effectiveDistance, y: 0 };
      case "right":
        return { x: effectiveDistance, y: 0 };
      case "down":
        return { x: 0, y: -effectiveDistance };
      case "up":
        return { x: 0, y: effectiveDistance };
      case "none":
      default:
        return { x: 0, y: 0 };
    }
  };

  const pos = getInitialPosition();

  return (
    <motion.div
      initial={{
        opacity: 0,
        x: pos.x,
        y: pos.y,
        scale: scale !== 1 ? scale : 1,
      }}
      whileInView={{
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
      }}
      viewport={{ once: true, amount: viewportAmount }}
      transition={{
        duration,
        delay,
        ease: [0.16, 1, 0.3, 1], // easeOutExpo / fluid physics
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface StaggerContainerProps {
  children: React.ReactNode;
  staggerDelay?: number;
  delayChildren?: number;
  className?: string;
  viewportAmount?: number;
}

export function StaggerContainer({
  children,
  staggerDelay = 0.08,
  delayChildren = 0.05,
  className = "",
  viewportAmount = 0.15,
}: StaggerContainerProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: viewportAmount }}
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  direction = "up",
  distance = 20,
  duration = 0.55,
  className = "",
}: {
  children: React.ReactNode;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
  duration?: number;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== "undefined" && window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  const effectiveDistance = isMobile ? Math.min(distance, 12) : distance;

  const getInitialPosition = () => {
    switch (direction) {
      case "left":
        return { x: -effectiveDistance, y: 0 };
      case "right":
        return { x: effectiveDistance, y: 0 };
      case "down":
        return { x: 0, y: -effectiveDistance };
      case "up":
        return { x: 0, y: effectiveDistance };
      case "none":
      default:
        return { x: 0, y: 0 };
    }
  };

  const pos = getInitialPosition();

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, x: pos.x, y: pos.y },
        show: {
          opacity: 1,
          x: 0,
          y: 0,
          transition: {
            duration,
            ease: [0.16, 1, 0.3, 1],
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
