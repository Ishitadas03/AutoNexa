"use client";

import React, { useRef, useMemo, useEffect, useState, Component, ErrorInfo, ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

class WebGLErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("WebGL Scene initialization failed, falling back to static visual:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function SceneContent({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireframeRef = useRef<THREE.LineSegments>(null);
  const particlesRef = useRef<THREE.Points>(null);

  // Generate particle cloud representing data manifold
  const particleCount = 140;
  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const col = new Float32Array(particleCount * 3);
    const goldColor = new THREE.Color("#F59E0B");
    const cyanColor = new THREE.Color("#38BDF8");
    const slateColor = new THREE.Color("#64748B");

    for (let i = 0; i < particleCount; i++) {
      // Disperse in a sphere
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * 3.5 + 0.8;

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      // Color distribution (mostly gold and technical cyan/slate)
      const mixRatio = Math.random();
      const chosenColor = mixRatio > 0.5 ? goldColor : mixRatio > 0.2 ? cyanColor : slateColor;
      col[i * 3] = chosenColor.r;
      col[i * 3 + 1] = chosenColor.g;
      col[i * 3 + 2] = chosenColor.b;
    }
    return [pos, col];
  }, []);

  useFrame((state, delta) => {
    if (prefersReducedMotion) return;

    // Gentle constant rotation of geometric core
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.12;
      meshRef.current.rotation.y += delta * 0.18;
    }
    if (wireframeRef.current) {
      wireframeRef.current.rotation.x += delta * 0.12;
      wireframeRef.current.rotation.y += delta * 0.18;
    }

    // Slow orbital drift for particles
    if (particlesRef.current) {
      particlesRef.current.rotation.y -= delta * 0.05;
      particlesRef.current.rotation.z += delta * 0.02;
    }
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} color="#FFFBEB" />
      <pointLight position={[-3, -3, 2]} intensity={1.5} color="#F59E0B" />
      <pointLight position={[3, 2, -2]} intensity={1.0} color="#0EA5E9" />

      {/* Central Geometric Polyhedron (AutoML Core representation) */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.4, 0]} />
        <meshPhysicalMaterial
          color="#0F172A"
          roughness={0.2}
          metalness={0.8}
          transmission={0.4}
          thickness={0.5}
          reflectivity={0.9}
          clearcoat={1}
        />
      </mesh>

      {/* Golden Wireframe Overlay */}
      <lineSegments ref={wireframeRef}>
        <wireframeGeometry args={[new THREE.IcosahedronGeometry(1.41, 0)]} />
        <lineBasicMaterial color="#FBBF24" transparent opacity={0.65} linewidth={1.5} />
      </lineSegments>

      {/* Particle network of tabular features */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.065}
          vertexColors
          transparent
          opacity={0.85}
          sizeAttenuation
        />
      </points>
    </>
  );
}

function StaticFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
      <div className="w-[380px] h-[380px] rounded-full bg-gradient-to-tr from-amber-500/15 via-sky-500/10 to-transparent blur-3xl animate-pulse" />
      <div className="w-56 h-56 rounded-full border border-amber-500/20 rotate-45 animate-spin [animation-duration:40s]" />
      <div className="absolute w-44 h-44 rounded-full border border-sky-500/20 -rotate-12 animate-spin [animation-duration:30s]" />
    </div>
  );
}

export default function HeroScene() {
  const [mounted, setMounted] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [hasWebGL, setHasWebGL] = useState(true);

  useEffect(() => {
    setMounted(true);
    // Check reduced motion
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(motionQuery.matches);
    const motionHandler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    motionQuery.addEventListener("change", motionHandler);

    // Check WebGL availability
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      setHasWebGL(Boolean(gl));
    } catch {
      setHasWebGL(false);
    }

    return () => {
      motionQuery.removeEventListener("change", motionHandler);
    };
  }, []);

  if (!mounted) {
    return <StaticFallback />;
  }

  if (!hasWebGL) {
    return <StaticFallback />;
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      <WebGLErrorBoundary fallback={<StaticFallback />}>
        <Canvas
          camera={{ position: [0, 0, 5.5], fov: 45 }}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          dpr={[1, 1.5]} // cap DPR to prevent high GPU usage
          style={{ pointerEvents: "none" }}
        >
          <SceneContent prefersReducedMotion={prefersReducedMotion} />
        </Canvas>
      </WebGLErrorBoundary>
    </div>
  );
}
