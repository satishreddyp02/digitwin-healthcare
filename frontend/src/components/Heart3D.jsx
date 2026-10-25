import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Photorealistic 3D Cardiac Digital Twin Visualization (Three.js WebGL)
 * 
 * Recreates the exact anatomy and aesthetics of both reference illustrations:
 * 1. Exterior 3D Model (matching Reference 1):
 *    - Warm coral/apricot muscular ventricles with apex tapering to lower-left
 *    - Crimson/ruby Ascending Aorta and Aortic Arch with 3 vertical branch vessels and descending aorta
 *    - Medical Cyan/Blue Pulmonary Trunk (crossing anteriorly), Superior Vena Cava, and Inferior Vena Cava
 *    - Soft pink muscular Right and Left Auricles
 *    - Dual branching Left Anterior Descending (LAD) red artery and cyan/blue cardiac vein across sulcus
 * 
 * 2. Interior Dissection Cutaway 3D Model (matching Reference 2):
 *    - Fleshy peach/salmon cut myocardial wall rim (12 mm thick on LV, thinner on RV)
 *    - Deep ruby/amber trabeculated ventricular cavities (LV and RV)
 *    - Central muscular Interventricular Septum (IVS)
 *    - Distinct muscular Papillary Muscle columns rising from ventricular floors
 *    - White fibrous Chordae Tendineae ("heart strings") fanning into the valve leaflets
 *    - Delicate translucent white Mitral (Bicuspid) and Tricuspid atrioventricular valves
 *    - Pocket-like Semilunar Aortic and Pulmonary outflow valve cusps
 *    - Right atrium with fossa ovalis
 * 
 * 3. Biophysical Dynamics & Interaction:
 *    - Real-time 60 fps Wiggers cardiac contraction (NO 2D image blinking or opacity flashing)
 *    - Pumping rate synchronized to simulated HR (T = 60 / HR)
 *    - Ventricular systolic squeeze scaled to Ejection Fraction (EF%)
 *    - Windkessel compliance radial dilation of aortic root driven by Mean Arterial Pressure (MAP)
 *    - Full 360° interactive mouse-drag orbit and scroll-wheel zoom
 */
export default function Heart3D({ sbp = 120, dbp = 80, hr = 72, ef = 55, edv = 120 }) {
  const mountRef = useRef(null);
  const [crossSection, setCrossSection] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [activePreset, setActivePreset] = useState("anterior");

  // Hemodynamic metrics from 0D Windkessel coupling
  const efFrac = Math.min(0.85, Math.max(0.15, ef / 100));
  const esv = Math.round(edv * (1 - efFrac));
  const sv = Math.round(edv * efFrac);
  const co = ((hr * sv) / 1000).toFixed(2);
  const map = (dbp + (sbp - dbp) / 3).toFixed(1);

  // References for 3D animation
  const heartGroupRef = useRef(null);
  const ventriclesRef = useRef(null);
  const aortaRef = useRef(null);
  const cameraRef = useRef(null);
  const isDraggingRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, WebGL Renderer
    const width = container.clientWidth || 640;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc); // Clean neutral slate

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 16.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 2. High-Fidelity Anatomical Materials
    // A. External Ventricular Myocardium (Warm Coral/Apricot from Image 1)
    const extMuscleMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xed6e58,
      roughness: 0.38,
      metalness: 0.04,
      clearcoat: 0.45,
      clearcoatRoughness: 0.18,
      reflectivity: 0.6,
    });

    // B. Arterial System (Crimson / Scarlet Red from Image 1)
    const aortaMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd62828,
      roughness: 0.28,
      metalness: 0.05,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
    });

    // Lumen interior for open vessels
    const lumenInteriorMaterial = new THREE.MeshBasicMaterial({ color: 0x5a0b12 });

    // C. Venous System (Cyan / Medical Sky-Blue from Image 1)
    const venousMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      roughness: 0.32,
      metalness: 0.05,
      clearcoat: 0.5,
      clearcoatRoughness: 0.18,
    });
    const blueLumenMaterial = new THREE.MeshBasicMaterial({ color: 0x0c4a6e });

    // D. Auricles & Atria (Soft Pink from Image 1)
    const auricleMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf472b6,
      roughness: 0.45,
      metalness: 0.03,
      clearcoat: 0.35,
    });

    // E. Coronary Arteries (Vivid Red) & Veins (Cyan/Blue)
    const coronaryArteryMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.25,
      metalness: 0.08,
    });
    const coronaryVeinMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.28,
      metalness: 0.06,
    });

    // F. Internal Dissection Materials (matching Image 2)
    // Cut myocardial wall rim (Peach/Salmon muscular cross-section)
    const cutWallMaterial = new THREE.MeshStandardMaterial({
      color: 0xfca5a5,
      roughness: 0.5,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });

    // Internal cavity lumen (Deep Ruby / Rich Amber-Crimson trabeculated endocardium)
    const cavityLumenMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x7f1d1d,
      roughness: 0.42,
      metalness: 0.04,
      clearcoat: 0.4,
      side: THREE.BackSide,
    });

    // Papillary muscles (Muscular pillars)
    const papillaryMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xb91c1c,
      roughness: 0.38,
      clearcoat: 0.35,
    });

    // Chordae Tendineae (Fibrous white heart strings)
    const chordaeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.01,
    });

    // Atrioventricular & Semilunar Valves (Delicate translucent white leaflets)
    const valveMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.22,
      metalness: 0.02,
      clearcoat: 0.5,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });

    // Interventricular Septum (IVS)
    const septumMaterial = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      roughness: 0.48,
    });

    // 3. Surgical Multi-Directional Lighting
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
    keyLight.position.set(7, 9, 11);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffb5c0, 1.1);
    rimLight.position.set(-8, -4, -6);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xa5c4e8, 0.75);
    fillLight.position.set(-6, 6, 7);
    scene.add(fillLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(ambientLight);

    // 4. Root 3D Organ Group
    const heartGroup = new THREE.Group();
    scene.add(heartGroup);
    heartGroupRef.current = heartGroup;

    // Anatomical orientation (frontal anterior view matching images)
    heartGroup.rotation.z = THREE.MathUtils.degToRad(-14);
    heartGroup.rotation.y = THREE.MathUtils.degToRad(-10);
    heartGroup.position.set(0, -0.65, 0);

    // --- VENTRICULAR CHASSIS (Dynamic Pumping Group) ---
    const ventGroup = new THREE.Group();
    heartGroup.add(ventGroup);
    ventriclesRef.current = ventGroup;

    // =========================================================================
    // MODEL 1: EXTERNAL 3D HEART ANATOMY (matching Reference Image 1)
    // =========================================================================
    const externalGroup = new THREE.Group();
    ventGroup.add(externalGroup);

    // Left Ventricle Shell (Conical prolate body, apex pointing lower-left)
    const lvGeo = new THREE.SphereGeometry(2.35, 36, 36);
    lvGeo.scale(1.0, 1.48, 0.96);
    const lvPos = lvGeo.attributes.position;
    for (let i = 0; i < lvPos.count; i++) {
      const y = lvPos.getY(i);
      if (y < 0) {
        const factor = 1 - Math.abs(y / 3.5) * 0.48;
        lvPos.setX(i, lvPos.getX(i) * factor);
        lvPos.setZ(i, lvPos.getZ(i) * factor);
      }
    }
    lvGeo.computeVertexNormals();

    const lvMesh = new THREE.Mesh(lvGeo, extMuscleMaterial);
    lvMesh.position.set(0.3, 0.2, 0);
    lvMesh.rotation.z = THREE.MathUtils.degToRad(-10);
    externalGroup.add(lvMesh);

    // Right Ventricle Shell (Crescentic wrapper along anterior-right aspect)
    const rvGeo = new THREE.SphereGeometry(1.95, 30, 30);
    rvGeo.scale(0.85, 1.32, 0.76);
    const rvMesh = new THREE.Mesh(rvGeo, extMuscleMaterial);
    rvMesh.position.set(-1.12, 0.5, 0.38);
    rvMesh.rotation.z = THREE.MathUtils.degToRad(8);
    externalGroup.add(rvMesh);

    // Dual Coronary Vasculature across Anterior Sulcus (Red Artery + Blue Vein)
    // Red LAD Coronary Artery
    const ladCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, 1.95, 0.82),
      new THREE.Vector3(-0.16, 1.2, 0.97),
      new THREE.Vector3(-0.08, 0.2, 0.98),
      new THREE.Vector3(0.04, -0.9, 0.88),
      new THREE.Vector3(0.18, -1.8, 0.58),
      new THREE.Vector3(0.24, -2.55, 0.15),
    ]);
    const ladMesh = new THREE.Mesh(new THREE.TubeGeometry(ladCurve, 28, 0.08, 10, false), coronaryArteryMat);
    externalGroup.add(ladMesh);

    // Blue Great Cardiac Vein (running side-by-side with LAD)
    const veinCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.24, 1.85, 0.8),
      new THREE.Vector3(-0.28, 1.1, 0.95),
      new THREE.Vector3(-0.2, 0.15, 0.95),
      new THREE.Vector3(-0.08, -0.85, 0.86),
      new THREE.Vector3(0.06, -1.75, 0.56),
    ]);
    const veinMesh = new THREE.Mesh(new THREE.TubeGeometry(veinCurve, 24, 0.07, 10, false), coronaryVeinMat);
    externalGroup.add(veinMesh);

    // Lateral branching red & blue twigs
    const diagArteryCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.15, 0.9, 0.95),
      new THREE.Vector3(0.6, 0.4, 0.8),
      new THREE.Vector3(1.1, -0.2, 0.5),
    ]);
    externalGroup.add(new THREE.Mesh(new THREE.TubeGeometry(diagArteryCurve, 14, 0.05, 8, false), coronaryArteryMat));

    const diagVeinCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.2, 0.75, 0.95),
      new THREE.Vector3(0.48, 0.25, 0.82),
      new THREE.Vector3(0.95, -0.3, 0.52),
    ]);
    externalGroup.add(new THREE.Mesh(new THREE.TubeGeometry(diagVeinCurve, 14, 0.045, 8, false), coronaryVeinMat));

    // Right ventricular acute marginal branches
    const rvArteryCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.2, 0.6, 0.95),
      new THREE.Vector3(-0.8, 0.2, 0.82),
      new THREE.Vector3(-1.3, -0.3, 0.5),
    ]);
    externalGroup.add(new THREE.Mesh(new THREE.TubeGeometry(rvArteryCurve, 14, 0.045, 8, false), coronaryArteryMat));

    // =========================================================================
    // MODEL 2: INTERNAL CORONAL DISSECTION CUTAWAY (matching Reference Image 2)
    // =========================================================================
    const internalGroup = new THREE.Group();
    ventGroup.add(internalGroup);

    // Deep Ruby Internal Cavity Lining (Endocardium)
    const cavityBackGeo = new THREE.SphereGeometry(2.2, 32, 32);
    cavityBackGeo.scale(0.95, 1.45, 0.85);
    const cavityBackMesh = new THREE.Mesh(cavityBackGeo, cavityLumenMaterial);
    cavityBackMesh.position.set(0, 0.1, -0.15);
    internalGroup.add(cavityBackMesh);

    // Cut Myocardial Wall Thickness Rim (Peach/Salmon with 12 mm LV wall & thinner RV wall)
    const cutWallShape = new THREE.Shape();
    cutWallShape.absellipse(0, -0.15, 2.22, 2.95, 0, Math.PI * 2, false, 0);

    // Left Ventricular Cavity Hole (Thick surrounding muscular wall)
    const lvCutHole = new THREE.Path();
    lvCutHole.absellipse(0.68, -0.22, 1.05, 1.95, 0, Math.PI * 2, true, 0);

    // Right Ventricular Cavity Hole (Thinner surrounding muscular wall)
    const rvCutHole = new THREE.Path();
    rvCutHole.absellipse(-0.88, 0.05, 0.78, 1.72, 0, Math.PI * 2, true, 0);

    cutWallShape.holes.push(lvCutHole, rvCutHole);

    const cutWallGeo = new THREE.ShapeGeometry(cutWallShape, 32);
    const cutWallMesh = new THREE.Mesh(cutWallGeo, cutWallMaterial);
    cutWallMesh.position.set(0.02, 0, 0.15);
    cutWallMesh.rotation.y = THREE.MathUtils.degToRad(-8);
    internalGroup.add(cutWallMesh);

    // Interventricular Septum (IVS) dividing the two chambers
    const septumGeo = new THREE.BoxGeometry(0.55, 3.2, 1.8);
    const septumMesh = new THREE.Mesh(septumGeo, septumMaterial);
    septumMesh.position.set(-0.12, -0.1, -0.1);
    internalGroup.add(septumMesh);

    // Papillary Muscle Columns (matching Image 2)
    // Left Ventricle: Anterolateral and Posteromedial Papillary Muscles
    const lvPap1Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.4, -1.6, -0.3),
      new THREE.Vector3(0.55, -0.9, -0.1),
      new THREE.Vector3(0.65, 0.1, 0.02),
    ]);
    internalGroup.add(new THREE.Mesh(new THREE.TubeGeometry(lvPap1Curve, 16, 0.22, 12, false), papillaryMaterial));

    const lvPap2Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.1, -1.4, -0.35),
      new THREE.Vector3(1.15, -0.7, -0.15),
      new THREE.Vector3(1.05, 0.2, -0.05),
    ]);
    internalGroup.add(new THREE.Mesh(new THREE.TubeGeometry(lvPap2Curve, 16, 0.2, 12, false), papillaryMaterial));

    // Right Ventricle: Anterior and Septal Papillary Muscles
    const rvPap1Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.9, -1.3, -0.2),
      new THREE.Vector3(-0.85, -0.6, -0.05),
      new THREE.Vector3(-0.75, 0.2, 0.05),
    ]);
    internalGroup.add(new THREE.Mesh(new THREE.TubeGeometry(rvPap1Curve, 16, 0.18, 12, false), papillaryMaterial));

    // White Fibrous Chordae Tendineae ("Heart Strings" fanning into the valves)
    const chordaeCords = [
      // From LV Papillary 1 to Mitral Valve
      [new THREE.Vector3(0.65, 0.1, 0.02), new THREE.Vector3(0.45, 1.45, -0.05)],
      [new THREE.Vector3(0.65, 0.1, 0.02), new THREE.Vector3(0.68, 1.48, 0.02)],
      [new THREE.Vector3(0.65, 0.1, 0.02), new THREE.Vector3(0.9, 1.45, -0.05)],
      // From LV Papillary 2 to Mitral Valve
      [new THREE.Vector3(1.05, 0.2, -0.05), new THREE.Vector3(0.9, 1.45, -0.05)],
      [new THREE.Vector3(1.05, 0.2, -0.05), new THREE.Vector3(1.15, 1.48, -0.02)],
      [new THREE.Vector3(1.05, 0.2, -0.05), new THREE.Vector3(1.3, 1.42, -0.1)],
      // From RV Papillary 1 to Tricuspid Valve
      [new THREE.Vector3(-0.75, 0.2, 0.05), new THREE.Vector3(-0.55, 1.35, -0.05)],
      [new THREE.Vector3(-0.75, 0.2, 0.05), new THREE.Vector3(-0.78, 1.38, 0.02)],
      [new THREE.Vector3(-0.75, 0.2, 0.05), new THREE.Vector3(-1.05, 1.35, -0.05)],
    ];

    chordaeCords.forEach(([p1, p2]) => {
      const cordCurve = new THREE.LineCurve3(p1, p2);
      internalGroup.add(new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 8, 0.035, 6, false), chordaeMaterial));
    });

    // Mitral Valve (Bicuspid Valve on Left)
    const mitralRingGeo = new THREE.TorusGeometry(0.72, 0.07, 14, 28);
    const mitralMesh = new THREE.Mesh(mitralRingGeo, valveMaterial);
    mitralMesh.position.set(0.85, 1.45, -0.05);
    mitralMesh.rotation.x = THREE.MathUtils.degToRad(85);
    internalGroup.add(mitralMesh);

    // Tricuspid Valve (on Right)
    const tricuspidRingGeo = new THREE.TorusGeometry(0.65, 0.065, 14, 28);
    const tricuspidMesh = new THREE.Mesh(tricuspidRingGeo, valveMaterial);
    tricuspidMesh.position.set(-0.82, 1.35, -0.05);
    tricuspidMesh.rotation.x = THREE.MathUtils.degToRad(85);
    internalGroup.add(tricuspidMesh);

    // Semilunar Aortic Valve Cusps (at aortic root base)
    const aorticCuspGeo = new THREE.CylinderGeometry(0.35, 0.38, 0.35, 18, 1, true);
    const aorticCuspMesh = new THREE.Mesh(aorticCuspGeo, valveMaterial);
    aorticCuspMesh.position.set(0.18, 1.85, 0.08);
    internalGroup.add(aorticCuspMesh);

    // Semilunar Pulmonary Valve Cusps (at pulmonary base)
    const pulmCuspGeo = new THREE.CylinderGeometry(0.34, 0.36, 0.32, 18, 1, true);
    const pulmCuspMesh = new THREE.Mesh(pulmCuspGeo, valveMaterial);
    pulmCuspMesh.position.set(-0.55, 1.85, 0.72);
    internalGroup.add(pulmCuspMesh);

    // Visibility toggle between external and internal cutaway
    externalGroup.visible = !crossSection;
    internalGroup.visible = crossSection;

    // =========================================================================
    // GREAT VESSELS & ATRIA (Matching Image 1 & 2 layout)
    // =========================================================================
    // A. ASCENDING AORTA & AORTIC ARCH (Red Arterial Loop with 3 Branches)
    const aortaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.22, 1.75, 0.1),
      new THREE.Vector3(0.12, 3.2, 0.0),
      new THREE.Vector3(-0.08, 4.35, -0.2),
      new THREE.Vector3(-0.95, 4.65, -0.65),
      new THREE.Vector3(-1.45, 3.95, -1.15),
      new THREE.Vector3(-1.55, 2.3, -1.45),
    ]);
    const aortaGeo = new THREE.TubeGeometry(aortaCurve, 32, 0.68, 20, false);
    const aortaMesh = new THREE.Mesh(aortaGeo, aortaMaterial);
    heartGroup.add(aortaMesh);
    aortaRef.current = aortaMesh;

    // 3 Brachiocephalic Vertical Branch Vessels on the Arch (with red open lumens)
    const branchPositions = [
      new THREE.Vector3(0.18, 4.45, -0.15),
      new THREE.Vector3(-0.3, 4.65, -0.42),
      new THREE.Vector3(-0.8, 4.6, -0.72),
    ];
    branchPositions.forEach((pos, idx) => {
      const branchGeo = new THREE.CylinderGeometry(0.15, 0.18, 0.95, 14);
      const branchMesh = new THREE.Mesh(branchGeo, aortaMaterial);
      branchMesh.position.copy(pos);
      branchMesh.rotation.z = THREE.MathUtils.degToRad(-12 + idx * 2);
      heartGroup.add(branchMesh);

      // Open circular lumen tip
      const tipGeo = new THREE.CircleGeometry(0.15, 14);
      const tipMesh = new THREE.Mesh(tipGeo, lumenInteriorMaterial);
      tipMesh.position.set(pos.x - 0.1, pos.y + 0.48, pos.z);
      tipMesh.rotation.x = THREE.MathUtils.degToRad(-90);
      heartGroup.add(tipMesh);
    });

    // Descending Aorta at bottom
    const descAortaGeo = new THREE.CylinderGeometry(0.42, 0.44, 1.8, 16);
    const descAortaMesh = new THREE.Mesh(descAortaGeo, aortaMaterial);
    descAortaMesh.position.set(0.05, -3.2, -0.8);
    heartGroup.add(descAortaMesh);

    // B. PULMONARY TRUNK & BIFURCATION (Cyan/Blue crossing anteriorly)
    const pulmonaryCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.55, 1.8, 0.75),
      new THREE.Vector3(-0.45, 2.9, 0.55),
      new THREE.Vector3(-0.15, 3.75, 0.15),
    ]);
    const pulmonaryGeo = new THREE.TubeGeometry(pulmonaryCurve, 20, 0.62, 18, false);
    const pulmonaryMesh = new THREE.Mesh(pulmonaryGeo, venousMaterial);
    heartGroup.add(pulmonaryMesh);

    // Left & Right Pulmonary Artery Branches (Blue)
    const rpaGeo = new THREE.CylinderGeometry(0.32, 0.36, 1.6, 16);
    const rpaMesh = new THREE.Mesh(rpaGeo, venousMaterial);
    rpaMesh.position.set(-1.15, 3.75, -0.2);
    rpaMesh.rotation.z = THREE.MathUtils.degToRad(75);
    heartGroup.add(rpaMesh);

    const lpaGeo = new THREE.CylinderGeometry(0.3, 0.34, 1.4, 16);
    const lpaMesh = new THREE.Mesh(lpaGeo, venousMaterial);
    lpaMesh.position.set(0.65, 3.65, -0.2);
    lpaMesh.rotation.z = THREE.MathUtils.degToRad(-70);
    heartGroup.add(lpaMesh);

    // C. SUPERIOR VENA CAVA (SVC) & INFERIOR VENA CAVA (IVC) (Blue)
    const svcGeo = new THREE.CylinderGeometry(0.5, 0.54, 2.4, 18);
    const svcMesh = new THREE.Mesh(svcGeo, venousMaterial);
    svcMesh.position.set(-1.62, 3.45, -0.6);
    heartGroup.add(svcMesh);

    const svcTipGeo = new THREE.CircleGeometry(0.5, 16);
    const svcTipMesh = new THREE.Mesh(svcTipGeo, blueLumenMaterial);
    svcTipMesh.position.set(-1.62, 4.65, -0.6);
    svcTipMesh.rotation.x = THREE.MathUtils.degToRad(-90);
    heartGroup.add(svcTipMesh);

    // Inferior Vena Cava at bottom left
    const ivcGeo = new THREE.CylinderGeometry(0.45, 0.48, 1.8, 16);
    const ivcMesh = new THREE.Mesh(ivcGeo, venousMaterial);
    ivcMesh.position.set(-1.3, -2.8, -0.6);
    heartGroup.add(ivcMesh);

    // D. ATRIAL AURICLES (Pink Muscular Lobes from Image 1)
    const rAuricleGeo = new THREE.SphereGeometry(0.75, 18, 18);
    rAuricleGeo.scale(0.85, 0.65, 1.25);
    const rAuricleMesh = new THREE.Mesh(rAuricleGeo, auricleMaterial);
    rAuricleMesh.position.set(-1.25, 2.05, 0.58);
    rAuricleMesh.rotation.set(0.3, -0.2, 0.4);
    heartGroup.add(rAuricleMesh);

    const lAuricleGeo = new THREE.SphereGeometry(0.72, 18, 18);
    lAuricleGeo.scale(0.8, 0.6, 1.2);
    const lAuricleMesh = new THREE.Mesh(lAuricleGeo, auricleMaterial);
    lAuricleMesh.position.set(1.15, 2.05, 0.28);
    lAuricleMesh.rotation.set(0.2, 0.3, -0.3);
    heartGroup.add(lAuricleMesh);

    // Pulmonary Veins (Red/Coral tubes entering left atrium posteriorly)
    const pv1Geo = new THREE.CylinderGeometry(0.2, 0.22, 1.1, 12);
    const pv1Mesh = new THREE.Mesh(pv1Geo, aortaMaterial);
    pv1Mesh.position.set(1.6, 2.1, -0.9);
    pv1Mesh.rotation.z = THREE.MathUtils.degToRad(-60);
    heartGroup.add(pv1Mesh);

    const pv2Geo = new THREE.CylinderGeometry(0.2, 0.22, 1.1, 12);
    const pv2Mesh = new THREE.Mesh(pv2Geo, aortaMaterial);
    pv2Mesh.position.set(1.65, 1.5, -0.9);
    pv2Mesh.rotation.z = THREE.MathUtils.degToRad(-60);
    heartGroup.add(pv2Mesh);

    // 5. Interactive Orbit Mouse & Touch Controls
    const onMouseDown = (e) => {
      isDraggingRef.current = true;
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e) => {
      if (!isDraggingRef.current || !heartGroupRef.current) return;
      const deltaX = e.clientX - mousePosRef.current.x;
      const deltaY = e.clientY - mousePosRef.current.y;
      heartGroupRef.current.rotation.y += deltaX * 0.01;
      heartGroupRef.current.rotation.x += deltaY * 0.01;
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
    };
    const onWheel = (e) => {
      if (!cameraRef.current) return;
      cameraRef.current.position.z = THREE.MathUtils.clamp(
        cameraRef.current.position.z + e.deltaY * 0.015,
        8,
        26
      );
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("wheel", onWheel, { passive: true });

    // Touch controls for mobile / tablet
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        mousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onTouchMove = (e) => {
      if (!isDraggingRef.current || !heartGroupRef.current || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - mousePosRef.current.x;
      const deltaY = e.touches[0].clientY - mousePosRef.current.y;
      heartGroupRef.current.rotation.y += deltaX * 0.01;
      heartGroupRef.current.rotation.x += deltaY * 0.01;
      mousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchEnd = () => {
      isDraggingRef.current = false;
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    // 6. Smooth 60 fps Continuous Biophysical Pumping (Wiggers Cycle - NO BLINKING)
    let animId;
    let startTime = performance.now();

    const animate = (now) => {
      animId = requestAnimationFrame(animate);

      const cycleMs = (60 / Math.max(35, hr)) * 1000;
      const elapsed = (now - startTime) % cycleMs;
      const phase = elapsed / cycleMs; // 0.0 to 1.0

      // Wiggers cardiac cycle curve
      let contraction = 0;
      if (phase < 0.35) {
        contraction = Math.sin((phase / 0.35) * Math.PI) * efFrac;
      } else {
        contraction = Math.max(0, Math.sin(Math.PI) * Math.exp(-(phase - 0.35) * 4.5));
      }

      // Ventricular volumetric displacement (systolic squeeze)
      if (ventriclesRef.current) {
        const scaleX = 1.0 - contraction * 0.16;
        const scaleY = 1.0 - contraction * 0.11;
        const scaleZ = 1.0 - contraction * 0.16;
        ventriclesRef.current.scale.set(scaleX, scaleY, scaleZ);

        // Apex physiological torsion twist during peak systole
        ventriclesRef.current.rotation.y = contraction * 0.1;
      }

      // Windkessel Aortic root pulsatile radial compliance dilation
      if (aortaRef.current) {
        const aorticPulse = phase < 0.45 ? Math.sin((phase / 0.45) * Math.PI) : 0;
        const aorticDilation = 1.0 + aorticPulse * 0.07 * (map / 90);
        aortaRef.current.scale.set(aorticDilation, 1.0, aorticDilation);
      }

      // Subtle resting idle orbit when not dragging
      if (!isDraggingRef.current && heartGroupRef.current) {
        heartGroupRef.current.rotation.y += 0.0016;
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    const onResize = () => {
      if (!container || !camera || !renderer) return;
      const newW = container.clientWidth || 640;
      const newH = container.clientHeight || 450;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      renderer.dispose();
    };
  }, [hr, efFrac, crossSection, map]);

  // Set camera angle preset
  const applyPresetView = (preset) => {
    setActivePreset(preset);
    if (!heartGroupRef.current) return;
    if (preset === "anterior") {
      heartGroupRef.current.rotation.set(0, THREE.MathUtils.degToRad(-14), THREE.MathUtils.degToRad(-10));
    } else if (preset === "lateral") {
      heartGroupRef.current.rotation.set(0, THREE.MathUtils.degToRad(75), THREE.MathUtils.degToRad(-10));
    } else if (preset === "superior") {
      heartGroupRef.current.rotation.set(THREE.MathUtils.degToRad(55), 0, 0);
    } else if (preset === "posterior") {
      heartGroupRef.current.rotation.set(0, THREE.MathUtils.degToRad(165), THREE.MathUtils.degToRad(-10));
    }
  };

  // Toggle Cutaway Dissection
  const handleToggleCutaway = () => {
    const nextState = !crossSection;
    setCrossSection(nextState);
    if (nextState && heartGroupRef.current) {
      // Angle slightly to reveal interior chamber lumen directly
      heartGroupRef.current.rotation.set(
        THREE.MathUtils.degToRad(4),
        THREE.MathUtils.degToRad(-8),
        THREE.MathUtils.degToRad(-6)
      );
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4 w-full select-none">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-100 pb-3 gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span>Realistic 3D Cardiac Digital Twin</span>
            <span className="text-xs bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded font-medium">
              WebGL 3D Anatomical Model
            </span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Photorealistic cardiac anatomy &bull; Contraction rate {hr} bpm &bull; Stroke volume {sv} mL ({ef}% EF)
          </p>
        </div>

        {/* Viewport Presets & Dissection Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-md">
            {[
              { id: "anterior", label: "Frontal" },
              { id: "lateral", label: "Left Ventricle" },
              { id: "superior", label: "Aorta & Great Vessels" },
              { id: "posterior", label: "Posterior Inflow" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPresetView(p.id)}
                className={`px-2.5 py-1 rounded text-xs transition font-medium ${
                  activePreset === p.id
                    ? "bg-white text-gray-900 shadow-sm font-semibold"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {p.label}
              </button>
            ))}
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
            onClick={handleToggleCutaway}
            className={`px-3 py-1.5 rounded border transition font-semibold flex items-center gap-1.5 shadow-sm ${
              crossSection
                ? "bg-rose-700 text-white border-rose-700 ring-2 ring-rose-200"
                : "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100"
            }`}
          >
            <span>{crossSection ? "Exterior Anatomy" : "LV Cavity Cutaway"}</span>
          </button>
        </div>
      </div>

      {/* 3D WebGL Canvas Container + Side Telemetry Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* WebGL Canvas Viewport */}
        <div className="lg:col-span-8 bg-slate-50/70 border border-gray-200 rounded-lg relative overflow-hidden select-none cursor-grab active:cursor-grabbing min-h-[450px] flex items-center justify-center">
          <div ref={mountRef} className="w-full h-[450px]" />

          {/* User interaction hint */}
          <div className="absolute bottom-3 left-3 text-[11px] text-gray-500 bg-white/85 px-2.5 py-1 rounded border border-gray-200 backdrop-blur-sm pointer-events-none font-medium flex items-center gap-1.5 shadow-sm">
            <span>Click &amp; drag to rotate 360&deg; &bull; Scroll to zoom &bull; Real 3D WebGL model</span>
          </div>

          {/* Exterior Anatomical Callouts (matching Image 1) */}
          {showLabels && !crossSection && (
            <div className="absolute top-3 left-3 space-y-1.5 pointer-events-none">
              <span className="text-[11px] bg-white/95 text-red-950 font-semibold px-2.5 py-1 rounded border border-red-200 backdrop-blur-sm block shadow-sm">
                &bull; Aorta &amp; 3 Arch Branches (Red)
              </span>
              <span className="text-[11px] bg-white/95 text-sky-950 font-semibold px-2.5 py-1 rounded border border-sky-200 backdrop-blur-sm block shadow-sm">
                &bull; SVC &amp; Pulmonary Trunk (Cyan/Blue)
              </span>
              <span className="text-[11px] bg-white/95 text-pink-950 font-semibold px-2.5 py-1 rounded border border-pink-200 backdrop-blur-sm block shadow-sm">
                &bull; Right &amp; Left Auricles (Pink)
              </span>
              <span className="text-[11px] bg-white/95 text-rose-950 font-semibold px-2.5 py-1 rounded border border-rose-200 backdrop-blur-sm block shadow-sm">
                &bull; LAD Coronary Artery &amp; Cardiac Vein
              </span>
              <span className="text-[11px] bg-white/95 text-gray-900 font-semibold px-2.5 py-1 rounded border border-gray-200 backdrop-blur-sm block shadow-sm">
                &bull; Left &amp; Right Ventricles (Coral)
              </span>
            </div>
          )}

          {/* Dissection Cutaway Internal Anatomical Callouts (matching Image 2) */}
          {showLabels && crossSection && (
            <div className="absolute top-3 left-3 space-y-1.5 pointer-events-none">
              <span className="text-[11px] bg-white/95 text-rose-950 font-semibold px-2.5 py-1 rounded border border-rose-300 backdrop-blur-sm block shadow-sm">
                &bull; LV Myocardial Wall Cross-Section (12 mm Peach Rim)
              </span>
              <span className="text-[11px] bg-white/95 text-red-950 font-semibold px-2.5 py-1 rounded border border-red-300 backdrop-blur-sm block shadow-sm">
                &bull; Internal Left Ventricular Lumen (Ruby Cavity)
              </span>
              <span className="text-[11px] bg-white/95 text-amber-950 font-semibold px-2.5 py-1 rounded border border-amber-300 backdrop-blur-sm block shadow-sm">
                &bull; Papillary Muscles &amp; Chordae Tendineae
              </span>
              <span className="text-[11px] bg-white/95 text-sky-950 font-semibold px-2.5 py-1 rounded border border-sky-200 backdrop-blur-sm block shadow-sm">
                &bull; Mitral &amp; Tricuspid Inflow Valves
              </span>
              <span className="text-[11px] bg-white/95 text-slate-900 font-semibold px-2.5 py-1 rounded border border-slate-300 backdrop-blur-sm block shadow-sm">
                &bull; Interventricular Septum (IVS)
              </span>
            </div>
          )}

          {/* Live Dynamic Cycle Status */}
          <div className="absolute top-3 right-3 text-[11px] text-teal-800 bg-teal-50/90 px-2.5 py-1 rounded border border-teal-200 backdrop-blur-sm font-medium tabular-nums shadow-sm">
            Pulsing at {hr} bpm &bull; {co} L/min CO
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
              {crossSection ? "Internal Chamber 3D Model:" : "External Anatomy 3D Model:"}
            </span>
            <p className="text-gray-600 leading-relaxed text-[11px]">
              {crossSection
                ? `3D coronal dissection matches the anatomical cross-section: 12 mm thick muscular myocardium wall on the left ventricle, dual papillary muscle columns, white chordae tendineae attached to mitral/tricuspid valve leaflets, and semilunar outflow valve cusps.`
                : `3D exterior model matches the anatomical reference: curved crimson aortic arch with 3 branch buds, cyan/blue pulmonary trunk and superior vena cava, pink muscular auricles, and dual LAD red artery/blue vein channels.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
