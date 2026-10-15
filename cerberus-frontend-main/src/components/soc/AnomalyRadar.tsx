'use client';

import React, { useState } from 'react';
import { Radio, Crosshair, AlertCircle } from 'lucide-react';
import { ThreatReport } from '@/types/telemetry';

export interface AnomalyRadarProps {
  threatReport: ThreatReport | null;
  className?: string;
}

export const AnomalyRadar: React.FC<AnomalyRadarProps> = ({
  threatReport,
  className = '',
}) => {
  const [hoveredNode, setHoveredNode] = useState<{
    id: string;
    ip: string;
    riskScore: number;
    level: string;
    isDecoyHit: boolean;
  } | null>(null);

  const radarNodes = threatReport?.radarNodes || [
    { id: '1', ip: '203.0.113.88', distance: 0.35, angle: 75, riskScore: 98, level: 'CRITICAL', isDecoyHit: true },
    { id: '2', ip: '198.51.100.42', distance: 0.65, angle: 210, riskScore: 84, level: 'HIGH', isDecoyHit: false },
    { id: '3', ip: '185.220.101.5', distance: 0.85, angle: 320, riskScore: 68, level: 'MEDIUM', isDecoyHit: false },
  ];

  // SVG Center & Radius
  const cx = 150;
  const cy = 150;
  const maxRadius = 120;

  return (
    <div
      data-testid="anomaly-radar"
      className={`rounded-xl border border-slate-800 bg-[#050b14]/90 backdrop-blur-md p-4 flex flex-col items-center justify-between shadow-2xl relative overflow-hidden ${className}`}
    >
      {/* Radar Header */}
      <div className="w-full flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2 font-mono text-xs">
        <div className="flex items-center gap-2 text-slate-300 font-semibold tracking-wider">
          <Radio className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
          <span>TOPOLOGICAL THREAT RADAR</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">NODES: </span>
          <span className="text-cyan-400 font-bold">{radarNodes.length}</span>
        </div>
      </div>

      {/* Radar SVG Container */}
      <div className="relative w-[300px] h-[300px] flex items-center justify-center my-2 select-none">
        <svg viewBox="0 0 300 300" className="w-full h-full">
          <defs>
            <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
              <stop offset="70%" stopColor="#050b14" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#030712" stopOpacity="0.9" />
            </radialGradient>

            <linearGradient id="sweepGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(6, 182, 212, 0.4)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>

          {/* Background circle */}
          <circle cx={cx} cy={cy} r={maxRadius} fill="url(#radarGlow)" />

          {/* Concentric distance rings */}
          <circle cx={cx} cy={cy} r={maxRadius * 0.25} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={cx} cy={cy} r={maxRadius * 0.5} fill="none" stroke="#1e293b" strokeWidth="1" />
          <circle cx={cx} cy={cy} r={maxRadius * 0.75} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={cx} cy={cy} r={maxRadius} fill="none" stroke="#334155" strokeWidth="1.5" />

          {/* Crosshairs */}
          <line x1={cx - maxRadius} y1={cy} x2={cx + maxRadius} y2={cy} stroke="#1e293b" strokeWidth="1" />
          <line x1={cx} y1={cy - maxRadius} x2={cx} y2={cy + maxRadius} stroke="#1e293b" strokeWidth="1" />

          {/* Core Zero-Trust Fortress */}
          <circle cx={cx} cy={cy} r="6" fill="#06b6d4" className="shadow-lg" />
          <circle cx={cx} cy={cy} r="12" fill="none" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.5" />

          {/* Radar Sweep Arm */}
          <g className="origin-center animate-radar-sweep" style={{ transformOrigin: `${cx}px ${cy}px` }}>
            <line x1={cx} y1={cy} x2={cx + maxRadius} y2={cy} stroke="#06b6d4" strokeWidth="1.5" strokeOpacity="0.9" />
            <path
              d={`M ${cx} ${cy} L ${cx + maxRadius} ${cy} A ${maxRadius} ${maxRadius} 0 0 0 ${cx} ${cy - maxRadius} Z`}
              fill="url(#sweepGradient)"
              opacity="0.35"
            />
          </g>

          {/* IP Threat Nodes */}
          {radarNodes.map((node) => {
            const rad = (node.angle * Math.PI) / 180;
            const r = node.distance * maxRadius;
            const x = cx + r * Math.cos(rad);
            const y = cy + r * Math.sin(rad);

            const isDecoy = node.isDecoyHit;
            const fillColor = isDecoy ? '#f43f5e' : node.riskScore > 75 ? '#f59e0b' : '#06b6d4';

            return (
              <g
                key={node.id}
                className="cursor-pointer transition-transform hover:scale-125"
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {isDecoy && (
                  <circle
                    cx={x}
                    cy={y}
                    r="9"
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="1.5"
                    className="animate-ping opacity-75"
                  />
                )}
                <circle cx={x} cy={y} r="5" fill={fillColor} />
                <circle cx={x} cy={y} r="2" fill="#ffffff" />
              </g>
            );
          })}
        </svg>

        {/* Hovered Node Tooltip Overlay */}
        {hoveredNode && (
          <div className="absolute top-2 left-2 z-10 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-950/95 font-mono text-[10px] text-slate-200 shadow-xl pointer-events-none">
            <div className="text-cyan-400 font-bold">{hoveredNode.ip}</div>
            <div>Risk Score: <span className="text-rose-400 font-bold">{hoveredNode.riskScore}/100</span></div>
            <div>Level: <span className="uppercase text-amber-400">{hoveredNode.level}</span></div>
            {hoveredNode.isDecoyHit && <div className="text-rose-400 font-bold">💥 Decoy Hit Detonated</div>}
          </div>
        )}
      </div>

      {/* Radar Legend */}
      <div className="w-full flex items-center justify-around pt-2 border-t border-slate-800/80 font-mono text-[10px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#06b6d4] inline-block" />
          <span>Core Vault</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#f59e0b] inline-block" />
          <span>Anomalous Node</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#f43f5e] inline-block animate-pulse" />
          <span>Decoy Detonation</span>
        </div>
      </div>
    </div>
  );
};
