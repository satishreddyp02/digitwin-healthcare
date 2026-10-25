import { useEffect, useRef, useState } from "react";
import heartExternal from "../assets/heart_external.png";
import heartInternal from "../assets/heart_internal.png";

/**
 * Realistic Cardiac Digital Twin Visualization
 * 
 * Features exact user-selected medical references:
 * 1. External Anatomy: Exact 1st image (Aorta with 3 branches, blue SVC & Pulmonary trunk, auricles, LAD vessels)
 * 2. Internal Cavity Cutaway: Exact 2nd image (Coronal dissection showing 12 mm LV wall, papillary muscles,
 *    chordae tendineae, mitral/tricuspid valves, and IVS)
 * 3. Continuous 60 fps Biophysical Pumping (Smooth Wiggers cardiac cycle, zero blinking)
 * 4. Interactive Callouts pinpointed to exact anatomical landmarks in both views
 * 5. Volumetric Telemetry mapped to 0D Windkessel parameters (EDV, ESV, SV, CO)
 */
export default function Heart3D({ sbp = 120, dbp = 80, hr = 72, ef = 55, edv = 120 }) {
  const [crossSection, setCrossSection] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [isPulsing, setIsPulsing] = useState(true);

  // Hemodynamic calculations from 0D Windkessel coupling
  const efFrac = Math.min(0.85, Math.max(0.15, ef / 100));
  const esv = Math.round(edv * (1 - efFrac));
  const sv = Math.round(edv * efFrac);
  const co = ((hr * sv) / 1000).toFixed(2);
  const map = (dbp + (sbp - dbp) / 3).toFixed(1);

  // Smooth cardiac deformation state (scale & subtle apex twist)
  const [beatState, setBeatState] = useState({ scaleX: 1, scaleY: 1, rotate: 0 });
  const animRef = useRef(null);
  const startTimeRef = useRef(performance.now());

  // Continuous, silky smooth 60fps Wiggers cardiac cycle (NO blinking or flashing)
  useEffect(() => {
    if (!isPulsing) {
      setBeatState({ scaleX: 1, scaleY: 1, rotate: 0 });
      return;
    }

    const cycleMs = (60 / Math.max(35, hr)) * 1000;

    const animateLoop = (now) => {
      const elapsed = (now - startTimeRef.current) % cycleMs;
      const phase = elapsed / cycleMs; // 0.0 to 1.0

      // Wiggers cardiac cycle:
      // ~0.0 to 0.32: Systolic contraction (inward squeeze proportional to EF)
      // ~0.32 to 1.0: Diastolic relaxation and filling (smooth elastic recoil)
      let contraction = 0;
      if (phase < 0.32) {
        contraction = Math.sin((phase / 0.32) * Math.PI) * efFrac * 0.065;
      } else {
        contraction = Math.max(
          0,
          Math.sin(Math.PI) * Math.exp(-(phase - 0.32) * 4.2) * efFrac * 0.065
        );
      }

      setBeatState({
        scaleX: 1.0 - contraction,
        scaleY: 1.0 - contraction * 0.7,
        rotate: contraction * 1.4,
      });

      animRef.current = requestAnimationFrame(animateLoop);
    };

    animRef.current = requestAnimationFrame(animateLoop);
    return () => cancelAnimationFrame(animRef.current);
  }, [hr, efFrac, isPulsing]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4 w-full select-none">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-100 pb-3 gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span>Realistic Cardiac Digital Twin</span>
            <span className="text-xs bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded font-medium">
              Physiological Simulation
            </span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Photorealistic cardiac anatomy &bull; Contraction rate {hr} bpm &bull; Stroke volume {sv} mL ({ef}% EF)
          </p>
        </div>

        {/* View Switchers & Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Main Anatomy View Switcher: External (1st image) vs Internal (2nd image) */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-md">
            <button
              type="button"
              onClick={() => setCrossSection(false)}
              className={`px-3 py-1.5 rounded text-xs transition font-semibold flex items-center gap-1.5 ${
                !crossSection
                  ? "bg-white text-teal-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <span>Exterior Anatomy</span>
            </button>
            <button
              type="button"
              onClick={() => setCrossSection(true)}
              className={`px-3 py-1.5 rounded text-xs transition font-semibold flex items-center gap-1.5 ${
                crossSection
                  ? "bg-rose-700 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <span>LV Cavity Cutaway</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowLabels(!showLabels)}
            className={`px-2.5 py-1.5 rounded border transition font-medium ${
              showLabels
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
            }`}
          >
            {showLabels ? "Hide Callouts" : "Show Callouts"}
          </button>

          <button
            type="button"
            onClick={() => setIsPulsing(!isPulsing)}
            className="px-2.5 py-1.5 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium transition"
          >
            {isPulsing ? "Pause Pulse" : "Resume Pulse"}
          </button>
        </div>
      </div>

      {/* Main Viewport Container + Telemetry Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Visual Viewport Area */}
        <div className="lg:col-span-8 bg-slate-50/70 border border-gray-200 rounded-lg relative overflow-hidden min-h-[460px] flex items-center justify-center p-4">
          {/* 1. EXTERIOR ANATOMY VIEW (EXACT 1ST IMAGE) */}
          {!crossSection && (
            <div className="relative w-full h-[450px] flex items-center justify-center">
              {/* Dynamic Beating External Heart */}
              <div
                className="relative flex items-center justify-center will-change-transform"
                style={{
                  transform: `scale(${beatState.scaleX}, ${beatState.scaleY}) rotate(${beatState.rotate}deg)`,
                  transformOrigin: "center 60%",
                }}
              >
                <img
                  src={heartExternal}
                  alt="Exterior Heart Anatomy"
                  className="max-h-[400px] w-auto object-contain drop-shadow-xl pointer-events-none select-none"
                />
              </div>

              {/* Exact External Anatomical Callout Badges */}
              {showLabels && (
                <>
                  {/* Aortic Arch & Branches */}
                  <div className="absolute top-3 right-10 sm:right-24 pointer-events-none flex items-center gap-2">
                    <span className="text-[11px] bg-white/95 text-red-950 font-semibold px-2.5 py-1 rounded-md border border-red-200 backdrop-blur-sm shadow-md">
                      Aortic Arch &amp; 3 Branches
                    </span>
                    <div className="w-5 h-0.5 bg-red-400 hidden sm:block" />
                  </div>

                  {/* Superior Vena Cava & Pulmonary Trunk */}
                  <div className="absolute top-6 left-6 sm:left-14 pointer-events-none flex items-center gap-2">
                    <div className="w-5 h-0.5 bg-sky-400 hidden sm:block" />
                    <span className="text-[11px] bg-white/95 text-sky-950 font-semibold px-2.5 py-1 rounded-md border border-sky-200 backdrop-blur-sm shadow-md">
                      SVC &amp; Pulmonary Trunk (Blue)
                    </span>
                  </div>

                  {/* Atrial Auricles */}
                  <div className="absolute top-32 left-4 sm:left-8 pointer-events-none flex items-center gap-2">
                    <span className="text-[11px] bg-white/95 text-pink-950 font-semibold px-2.5 py-1 rounded-md border border-pink-200 backdrop-blur-sm shadow-md">
                      Right Auricle (Pink)
                    </span>
                    <div className="w-5 h-0.5 bg-pink-400 hidden sm:block" />
                  </div>

                  {/* LAD Coronary Artery & Vein */}
                  <div className="absolute top-52 right-4 sm:right-10 pointer-events-none flex items-center gap-2">
                    <div className="w-5 h-0.5 bg-rose-400 hidden sm:block" />
                    <span className="text-[11px] bg-white/95 text-rose-950 font-semibold px-2.5 py-1 rounded-md border border-rose-200 backdrop-blur-sm shadow-md">
                      LAD Coronary Artery &amp; Cardiac Vein
                    </span>
                  </div>

                  {/* Left Ventricle */}
                  <div className="absolute bottom-16 right-8 sm:right-20 pointer-events-none flex items-center gap-2">
                    <div className="w-5 h-0.5 bg-gray-400 hidden sm:block" />
                    <span className="text-[11px] bg-white/95 text-gray-900 font-semibold px-2.5 py-1 rounded-md border border-gray-300 backdrop-blur-sm shadow-md">
                      Left Ventricle (Thick Myocardium)
                    </span>
                  </div>

                  {/* Right Ventricle */}
                  <div className="absolute bottom-14 left-8 sm:left-18 pointer-events-none flex items-center gap-2">
                    <span className="text-[11px] bg-white/95 text-gray-900 font-semibold px-2.5 py-1 rounded-md border border-gray-300 backdrop-blur-sm shadow-md">
                      Right Ventricle
                    </span>
                    <div className="w-5 h-0.5 bg-gray-400 hidden sm:block" />
                  </div>
                </>
              )}
            </div>
          )}

          {/* 2. INTERNAL CAVITY CUTAWAY VIEW (EXACT 2ND IMAGE) */}
          {crossSection && (
            <div className="relative w-full h-[450px] flex items-center justify-center">
              {/* Dynamic Beating Internal Cutaway Heart */}
              <div
                className="relative flex items-center justify-center will-change-transform"
                style={{
                  transform: `scale(${beatState.scaleX}, ${beatState.scaleY}) rotate(${beatState.rotate}deg)`,
                  transformOrigin: "center 60%",
                }}
              >
                <img
                  src={heartInternal}
                  alt="Internal Heart Cavity Cutaway Anatomy"
                  className="max-h-[400px] w-auto object-contain drop-shadow-xl pointer-events-none select-none"
                />
              </div>

              {/* Exact Internal Anatomical Callout Badges */}
              {showLabels && (
                <>
                  {/* Semilunar Valves & Outflow */}
                  <div className="absolute top-4 right-8 sm:right-20 pointer-events-none flex items-center gap-2">
                    <span className="text-[11px] bg-white/95 text-red-950 font-semibold px-2.5 py-1 rounded-md border border-red-200 backdrop-blur-sm shadow-md">
                      Aortic &amp; Pulmonary Semilunar Valves
                    </span>
                    <div className="w-5 h-0.5 bg-red-400 hidden sm:block" />
                  </div>

                  {/* Tricuspid & Mitral Valves */}
                  <div className="absolute top-28 left-4 sm:left-10 pointer-events-none flex items-center gap-2">
                    <span className="text-[11px] bg-white/95 text-sky-950 font-semibold px-2.5 py-1 rounded-md border border-sky-200 backdrop-blur-sm shadow-md">
                      Tricuspid &amp; Mitral Inflow Valves
                    </span>
                    <div className="w-5 h-0.5 bg-sky-400 hidden sm:block" />
                  </div>

                  {/* Chordae Tendineae ("Heart Strings") */}
                  <div className="absolute top-48 left-2 sm:left-8 pointer-events-none flex items-center gap-2">
                    <span className="text-[11px] bg-white/95 text-amber-950 font-semibold px-2.5 py-1 rounded-md border border-amber-300 backdrop-blur-sm shadow-md">
                      Chordae Tendineae (&ldquo;Heart Strings&rdquo;)
                    </span>
                    <div className="w-5 h-0.5 bg-amber-400 hidden sm:block" />
                  </div>

                  {/* Papillary Muscles */}
                  <div className="absolute bottom-28 left-4 sm:left-12 pointer-events-none flex items-center gap-2">
                    <span className="text-[11px] bg-white/95 text-rose-950 font-semibold px-2.5 py-1 rounded-md border border-rose-300 backdrop-blur-sm shadow-md">
                      Papillary Muscle Columns
                    </span>
                    <div className="w-5 h-0.5 bg-rose-400 hidden sm:block" />
                  </div>

                  {/* 12 mm Myocardial Wall Cross-Section */}
                  <div className="absolute bottom-20 right-4 sm:right-12 pointer-events-none flex items-center gap-2">
                    <div className="w-5 h-0.5 bg-rose-500 hidden sm:block" />
                    <span className="text-[11px] bg-white/95 text-rose-950 font-semibold px-2.5 py-1 rounded-md border border-rose-300 backdrop-blur-sm shadow-md">
                      LV Myocardium Wall Cross-Section (12 mm)
                    </span>
                  </div>

                  {/* Interventricular Septum (IVS) */}
                  <div className="absolute bottom-8 right-16 sm:right-32 pointer-events-none flex items-center gap-2">
                    <span className="text-[11px] bg-white/95 text-slate-900 font-semibold px-2.5 py-1 rounded-md border border-slate-300 backdrop-blur-sm shadow-md">
                      Interventricular Septum (IVS)
                    </span>
                    <div className="w-5 h-0.5 bg-slate-400 hidden sm:block" />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Bottom Interaction Hint */}
          <div className="absolute bottom-3 left-3 text-[11px] text-gray-500 bg-white/85 px-2.5 py-1 rounded border border-gray-200 backdrop-blur-sm pointer-events-none font-medium flex items-center gap-1.5 shadow-sm">
            <span>
              {crossSection
                ? "Coronal cutaway showing interior chambers, valves & papillary muscles"
                : "External medical anatomy showing aorta, vena cava, auricles & LAD vessels"}
            </span>
          </div>

          {/* Live Dynamic Status Badge */}
          <div className="absolute top-3 right-3 text-[11px] text-teal-800 bg-teal-50/95 px-2.5 py-1 rounded border border-teal-200 backdrop-blur-sm font-medium tabular-nums shadow-sm">
            {isPulsing ? `Pulsing at ${hr} bpm \u2022 ${co} L/min CO` : "Pulse Paused"}
          </div>
        </div>

        {/* Telemetry Mapping Card */}
        <div className="lg:col-span-4 space-y-3.5">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2.5">
            <span className="text-xs font-semibold text-gray-700 block border-b border-gray-200 pb-1.5">
              Hemodynamic Volumetric Telemetry
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500 block">End-Diastolic (EDV)</span>
                <span className="font-semibold text-gray-800 text-sm tabular-nums">{edv} mL</span>
              </div>
              <div>
                <span className="text-gray-500 block">End-Systolic (ESV)</span>
                <span className="font-semibold text-gray-800 text-sm tabular-nums">{esv} mL</span>
              </div>
              <div>
                <span className="text-gray-500 block">Stroke Volume (SV)</span>
                <span className="font-semibold text-teal-800 text-sm tabular-nums">{sv} mL/beat</span>
              </div>
              <div>
                <span className="text-gray-500 block">Cardiac Output (CO)</span>
                <span className="font-semibold text-teal-800 text-sm tabular-nums">{co} L/min</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 text-xs">
            <span className="font-semibold text-gray-800 block">
              {crossSection ? "Internal Chamber Anatomy (2nd Image):" : "External Anatomy (1st Image):"}
            </span>
            <p className="text-gray-600 leading-relaxed text-[11px]">
              {crossSection
                ? `Coronal dissection illustrates the left and right ventricular lumens (EDV ${edv} mL \u2192 ESV ${esv} mL). Notice the prominent 12 mm muscular myocardium wall on the left ventricle compared to the thinner right ventricle wall, white fibrous chordae tendineae attached to papillary muscle pillars, and the mitral/tricuspid inflow valves.`
                : `External cardiac view displays the aortic arch with its 3 brachiocephalic branch buds, deep blue superior vena cava and pulmonary trunk, pink atrial auricles, and branching left anterior descending (LAD) coronary vessels along the interventricular groove.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
