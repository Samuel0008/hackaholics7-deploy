'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Pause, Play, ArrowDownToLine, Trash2, ShieldAlert } from 'lucide-react';
import { TelemetryEvent } from '@/types/telemetry';

export interface AttackerTerminalProps {
  events: TelemetryEvent[];
  isPaused: boolean;
  onTogglePause: () => void;
  className?: string;
}

export const AttackerTerminal: React.FC<AttackerTerminalProps> = ({
  events,
  isPaused,
  onTogglePause,
  className = '',
}) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const getLevelBadgeClass = (level: string, isDecoy?: boolean) => {
    if (isDecoy || level === 'CRITICAL') {
      return 'text-rose-400 bg-rose-950/60 border border-rose-500/50 shadow-[0_0_8px_rgba(244,63,94,0.3)] font-bold';
    }
    if (level === 'HIGH') {
      return 'text-amber-400 bg-amber-950/40 border border-amber-500/30';
    }
    if (level === 'MEDIUM') {
      return 'text-yellow-400 bg-yellow-950/40 border border-yellow-500/30';
    }
    return 'text-cyan-400 bg-cyan-950/40 border border-cyan-500/30';
  };

  return (
    <div
      data-testid="attacker-terminal"
      className={`rounded-xl border border-slate-800 bg-[#050b14]/90 backdrop-blur-md flex flex-col font-mono text-xs shadow-2xl overflow-hidden ${className}`}
    >
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <div className="h-4 w-px bg-slate-800 mx-1.5" />
          <div className="flex items-center gap-2 text-slate-300 font-semibold tracking-wider">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>ATTACKER TELEMETRY FEED / EXPLOIT MONITOR</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll((prev) => !prev)}
            className={`p-1.5 rounded border text-[11px] flex items-center gap-1 transition-colors ${
              autoScroll
                ? 'border-cyan-500/40 bg-cyan-950/40 text-cyan-300'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
            title="Toggle Auto-Scroll"
          >
            <ArrowDownToLine className="w-3 h-3" />
            <span className="hidden sm:inline">AUTO-SCROLL</span>
          </button>

          <button
            onClick={onTogglePause}
            className={`p-1.5 rounded border text-[11px] flex items-center gap-1 transition-colors ${
              isPaused
                ? 'border-amber-500/40 bg-amber-950/40 text-amber-300'
                : 'border-slate-800 bg-slate-900 text-slate-300 hover:text-white'
            }`}
            title={isPaused ? 'Resume Stream' : 'Pause Stream'}
          >
            {isPaused ? <Play className="w-3 h-3 text-amber-400" /> : <Pause className="w-3 h-3" />}
            <span className="hidden sm:inline">{isPaused ? 'RESUME' : 'PAUSE'}</span>
          </button>
        </div>
      </div>

      {/* Terminal Log Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 p-4 overflow-y-auto space-y-2 max-h-[380px] min-h-[260px] scrollbar-thin select-text"
      >
        {events.length === 0 ? (
          <div className="text-slate-500 italic py-8 text-center">
            [SYS] Waiting for telemetry stream packets...
          </div>
        ) : (
          events.map((event, index) => (
            <div
              key={event.id || index}
              className={`p-2 rounded border transition-all ${
                event.isDecoyHit
                  ? 'border-rose-500/40 bg-rose-950/20'
                  : 'border-slate-900 bg-slate-950/40 hover:bg-slate-900/40'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-slate-500 text-[10px]">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${getLevelBadgeClass(
                    event.level,
                    event.isDecoyHit
                  )}`}
                >
                  {event.isDecoyHit ? 'HONEY-DETONATE' : event.level}
                </span>
                <span className="text-cyan-400 font-bold">{event.sourceIp}</span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-300">{event.targetResource}</span>
                {event.isDecoyHit && (
                  <span className="inline-flex items-center gap-1 text-rose-400 text-[10px] ml-auto">
                    <ShieldAlert className="w-3 h-3" />
                    DECOY BREACH
                  </span>
                )}
              </div>

              <div className="text-slate-300 text-[11px] pl-2 border-l border-slate-800">
                <span className="text-emerald-400 font-semibold">{event.action}</span>
                {event.details && Object.keys(event.details).length > 0 && (
                  <span className="text-slate-400 ml-2">
                    {JSON.stringify(event.details)}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Terminal Footer */}
      <div className="px-4 py-1.5 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
        <div>
          <span>PACKETS CAPTURED: </span>
          <span className="text-slate-300 font-bold">{events.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={isPaused ? 'text-amber-400' : 'text-emerald-400'}>
            ● {isPaused ? 'STREAM PAUSED' : 'STREAM ACTIVE (2.5s POLL)'}
          </span>
        </div>
      </div>
    </div>
  );
};
